package expo.modules.audioencode

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import java.net.URLDecoder
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

class AudioEncodeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioEncode")

    Function("isAvailable") {
      true
    }

    AsyncFunction("encodeWavToM4a") { inputUri: String, outputUri: String, quality: String ->
      encodeWavToM4a(inputUri, outputUri, quality == "low")
    }
  }

  private fun encodeWavToM4a(inputUri: String, outputUri: String, lowQuality: Boolean) {
    val inputFile = fileFromUri(inputUri)
    val outputFile = fileFromUri(outputUri)
    if (!inputFile.exists()) {
      throw EncodeException("INPUT_MISSING", "WAV input file was not found.")
    }
    outputFile.parentFile?.mkdirs()
    if (outputFile.exists() && !outputFile.delete()) {
      throw EncodeException("OUTPUT_LOCKED", "Could not replace the existing M4A file.")
    }

    val wav = readWavPcm16(inputFile)
    val targetRate = snapAacSampleRate(wav.sampleRate)
    val bitRate = if (lowQuality) 64_000 else 192_000
    val channelCount = if (lowQuality) 1 else wav.channels.coerceIn(1, 2)

    var pcm =
      if (channelCount == wav.channels) {
        wav.pcm
      } else {
        downmixToMono(wav.pcm, wav.channels)
      }
    if (targetRate != wav.sampleRate) {
      pcm = resamplePcm16(pcm, channelCount, wav.sampleRate, targetRate)
    }

    val format =
      MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, targetRate, channelCount).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, maxOf(16384, 1024 * channelCount * 2 * 4))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        }
      }

    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    } catch (error: Exception) {
      codec.release()
      throw EncodeException(
        "CODEC_CONFIG",
        "AAC encoder rejected format (${targetRate} Hz, $channelCount ch): ${error.message}"
      )
    }
    codec.start()

    val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trackIndex = -1
    var muxerStarted = false
    var wroteSamples = false

    try {
      var pcmOffset = 0
      var inputDone = false
      var outputDone = false
      val bufferInfo = MediaCodec.BufferInfo()
      val bytesPerFrame = 1024 * channelCount * 2
      var presentationTimeUs = 0L

      while (!outputDone) {
        if (!inputDone) {
          val inputIndex = codec.dequeueInputBuffer(10_000)
          if (inputIndex >= 0) {
            val inputBuffer =
              codec.getInputBuffer(inputIndex)
                ?: throw EncodeException("CODEC", "AAC encoder input buffer missing.")
            inputBuffer.clear()
            if (pcmOffset >= pcm.size) {
              codec.queueInputBuffer(
                inputIndex,
                0,
                0,
                presentationTimeUs,
                MediaCodec.BUFFER_FLAG_END_OF_STREAM
              )
              inputDone = true
            } else {
              val chunk = min(bytesPerFrame, min(pcm.size - pcmOffset, inputBuffer.remaining()))
              // MediaCodec AAC wants little-endian PCM; keep even frame size.
              val evenChunk = chunk - (chunk % (channelCount * 2))
              if (evenChunk <= 0) {
                codec.queueInputBuffer(
                  inputIndex,
                  0,
                  0,
                  presentationTimeUs,
                  MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
                inputDone = true
              } else {
                inputBuffer.put(pcm, pcmOffset, evenChunk)
                codec.queueInputBuffer(inputIndex, 0, evenChunk, presentationTimeUs, 0)
                val frames = evenChunk / (channelCount * 2)
                presentationTimeUs += frames * 1_000_000L / targetRate
                pcmOffset += evenChunk
              }
            }
          }
        }

        when (val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)) {
          MediaCodec.INFO_TRY_AGAIN_LATER -> Unit
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            if (muxerStarted) {
              throw EncodeException("MUXER", "Unexpected AAC format change.")
            }
            trackIndex = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxerStarted = true
          }
          else -> {
            if (outputIndex >= 0) {
              val encoded =
                codec.getOutputBuffer(outputIndex)
                  ?: throw EncodeException("CODEC", "AAC encoder output buffer missing.")
              if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                bufferInfo.size = 0
              }
              if (bufferInfo.size > 0) {
                if (!muxerStarted) {
                  throw EncodeException("MUXER", "AAC muxer was not started.")
                }
                encoded.position(bufferInfo.offset)
                encoded.limit(bufferInfo.offset + bufferInfo.size)
                muxer.writeSampleData(trackIndex, encoded, bufferInfo)
                wroteSamples = true
              }
              outputDone = bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
              codec.releaseOutputBuffer(outputIndex, false)
            }
          }
        }
      }
    } finally {
      try {
        codec.stop()
      } catch (_: Exception) {
      }
      codec.release()
      try {
        if (muxerStarted) {
          muxer.stop()
        }
      } catch (_: Exception) {
      }
      muxer.release()
    }

    if (!wroteSamples || !outputFile.exists() || outputFile.length() == 0L) {
      if (outputFile.exists()) {
        outputFile.delete()
      }
      throw EncodeException("ENCODE_FAILED", "Failed to encode audio to M4A.")
    }
  }

  private data class WavPcm16(
    val sampleRate: Int,
    val channels: Int,
    val pcm: ByteArray
  )

  private fun snapAacSampleRate(sampleRate: Int): Int {
    val supported = intArrayOf(8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000)
    return supported.minBy { abs(it - sampleRate) }
  }

  private fun resamplePcm16(
    pcm: ByteArray,
    channels: Int,
    fromRate: Int,
    toRate: Int
  ): ByteArray {
    if (fromRate == toRate || pcm.isEmpty()) {
      return pcm
    }
    val frameBytes = channels * 2
    val inFrames = pcm.size / frameBytes
    if (inFrames <= 1) {
      return pcm
    }
    val outFrames = maxOf(1, ((inFrames.toLong() * toRate) / fromRate).toInt())
    val out = ByteArray(outFrames * frameBytes)
    val src = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val dst = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    for (outFrame in 0 until outFrames) {
      val srcPos = outFrame.toDouble() * (inFrames - 1).toDouble() / (outFrames - 1).toDouble()
      val i0 = srcPos.toInt().coerceIn(0, inFrames - 2)
      val i1 = i0 + 1
      val t = (srcPos - i0).toFloat()
      for (ch in 0 until channels) {
        val s0 = src.get(i0 * channels + ch).toInt()
        val s1 = src.get(i1 * channels + ch).toInt()
        val mixed = (s0 + ((s1 - s0) * t)).roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
        dst.put(outFrame * channels + ch, mixed.toShort())
      }
    }
    return out
  }

  private fun readWavPcm16(file: File): WavPcm16 {
    RandomAccessFile(file, "r").use { raf ->
      val riff = ByteArray(4)
      raf.readFully(riff)
      if (String(riff) != "RIFF") {
        throw EncodeException("WAV", "Not a RIFF WAV file.")
      }
      raf.skipBytes(4)
      raf.readFully(riff)
      if (String(riff) != "WAVE") {
        throw EncodeException("WAV", "Not a WAVE file.")
      }

      var sampleRate = 0
      var channels = 0
      var bitsPerSample = 0
      var pcm: ByteArray? = null

      while (raf.filePointer < raf.length()) {
        raf.readFully(riff)
        val chunkSizeBuf = ByteArray(4)
        raf.readFully(chunkSizeBuf)
        val chunkSize =
          ByteBuffer.wrap(chunkSizeBuf).order(ByteOrder.LITTLE_ENDIAN).int.toLong() and 0xffffffffL
        val chunkId = String(riff)
        when (chunkId) {
          "fmt " -> {
            val fmt = ByteArray(chunkSize.toInt())
            raf.readFully(fmt)
            val fmtBuf = ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN)
            val audioFormat = fmtBuf.short.toInt() and 0xffff
            channels = fmtBuf.short.toInt() and 0xffff
            sampleRate = fmtBuf.int
            fmtBuf.int // byte rate
            fmtBuf.short // block align
            bitsPerSample = fmtBuf.short.toInt() and 0xffff
            if (audioFormat != 1 || bitsPerSample != 16) {
              throw EncodeException("WAV", "Only 16-bit PCM WAV is supported for M4A export.")
            }
            if (chunkSize % 2L == 1L) {
              raf.skipBytes(1)
            }
          }
          "data" -> {
            val data = ByteArray(chunkSize.toInt())
            raf.readFully(data)
            pcm = data
            if (chunkSize % 2L == 1L) {
              raf.skipBytes(1)
            }
            break
          }
          else -> {
            raf.skipBytes(chunkSize.toInt())
            if (chunkSize % 2L == 1L) {
              raf.skipBytes(1)
            }
          }
        }
      }

      val pcmBytes = pcm ?: throw EncodeException("WAV", "WAV file has no data chunk.")
      if (sampleRate <= 0 || channels <= 0) {
        throw EncodeException("WAV", "WAV format chunk is incomplete.")
      }
      return WavPcm16(sampleRate, channels, pcmBytes)
    }
  }

  private fun downmixToMono(pcm: ByteArray, channels: Int): ByteArray {
    if (channels <= 1) {
      return pcm
    }
    val frames = pcm.size / (channels * 2)
    val mono = ByteArray(frames * 2)
    val src = ByteBuffer.wrap(pcm).order(ByteOrder.LITTLE_ENDIAN)
    val dst = ByteBuffer.wrap(mono).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until frames) {
      var sum = 0
      for (c in 0 until channels) {
        sum += src.short.toInt()
      }
      dst.putShort((sum / channels).toShort())
    }
    return mono
  }

  /** Expo File URIs often percent-encode spaces; Java File needs the decoded path. */
  private fun fileFromUri(uri: String): File {
    val trimmed = uri.trim()
    if (trimmed.startsWith("file:")) {
      val parsed = Uri.parse(trimmed)
      val path = parsed.path
      if (!path.isNullOrEmpty()) {
        return File(URLDecoder.decode(path, StandardCharsets.UTF_8.name()))
      }
    }
    return File(URLDecoder.decode(trimmed, StandardCharsets.UTF_8.name()))
  }
}

private class EncodeException(code: String, message: String) : CodedException(code, message, null)
