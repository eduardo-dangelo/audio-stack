# Feature inventory

Status: `locked` = must not regress · `evolving` = still iterating

Keep entries thin: one-sentence What, 2–5 Paths, 2–4 Invariants. Newest first.

<!-- Entries below -->

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
- What: StoreKit tiers via expo-iap with Lite free limits, Plus lifetime, Pro monthly; hard gates + upgrade prompts open a 3-column paywall.
- Paths: `src/billing/`, `src/components/PaywallModal.tsx`, `src/components/UpgradePromptHost.tsx`, `app/paywall.tsx`, `app/_layout.tsx`
- Invariants: Effective tier is Pro > Plus > Lite; Lite caps 10 recordings / 5 playable layers and blocks custom effects, folders, merge, loop, import, export; Plus exports m4a only (wav/.vcr → Pro); Lite Export opens paywall before format picker; gated actions open paywall directly with a reason subtitle; paywall uses in-editor Modal when MemoEditor is open else `/paywall` `containedTransparentModal`; comparison is a row-aligned opaque table (no Restore on sheet — Settings keeps Restore); a closed Duo rail shortens the sheet, keeps it full width, and squeezes the table to fit with no scroll; an open Duo, other iPhones, and iPad stay content-height; `__DEV__` Dev Tier override only.
- Updated: 2026-11-02

### Audio Stack rename
- Status: evolving
- What: Product rebranded to Audio Stack; project packages export as `.vcr` and still import legacy `.vmp`.
- Paths: `app.json`, `src/storage/memoPackageFormat.ts`, `src/actions/shareMemo.ts`, `landing/index.html`, `landing/privacy.html`
- Invariants: Bundle ID / scheme / UTI stay `voicememosplus`; new packages use format `audio-stack-project`; legacy `voicer-pro-project`, `voice-memos-plus-project`, and `.vmp` still open; capture temps use `Documents/audio-stack`.
- Updated: 2026-11-02

### iPhone Duo side column
- Status: evolving
- What: On an iPhone, a closed side-column inset or a regular size class moves home, memo-list, and editor icon buttons into the column in black and white. The editor glass platter is only the closed column.
- Paths: `src/hooks/useDuoSideColumn.ts`, `src/components/RecordingsSplitView.tsx`, `src/components/RecordingsList.tsx`, `src/components/RecordingRow.tsx`, `src/components/MemoEditor.tsx`
- Invariants: iPad, including mini and Split View, keeps the split view, current headers, and hidden list mini tracks; portrait iPhone keeps its header; the open Duo uses the phone list stack, column icons, and expanded mini tracks. The open editor stays a full screen.
- Updated: 2026-10-23
