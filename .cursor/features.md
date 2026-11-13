# Feature inventory

Status: `locked` = must not regress · `evolving` = still iterating

Keep entries thin: one-sentence What, 2–5 Paths, 2–4 Invariants. Newest first.

<!-- Entries below -->

### Android mid-play wet effects
- Status: evolving
- What: Android mid-play reverb/delay toggles arm wet sources without full playback resync; IR length capped to cut cathedral crackle.
- Paths: `src/audio/MemoAudioEngine.ts`, `src/audio/layerEffectChain.ts`, `src/audio/memoMixGraph.ts`, `src/components/MemoEditor.tsx`
- Invariants: Android wet on/off uses additive arm/disarm (no `resyncPlaybackAtCurrentTime`); Android keeps wet bus while preset is on (mix 0↔>0 is send-gain); Android IR duration capped at 2.5s; Android decay IR key quantized to 0.1 with ~300ms idle assign; Android wet send gain ramps ~25ms; reverb tool open prewarms named IRs; iOS keeps uncapped IR + full wet-path resync.
- Updated: 2026-11-13

### Precount metronome sync
- Status: evolving
- What: Android precount clicks and recording start arm on the AudioContext grid from `contextStart`; iOS keeps Modal dismiss wait + Phase B re-clamp.
- Paths: `src/components/MemoEditor.tsx`, `src/audio/MemoAudioEngine.ts`, `src/audio/metronome.ts`, `src/audio/postPrecountTiming.ts`, `src/components/PrecountOverlay.tsx`
- Invariants: Android sound precount schedules clicks at `contextStart + n*interval`; Android leaves ~100ms before wall downbeat then dismisses in ~16ms and arms `contextStart+4*interval`; iOS still waits Modal onDismiss (~250ms) then `computePostPrecountContextWhen`; Android precount numerals have no enter/exit fade; live bars sync via early peak emits + UI-clock bar count (see Recording UI audio clock).
- Updated: 2026-11-13

### Android splash wordmark
- Status: evolving
- What: Android splash uses a uniformly scaled full mark (original proportions) so it fits the system circular mask; iOS keeps the full splash.
- Paths: `app.json`, `assets/images/splash-icon-android.png`, `assets/images/splash-icon-android-dark.png`
- Invariants: Android splash assets are uniform full-mark scale centered for the circle; iOS still uses `splash-icon.png` / dark; `expo prebuild --platform android` required after asset changes before rebuild.
- Updated: 2026-11-12

### Paywall Android polish
- Status: evolving
- What: Android paywall uses AppSymbol chrome; upgrade burst shows Material particles; Settings/plans recommends the next tier when no feature reason.
- Paths: `src/components/PaywallModal.tsx`, `src/components/AppSymbol.tsx`, `src/components/UpgradeCelebration.tsx`, `src/components/UpgradeWelcomeModal.tsx`, `src/billing/BillingProvider.tsx`, `app/index.tsx`
- Invariants: Android close is flat 48dp (no glass circle); feature ticks/icons via AppSymbol; Android burst uses 8 particles and a static tier badge (no ZoomIn); iOS badge still springs; celebration starts before Quiet Light write; no-reason paywall recommends Plus for Lite and Pro for Plus; Android Plus mark uses AppSymbol + SvgText (15/600 like Pro, accent fill); iOS Plus keeps Text; welcome unlock rows use AppSymbol; Android welcome Modal has no fade; home GroupedList + RecordingRow folder badge use AppSymbol; RecordingPromptDialog icons via AppSymbol.
- Updated: 2026-11-12

### Recording UI audio clock
- Status: evolving
- What: Android recording follow slides timeline via translateX from `getRecordingTime`; timer uses the same follow clock; live bars use peak duration only (no clock stretch).
- Paths: `src/components/WaveformView.tsx`, `src/components/MemoEditor.tsx`, `src/components/metronomeGridViewport.ts`, `src/audio/MemoAudioEngine.ts`
- Invariants: Android capture parks ScrollView at 0 and moves translateX from a UI-thread clock anchored to `getRecordingTime` (max 1s extrapolation, anchor ~50ms); enter/exit/background snap translateX and disable the frame callback; follow RAF does not restart on contentWidth; between anchors Android follow RAF reschedules without native clock/layout/buffer work; iOS recording still `scrollTo`; Android recording label from `onLiveTimelineTime` at ~50ms anchors; Android MemoEditor skips `recordingDuration` shell re-renders during capture (peaks via LiveRecordingWaveform, applied ~120ms); Android recording paint overscan ~0.5vp/side (iOS keeps wide buffers); Android live Svg sized to paint buffer and path-throttled ~300ms; Android early peak emits ~50ms for 1.5s + onAudioReady (steady ~100ms, timer skips if emit within ~40ms); Android skips recordingDuration RAF loop after initial emit; Android live preview is untrimmed and bar count follows UI elapsed (post-save latency trim unchanged); Android follow elapsed is max(fileDuration, cue-context); iOS live preview still blanks until lead clears.
- Updated: 2026-11-13

### Playback UI audio clock
- Status: evolving
- What: Editor timer/playhead follow the audio clock; Android playback slides via UI-thread translateX; store `currentTime` stays coarse (~50ms) without advance capping.
- Paths: `src/audio/MemoAudioEngine.ts`, `src/components/MemoEditor.tsx`, `src/components/WaveformView.tsx`
- Invariants: Engine emits raw elapsed time (no max-advance); Android playback parks ScrollView at 0 and moves translateX from a UI-thread clock anchored to `getPlaybackTime` (~50ms anchors, max 1s extrapolate); Android timer emits extrapolated follow time between those anchors (no raw catch-up jumps; no separate playback RAF); iOS playback still `scrollTo` + store-driven label; scrub handoff disables translate before pause; auto-follow does not overwrite scrollOffset from onScroll.
- Updated: 2026-11-12

### Android UI jank
- Status: evolving
- What: Cut Android JS-thread load from per-row Modals and triple route polls; use short opacity fades instead of iOS layout/springs.
- Paths: `src/components/listTransitions.ts`, `src/components/RecordingsList.tsx`, `src/components/RecordingRow.tsx`, `src/components/Collapsible.tsx`, `app/_layout.tsx`, `src/components/MemoOptionsMenu.tsx`, `src/components/MemoEditor.tsx`, `src/components/PlaybackControls.tsx`, `src/components/MiniWaveformTracks.tsx`, `src/audio/audioInputRouting.ts`, `src/audio/headphoneDetection.ts`
- Invariants: IconActionSheet mounts only while open; editor/home Android 2s route polls pause while recording (event-driven refresh remains); Android uses ~120ms opacity fades (no LinearTransition/itemLayoutAnimation/springs); Android memo uses card not formSheet; Collapsible ~120ms on Android; Android editor footer uses inset floor + 24dp extra gap; Android reserves footer while loading and mounts waveform only when layoutReady; playhead hidden until viewport laid out; tool-strip icons 18 on Android; Android editor does not re-render on every `recordingDuration` tick during capture; Android Stop fires on press-in with local pending chrome (Pressable stays enabled for ripple); stop calls `suspendRecordingUiEmits` then `setTimeout(0)` before sync `stopRecorderCapture` (iOS still RAF-yields after shell isStopping); mini-track played tint uses UI-thread clip to playhead X with static SVG paths; Android scrub seeks ~100ms (iOS ~32ms); Android skips haptics when capture arms and when editor stop is pressed (RecordButton + save-success still haptic).
- Updated: 2026-11-12

### Android editor more menu
- Status: evolving
- What: Android … menus use IconActionSheet (48dp trigger, 320-wide list) instead of thin Material DropdownMenu.
- Paths: `src/components/MemoOptionsMenu.tsx`, `src/components/IconActionSheet.tsx`, `src/components/MemoEditor.tsx`, `src/components/AppSymbol.tsx`
- Invariants: iOS ThemedMenuView unchanged; Android trigger min 48×48; IconActionSheet maxWidth 320; sheet rows use AppSymbol (SF→Material); editor ellipsis regular size on Android.
- Updated: 2026-11-11

### Android action sheet list
- Status: evolving
- What: Android choice sheets (export format, stack/replace, move folder) use a vertical list modal instead of horizontal Alert buttons.
- Paths: `src/utils/showActionSheet.ts`, `src/components/AndroidActionSheetHost.tsx`, `app/_layout.tsx`
- Invariants: iOS ActionSheetIOS unchanged; cancel row secondary + divider; destructive uses recordRed; confirm Alerts stay Alert.alert.
- Updated: 2026-11-11

### Android builtin mic pin
- Status: evolving
- What: Expo plugin makes Android `setInputDevice` real so headphones-on recording uses the phone mic via Oboe `setDeviceId`.
- Paths: `plugins/withAndroidBuiltinMicPin.js`, `src/audio/audioInputRouting.ts`
- Invariants: Preferred input id stored in MediaSessionManager; pinned capture opens Shared mono 44.1kHz AAudio (not Exclusive) so duplex stack does not break the WAV converter; `pinBuiltInMicrophone` unchanged in JS; needs native Android rebuild after plugin apply.
- Updated: 2026-11-11

### Android headphone detection
- Status: evolving
- What: Normalize Android `availableOutputs` type strings (and iOS categories) so wired/BT unlock metronome clicks and skip the stack headphones warning.
- Paths: `src/audio/headphoneDetection.ts`, `src/audio/audioInputRouting.ts`
- Invariants: Android uses `availableOutputs` + type→category map (`currentOutputs` empty); `some(headphone)` not speaker-only; AppState + 2s Android poll; route snapshot prefers BuiltInMic when `currentInputs` empty and HFP only from primary categories; `ALLOW_METRONOME_WITHOUT_HEADPHONES` stays false.
- Updated: 2026-11-11

### Android Material buttons
- Status: evolving
- What: Android header/transport use flat Material IconButton + TextButton chrome; iOS keeps glass circles.
- Paths: `src/components/FloatingHeaderButton.tsx`, `src/components/MetronomeButton.tsx`, `src/components/PrecountButton.tsx`
- Invariants: Android has no elevated circle/pill; 48dp hit targets with ripple; icons centered; iOS glass path unchanged.
- Updated: 2026-11-11

### Android UI chrome
- Status: evolving
- What: Material icon mapping via AppSymbol; MemoEditor in-body header on Android formSheet.
- Paths: `src/components/AppSymbol.tsx`, `src/components/FloatingHeaderButton.tsx`, `src/components/MemoEditor.tsx`, `src/components/track-editor/EditorToolStrip.tsx`
- Invariants: iOS SF Symbols unchanged; Android uses Material names + text fallback; track menu Change Color maps `paintpalette` → `palette`; editor header shows More/title/Done in-body on Android; toolbar tools keep accent tint when selected/applied.
- Updated: 2026-11-13

### Android first APK
- Status: evolving
- What: Expo Android platform config + stubs so a debug APK can launch beside the existing iOS app.
- Paths: `app.json`, `src/utils/showActionSheet.ts`, `src/widgets/RecordingLiveActivity.android.tsx`, `src/actions/shareMemo.ts`, `assets/images/icon.png`, `assets/images/android-icon-foreground.png`, `assets/images/android-icon-background.png`, `assets/images/android-icon-monochrome.png`
- Invariants: iOS StoreKit/Live Activities unchanged; Android uses Alert sheets; M4A/multi-share/project native modules remain iOS-only; Live Activity is a no-op on Android; Android launcher adaptive icons use the headphones + waveform mark (same as iOS/landing, not red Expo placeholders); `expo prebuild --platform android` required after icon asset changes before rebuild.
- Updated: 2026-11-13

### Landing brand icon
- Status: evolving
- What: Landing header/footer/favicon use the App Icon headphones + waveform mark (light/dark).
- Paths: `landing/assets/icon.png`, `landing/assets/icon-dark.png`, `landing/index.html`, `landing/privacy.html`
- Invariants: Light mark is black on white–gray fill; dark mark is white on `#0F0F0F`; theme-logo swaps via `data-light-src` / `data-dark-src`.
- Updated: 2026-11-09

### Scroll Settings into view
- Status: evolving
- What: Opening Settings from the home gear scrolls the list so the Settings header is visible.
- Paths: `app/index.tsx`, `src/components/GroupedList.tsx`
- Invariants: Scroll only when Settings opens (not on close); header sits near the top of the visible area; GroupedListScreen exposes a ScrollView ref.
- Updated: 2026-11-08

### Custom EQ band types
- Status: evolving
- What: Custom EQ lets each selected band choose Peak / Low shelf / High shelf / Low pass / High pass / Notch via curve-shape icons.
- Paths: `src/audio/layerEffects.ts`, `src/audio/layerEffectChain.ts`, `src/components/track-editor/primitives/EqCurveChart.tsx`, `src/components/track-editor/primitives/EqFilterTypeIcon.tsx`
- Invariants: Missing types normalize to peaking; LP/HP/notch lock gain at 0 dB; curve and DSP use the selected biquad type; type control uses shape icons with text accessibility labels.
- Updated: 2026-11-04

### Custom delay Advanced
- Status: evolving
- What: Custom Delay sheet keeps Time/Mix/Feedback; Advanced expands tempo Sync pills.
- Paths: `src/components/track-editor/EffectCustomDialog.tsx`
- Invariants: Advanced resets closed when the dialog closes; picking a division sets sync + timeMs; dragging Time sets sync off.
- Updated: 2026-11-04

### Editor slider subtitle
- Status: evolving
- What: Volume, pan, and pitch live values show in the memo header caption while that tool is open (same slot as zoom).
- Paths: `src/components/track-editor/formatLayerEffectCaption.ts`, `src/components/MemoEditor.tsx`
- Invariants: Priority is error → save phase → effect caption → zoom; volume is signed dB, pan is C/L/R, pitch is signed st.
- Updated: 2026-11-04

### Pitch
- Status: evolving
- What: Pro-only per-layer duration-preserving pitch (±12 semitones) via editor strip after Pan.
- Paths: `src/audio/layerEffects.ts`, `src/audio/layerPitch.ts`, `src/audio/MemoAudioEngine.ts`, `src/components/track-editor/editors/PitchEditor.tsx`, `src/billing/capabilities.ts`
- Invariants: Stretch (`pitchCorrection`) only when pitch ≠ 0; live detune while pitched, resync only on 0↔nonzero; metronome unpitched; timeline length unchanged; Lite/Plus open paywall; open Pitch shows value in header caption.
- Updated: 2026-11-04

### iPhone Duo scene lifecycle
- Status: evolving
- What: iPhone Duo launches through one UIScene; the side column stays a safe-area inset, not a second scene.
- Paths: `plugins/withIosSceneLifecycle.js`, `app.json`
- Invariants: One application scene; React Native starts from `UIWindow(windowScene:)`; cold-start and later URLs still reach Linking.
- Updated: 2026-11-02

### iOS pod deployment target
- Status: evolving
- What: Pod targets below iOS 15 are raised to the app deployment target during prebuild.
- Paths: `plugins/withIosPodDeploymentTarget.js`, `app.json`
- Invariants: Targets already at 15.1 or higher stay unchanged; the floor is the Podfile deployment target (default 16.4).
- Updated: 2026-11-02

### Lite / Plus / Pro billing
- Status: evolving
- What: StoreKit tiers via expo-iap with Lite free limits, Plus lifetime (£9.99), Pro yearly (£19.99); hard gates + upgrade prompts open a 3-column paywall.
- Paths: `src/billing/`, `src/components/PaywallModal.tsx`, `src/components/UpgradePromptHost.tsx`, `app/paywall.tsx`, `app/_layout.tsx`
- Invariants: Effective tier is Pro > Plus > Lite; Pro requires a yearly subscription with StoreKit isActive (not purchase history or inactive rows); Plus is lifetime from non-consumable ownership; entering Pro via a user-initiated purchase or Dev Tier applies Quiet Light timed with the Pro mark and a short jackpot celebration then a Welcome modal listing unlocked features with Enjoy (Pro’s Everything in Plus row expands Plus features inline; Plus purchase/Dev Plus celebrate without forced theme; StoreKit redelivery on launch does not celebrate); home Plus/Pro marks zoom in only on upgrade, not on cold open; cold open splash includes Audio Stack title under the mark; Settings Appearance shows the same Light/Dark/Solarized list and Select Theme row on every tier; locked Solarized/Select Theme open the paywall, and only Pro opens the Select Theme modal; `__DEV__` Dev Tier applies immediately and switching back to Store re-reads StoreKit; Lite caps 10 recordings / 5 playable layers, allows import of audio and project files, and blocks custom effects, folders, merge, loop, export, duplicate, and pitch; Plus exports m4a only and includes merge with Pro; duplicate, loop, and pitch are Pro-only, as are wav/.aud; Lite Export opens paywall before format picker; gated actions open paywall directly with a reason subtitle; paywall uses in-editor Modal when MemoEditor is open else `/paywall` `containedTransparentModal`; comparison is a row-aligned opaque table grouped as every tier, then Plus and Pro, then Pro only (no Restore on the paywall sheet — Settings shows Restore for all tiers); a closed Duo rail shortens the sheet, keeps it full width, and squeezes the table to fit with no scroll; an open Duo, other iPhones, and iPad stay content-height; Plus and Pro carry a symbol, only the recommended column is outlined on all four sides, and the table has no Soon row; each comparison row uses the in-app symbol and the label column is only as wide as the longest name; when a column is outlined it is wider than the other tiers by taking space from Lite; the reason row highlights across the full row; Buy and Subscribe hug their text; each subtitle is one slightly longer sentence; the home title stays “Audio Stack” on Lite and gains the Plus or Pro mark for those tiers; the Pro mark is a diagonal sheen of blue tones; Solarized Light/Dark apply on Plus and Pro; named IDE themes (Tinted Blue, Tinted Red, Quiet Light, Monokai, Dracula, Nord, Gruvbox, Tokyo Night, Cyberpunk, Rose Pine, Everforest, Terminal, Sepia) apply on Pro only; System, Light, and Dark apply on every tier; a gated theme id is kept and the app applies System until the tier allows it; `__DEV__` Dev Tier override only.
- Updated: 2026-11-08

### Audio Stack rename

- Status: evolving
- What: Product rebranded to Audio Stack; project packages export as `.aud` and still import legacy `.vmp`.
- Paths: `app.json`, `src/storage/memoPackageFormat.ts`, `src/actions/shareMemo.ts`, `landing/index.html`, `landing/privacy.html`
- Invariants: Bundle ID / scheme / UTI stay `voicememosplus`; new packages use format `audio-stack-project` and export as `.aud`; legacy `voicer-pro-project`, `voice-memos-plus-project`, and `.vmp` still open; `.vcr` does not; capture temps use `Documents/audio-stack`.
- Updated: 2026-11-02

### iPhone Duo side column
- Status: evolving
- What: On an iPhone, a closed side-column inset or a regular size class moves home, memo-list, and editor icon buttons into the column in black and white. The editor glass platter is only the closed column.
- Paths: `src/hooks/useDuoSideColumn.ts`, `src/components/RecordingsSplitView.tsx`, `src/components/RecordingsList.tsx`, `src/components/RecordingRow.tsx`, `src/components/MemoEditor.tsx`
- Invariants: iPad, including mini and Split View, keeps the split view, current headers, and hidden list mini tracks; portrait iPhone keeps its header; the open Duo uses the phone list stack, column icons, and expanded mini tracks. The open editor stays a full screen.
- Updated: 2026-10-23
