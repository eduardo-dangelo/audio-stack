import ExpoModulesCore
import AVFoundation

public class AudioEncodeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioEncode")

    Function("isAvailable") {
      return true
    }

    AsyncFunction("encodeWavToM4a") { (inputUri: String, outputUri: String, quality: String) in
      let inputURL = Self.fileURL(from: inputUri)
      let outputURL = Self.fileURL(from: outputUri)

      if FileManager.default.fileExists(atPath: outputURL.path) {
        try FileManager.default.removeItem(at: outputURL)
      }

      if quality == "low" {
        try await Self.encodeLowQualityM4a(inputURL: inputURL, outputURL: outputURL)
      } else {
        try await Self.encodeHighQualityM4a(inputURL: inputURL, outputURL: outputURL)
      }
    }
  }

  private static func encodeHighQualityM4a(inputURL: URL, outputURL: URL) async throws {
    let asset = AVURLAsset(url: inputURL)

    guard let exportSession = AVAssetExportSession(
      asset: asset,
      presetName: AVAssetExportPresetAppleM4A
    ) else {
      throw EncodeError.sessionCreationFailed
    }

    exportSession.outputURL = outputURL
    exportSession.outputFileType = .m4a

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      exportSession.exportAsynchronously {
        switch exportSession.status {
        case .completed:
          continuation.resume()
        case .failed:
          continuation.resume(throwing: exportSession.error ?? EncodeError.exportFailed)
        case .cancelled:
          continuation.resume(throwing: EncodeError.exportCancelled)
        default:
          continuation.resume(throwing: EncodeError.exportFailed)
        }
      }
    }
  }

  /// Lite: AAC ~64 kbps mono at the source sample rate (smaller share files).
  private static func encodeLowQualityM4a(inputURL: URL, outputURL: URL) async throws {
    let asset = AVURLAsset(url: inputURL)
    guard let audioTrack = try await asset.loadTracks(withMediaType: .audio).first else {
      throw EncodeError.sessionCreationFailed
    }

    let desc = try await audioTrack.load(.formatDescriptions).first
    let asbd = desc.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee }
    let sampleRate = asbd?.mSampleRate ?? 44_100

    let reader = try AVAssetReader(asset: asset)
    let readerOutput = AVAssetReaderTrackOutput(
      track: audioTrack,
      outputSettings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
        AVNumberOfChannelsKey: 1,
        AVSampleRateKey: sampleRate,
      ]
    )
    reader.add(readerOutput)

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
    let writerInput = AVAssetWriterInput(
      mediaType: .audio,
      outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 64_000,
      ]
    )
    writerInput.expectsMediaDataInRealTime = false
    writer.add(writerInput)

    guard reader.startReading() else {
      throw reader.error ?? EncodeError.exportFailed
    }
    guard writer.startWriting() else {
      throw writer.error ?? EncodeError.exportFailed
    }
    writer.startSession(atSourceTime: .zero)

    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      let queue = DispatchQueue(label: "audio-encode.low-m4a")
      writerInput.requestMediaDataWhenReady(on: queue) {
        while writerInput.isReadyForMoreMediaData {
          if reader.status == .failed {
            writer.cancelWriting()
            continuation.resume(throwing: reader.error ?? EncodeError.exportFailed)
            return
          }

          guard let sampleBuffer = readerOutput.copyNextSampleBuffer() else {
            writerInput.markAsFinished()
            writer.finishWriting {
              if writer.status == .completed {
                continuation.resume()
              } else {
                continuation.resume(throwing: writer.error ?? EncodeError.exportFailed)
              }
            }
            return
          }

          if !writerInput.append(sampleBuffer) {
            writer.cancelWriting()
            continuation.resume(throwing: writer.error ?? EncodeError.exportFailed)
            return
          }
        }
      }
    }
  }

  private static func fileURL(from uri: String) -> URL {
    if uri.hasPrefix("file://") {
      return URL(string: uri) ?? URL(fileURLWithPath: uri)
    }
    return URL(fileURLWithPath: uri)
  }
}

private enum EncodeError: LocalizedError {
  case sessionCreationFailed
  case exportFailed
  case exportCancelled

  var errorDescription: String? {
    switch self {
    case .sessionCreationFailed:
      return "Could not create an AAC export session."
    case .exportFailed:
      return "Failed to encode audio to M4A."
    case .exportCancelled:
      return "M4A encoding was cancelled."
    }
  }
}
