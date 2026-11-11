/**
 * react-native-audio-api 0.12.2 leaves Android setInputDevice as a noop, so
 * pinBuiltInMicrophone() never forces the phone mic when a headset is plugged
 * in. This plugin stores a preferred input device id and applies it via Oboe
 * setDeviceId when the capture stream opens.
 *
 * When a preferred device is set (duplex stack with headphones), open Shared
 * mono @ 44.1kHz so miniaudio's converter does not get Invalid argument from
 * Exclusive BuiltInMic streams.
 */
const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('expo/config-plugins');

const MARKER = 'AUDIO_STACK_BUILTIN_MIC_PIN';
const OPEN_STREAM_V2_MARKER = 'AUDIO_STACK_BUILTIN_MIC_PIN_V2';

const MEDIA_SESSION_HELPERS = `
  // ${MARKER}: preferred capture device for Oboe setDeviceId
  @Volatile
  @JvmStatic
  private var preferredInputDeviceId: Int = 0

  @JvmStatic
  fun getPreferredInputDeviceId(): Int = preferredInputDeviceId

  @JvmStatic
  @RequiresApi(Build.VERSION_CODES.M)
  fun setPreferredInputDeviceId(deviceId: String?): Boolean {
    if (deviceId == null || deviceId == "default") {
      preferredInputDeviceId = 0
      return true
    }
    val id = deviceId.toIntOrNull() ?: return false
    val match =
      audioManager
        .getDevices(AudioManager.GET_DEVICES_INPUTS)
        .firstOrNull { it.id == id }
    if (match == null) {
      return false
    }
    preferredInputDeviceId = id
    return true
  }
`;

const SET_INPUT_DEVICE_REPLACEMENT = `  // ${MARKER}
  override fun setInputDevice(
    deviceId: String?,
    promise: Promise?,
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise?.resolve(true)
      return
    }
    if (!MediaSessionManager.setPreferredInputDeviceId(deviceId)) {
      promise?.reject(
        "E_INPUT_DEVICE",
        "Input device with id $deviceId not found",
        null,
      )
      return
    }
    promise?.resolve(true)
  }`;

const SET_INPUT_DEVICE_NOOP = `  override fun setInputDevice(
    deviceId: String?,
    promise: Promise?,
  ) {
    // TODO: noop for now, but it should be moved to upcoming
    // audio engine implementation for android (duplex stream)
    promise?.resolve(true)
  }`;

const CPP_HELPER = `
// ${MARKER}
namespace {
int32_t readPreferredInputDeviceId() {
  try {
    auto cls = facebook::jni::findClassLocal(
        "com/swmansion/audioapi/system/MediaSessionManager");
    auto method = cls->getStaticMethod<jint()>("getPreferredInputDeviceId");
    return static_cast<int32_t>(method(cls));
  } catch (...) {
    __android_log_print(
        ANDROID_LOG_WARN,
        "AndroidAudioRecorder",
        "Failed to read preferred input device id");
    return 0;
  }
}
} // namespace
`;

/** V1: setDeviceId + AAudio but still Exclusive (duplex converter failures). */
const OPEN_STREAM_V1 = `  oboe::AudioStreamBuilder builder;
  // ${MARKER}: pin BuiltInMic (or other preferred input) when set from JS
  {
    const int32_t preferredDeviceId = readPreferredInputDeviceId();
    if (preferredDeviceId > 0) {
      builder.setDeviceId(preferredDeviceId);
      builder.setAudioApi(oboe::AudioApi::AAudio);
    }
  }
  builder.setSharingMode(oboe::SharingMode::Exclusive)`;

/**
 * Shared + mono 44.1kHz when pinned (matches RECORDING_SAMPLE_RATE / channelCount 1).
 * Replaces upstream Exclusive + setDirection so duplex stack does not break the WAV converter.
 */
const OPEN_STREAM_V2 = `  oboe::AudioStreamBuilder builder;
  // ${OPEN_STREAM_V2_MARKER}: pin BuiltInMic Shared mono 44.1kHz for duplex
  {
    const int32_t preferredDeviceId = readPreferredInputDeviceId();
    if (preferredDeviceId > 0) {
      builder.setDeviceId(preferredDeviceId);
      builder.setAudioApi(oboe::AudioApi::AAudio);
      builder.setSharingMode(oboe::SharingMode::Shared);
      builder.setChannelCount(1);
      builder.setSampleRate(44100);
    } else {
      builder.setSharingMode(oboe::SharingMode::Exclusive);
    }
  }
  builder.setDirection(oboe::Direction::Input)`;

const OPEN_STREAM_ORIGINAL = `  oboe::AudioStreamBuilder builder;
  builder.setSharingMode(oboe::SharingMode::Exclusive)
      ->setDirection(oboe::Direction::Input)`;

/** V1 left Exclusive then chained ->setDirection; match that for upgrades. */
const OPEN_STREAM_V1_FULL = `  oboe::AudioStreamBuilder builder;
  // ${MARKER}: pin BuiltInMic (or other preferred input) when set from JS
  {
    const int32_t preferredDeviceId = readPreferredInputDeviceId();
    if (preferredDeviceId > 0) {
      builder.setDeviceId(preferredDeviceId);
      builder.setAudioApi(oboe::AudioApi::AAudio);
    }
  }
  builder.setSharingMode(oboe::SharingMode::Exclusive)
      ->setDirection(oboe::Direction::Input)`;

function packageRoot(projectRoot) {
  return path.join(projectRoot, 'node_modules', 'react-native-audio-api');
}

function patchMediaSessionManager(projectRoot) {
  const target = path.join(
    packageRoot(projectRoot),
    'android/src/main/java/com/swmansion/audioapi/system/MediaSessionManager.kt'
  );
  if (!fs.existsSync(target)) {
    return;
  }
  let contents = fs.readFileSync(target, 'utf8');
  if (contents.includes(MARKER)) {
    return;
  }
  if (!contents.includes('fun getDevicePreferredSampleRate()')) {
    throw new Error(
      'withAndroidBuiltinMicPin: MediaSessionManager.kt missing getDevicePreferredSampleRate'
    );
  }
  contents = contents.replace(
    '  fun getDevicePreferredSampleRate(): Double {',
    `${MEDIA_SESSION_HELPERS}\n  fun getDevicePreferredSampleRate(): Double {`
  );
  fs.writeFileSync(target, contents);
}

function patchAudioAPIModule(projectRoot) {
  const target = path.join(
    packageRoot(projectRoot),
    'android/src/main/java/com/swmansion/audioapi/AudioAPIModule.kt'
  );
  if (!fs.existsSync(target)) {
    return;
  }
  let contents = fs.readFileSync(target, 'utf8');
  if (contents.includes(MARKER)) {
    return;
  }
  if (!contents.includes(SET_INPUT_DEVICE_NOOP)) {
    throw new Error(
      'withAndroidBuiltinMicPin: AudioAPIModule.kt setInputDevice noop not found'
    );
  }
  contents = contents.replace(SET_INPUT_DEVICE_NOOP, SET_INPUT_DEVICE_REPLACEMENT);
  fs.writeFileSync(target, contents);
}

function patchAndroidAudioRecorder(projectRoot) {
  const target = path.join(
    packageRoot(projectRoot),
    'android/src/main/cpp/audioapi/android/core/AndroidAudioRecorder.cpp'
  );
  if (!fs.existsSync(target)) {
    return;
  }
  let contents = fs.readFileSync(target, 'utf8');

  if (contents.includes(OPEN_STREAM_V2_MARKER)) {
    return;
  }

  // Upgrade V1 → V2 open-stream block.
  if (contents.includes(OPEN_STREAM_V1_FULL)) {
    contents = contents.replace(OPEN_STREAM_V1_FULL, OPEN_STREAM_V2);
    fs.writeFileSync(target, contents);
    return;
  }
  if (contents.includes(OPEN_STREAM_V1)) {
    contents = contents.replace(
      `${OPEN_STREAM_V1}
      ->setDirection(oboe::Direction::Input)`,
      OPEN_STREAM_V2
    );
    if (!contents.includes(OPEN_STREAM_V2_MARKER)) {
      throw new Error(
        'withAndroidBuiltinMicPin: failed to upgrade V1 openAudioStream block'
      );
    }
    fs.writeFileSync(target, contents);
    return;
  }

  if (!contents.includes(OPEN_STREAM_ORIGINAL)) {
    throw new Error(
      'withAndroidBuiltinMicPin: AndroidAudioRecorder.cpp openAudioStream builder block not found'
    );
  }

  if (!contents.includes('#include <fbjni/fbjni.h>')) {
    if (!contents.includes('#include <android/log.h>')) {
      throw new Error(
        'withAndroidBuiltinMicPin: AndroidAudioRecorder.cpp missing android/log.h include'
      );
    }
    contents = contents.replace(
      '#include <android/log.h>\n',
      `#include <android/log.h>\n#include <fbjni/fbjni.h>\n`
    );
  }

  if (!contents.includes('readPreferredInputDeviceId')) {
    if (!contents.includes('namespace audioapi {\n')) {
      throw new Error(
        'withAndroidBuiltinMicPin: AndroidAudioRecorder.cpp missing audioapi namespace'
      );
    }
    contents = contents.replace(
      'namespace audioapi {\n',
      `namespace audioapi {\n${CPP_HELPER}`
    );
  }

  contents = contents.replace(OPEN_STREAM_ORIGINAL, OPEN_STREAM_V2);
  fs.writeFileSync(target, contents);
}

function applyAndroidBuiltinMicPin(projectRoot) {
  const root = packageRoot(projectRoot);
  if (!fs.existsSync(root)) {
    return;
  }
  patchMediaSessionManager(projectRoot);
  patchAudioAPIModule(projectRoot);
  patchAndroidAudioRecorder(projectRoot);
}

function withAndroidBuiltinMicPin(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      applyAndroidBuiltinMicPin(mod.modRequest.projectRoot);
      return mod;
    },
  ]);
}

module.exports = withAndroidBuiltinMicPin;

if (require.main === module) {
  applyAndroidBuiltinMicPin(path.join(__dirname, '..'));
}
