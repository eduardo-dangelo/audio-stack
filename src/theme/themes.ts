import {
  colorWithAlpha,
  VoiceMemosColorsDark,
  VoiceMemosColorsLight,
  type VoiceMemosColorScheme,
} from '@/constants/VoiceMemosColors';
import type { ThemePreference } from '@/src/settings/appSettings';
import type { TierId } from '@/src/billing/types';

export type ThemeAppearance = 'system' | 'light' | 'dark';

export type EditorThemeChoice = {
  id: Exclude<ThemePreference, 'system'>;
  label: string;
};

const PLUS_THEME_IDS = ['solarizedLight', 'solarizedDark'] as const;

const PRO_ONLY_THEME_IDS = [
  'tintedBlue',
  'tintedRed',
  'quietLight',
  'monokai',
  'dracula',
  'nord',
  'gruvbox',
  'tokyoNight',
  'cyberpunk',
  'rosePine',
  'everforest',
  'matrix',
  'sepia',
] as const;

const PRO_THEME_IDS = [...PLUS_THEME_IDS, ...PRO_ONLY_THEME_IDS] as const;

export type PlusThemeId = (typeof PLUS_THEME_IDS)[number];
export type ProOnlyThemeId = (typeof PRO_ONLY_THEME_IDS)[number];
export type ProThemeId = (typeof PRO_THEME_IDS)[number];

/** Theme applied when entering Pro via purchase or Dev Tier. */
export const PRO_WELCOME_THEME: ProOnlyThemeId = 'quietLight';

export const FREE_APPEARANCE_THEMES: readonly EditorThemeChoice[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export const PLUS_EDITOR_THEMES: readonly EditorThemeChoice[] = [
  { id: 'solarizedLight', label: 'Solarized Light' },
  { id: 'solarizedDark', label: 'Solarized Dark' },
];

export const PRO_ONLY_EDITOR_THEMES: readonly EditorThemeChoice[] = [
  { id: 'tintedBlue', label: 'Tinted Blue' },
  { id: 'tintedRed', label: 'Tinted Red' },
  { id: 'quietLight', label: 'Quiet Light' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'dracula', label: 'Dracula' },
  { id: 'nord', label: 'Nord' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'tokyoNight', label: 'Tokyo Night' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
  { id: 'rosePine', label: 'Rose Pine' },
  { id: 'everforest', label: 'Everforest' },
  { id: 'matrix', label: 'Terminal' },
  { id: 'sepia', label: 'Sepia' },
];

/** Inline Appearance rows for Plus/Pro (before Select Theme). */
export const INLINE_EDITOR_THEMES: readonly EditorThemeChoice[] = [
  ...FREE_APPEARANCE_THEMES,
  ...PLUS_EDITOR_THEMES,
];

export const PRO_EDITOR_THEMES: readonly EditorThemeChoice[] = [
  ...PLUS_EDITOR_THEMES,
  ...PRO_ONLY_EDITOR_THEMES,
];

export const PRO_THEME_CHOICES: readonly EditorThemeChoice[] = [
  ...FREE_APPEARANCE_THEMES,
  ...PRO_EDITOR_THEMES,
];

export function isProTheme(pref: ThemePreference): pref is ProThemeId {
  return (PRO_THEME_IDS as readonly string[]).includes(pref);
}

export function isPlusTheme(pref: ThemePreference): pref is PlusThemeId {
  return (PLUS_THEME_IDS as readonly string[]).includes(pref);
}

export function isProOnlyTheme(pref: ThemePreference): pref is ProOnlyThemeId {
  return (PRO_ONLY_THEME_IDS as readonly string[]).includes(pref);
}

/** Whether this preference may be applied for the tier (system/light/dark always). */
export function canUseNamedTheme(tier: TierId, pref: ThemePreference): boolean {
  if (pref === 'system' || pref === 'light' || pref === 'dark') {
    return true;
  }
  if (isPlusTheme(pref)) {
    return tier === 'plus' || tier === 'pro';
  }
  if (isProOnlyTheme(pref)) {
    return tier === 'pro';
  }
  return false;
}

/** Plus and Pro get a theme list; Lite keeps the light/dark switch. */
export function hasThemePicker(tier: TierId): boolean {
  return tier === 'plus' || tier === 'pro';
}

export function editorThemeChoicesForTier(tier: TierId): readonly EditorThemeChoice[] {
  if (tier === 'pro') {
    return PRO_THEME_CHOICES;
  }
  if (tier === 'plus') {
    return [...FREE_APPEARANCE_THEMES, ...PLUS_EDITOR_THEMES];
  }
  return FREE_APPEARANCE_THEMES;
}

export function appearanceForTheme(pref: ThemePreference): ThemeAppearance {
  switch (pref) {
    case 'system':
      return 'system';
    case 'light':
    case 'solarizedLight':
    case 'quietLight':
    case 'sepia':
      return 'light';
    case 'dark':
    case 'solarizedDark':
    case 'tintedBlue':
    case 'tintedRed':
    case 'monokai':
    case 'dracula':
    case 'nord':
    case 'gruvbox':
    case 'tokyoNight':
    case 'cyberpunk':
    case 'rosePine':
    case 'everforest':
    case 'matrix':
      return 'dark';
  }
}

/** Saved gated themes stay stored; apply System when the tier cannot use them. */
export function resolveEffectiveTheme(pref: ThemePreference, tier: TierId): ThemePreference {
  if (!canUseNamedTheme(tier, pref)) {
    return 'system';
  }
  return pref;
}

function paint(
  base: VoiceMemosColorScheme,
  accent: string,
  patch: Partial<VoiceMemosColorScheme>
): VoiceMemosColorScheme {
  return {
    ...base,
    accent,
    waveform: accent,
    pillBackgroundSelected: accent,
    toolSelectedBackground: colorWithAlpha(accent, base === VoiceMemosColorsDark ? 0.2 : 0.12),
    waveformSelectedBandBackground: colorWithAlpha(accent, base === VoiceMemosColorsDark ? 0.15 : 0.08),
    ...patch,
  };
}

const solarizedLight = paint(VoiceMemosColorsLight, '#268bd2', {
  text: '#586e75',
  secondaryText: '#839496',
  background: '#fdf6e3',
  sheetBackground: '#fdf6e3',
  editorCanvasBackground: '#eee8d5',
  separator: '#e4dcc4',
  searchFieldBackground: '#eee8d5',
  pillBackground: '#eee8d5',
  pillText: '#586e75',
  waveformInactive: '#d3cbb2',
  waveformBandBackground: '#eee8d5',
  waveformDimBackground: '#f7f1df',
  waveformBar: '#b7ad93',
  waveformMarkerBackground: '#fdf6e3',
  recordRed: '#dc322f',
});

const solarizedDark = paint(VoiceMemosColorsDark, '#268bd2', {
  text: '#93a1a1',
  secondaryText: '#657b83',
  background: '#002b36',
  sheetBackground: '#073642',
  editorCanvasBackground: '#073642',
  separator: '#094352',
  searchFieldBackground: '#073642',
  pillBackground: '#073642',
  pillText: '#93a1a1',
  waveformInactive: '#245463',
  waveformBandBackground: '#073642',
  waveformDimBackground: '#003844',
  waveformBar: '#586e75',
  waveformMarkerBackground: '#073642',
  recordRed: '#dc322f',
});

const tintedBlue = paint(VoiceMemosColorsDark, '#7aa2f7', {
  text: '#c8d3e8',
  secondaryText: '#8b97b3',
  background: '#1a1e2e',
  sheetBackground: '#23283c',
  editorCanvasBackground: '#141826',
  separator: '#2c3348',
  searchFieldBackground: '#141826',
  pillBackground: '#252b40',
  pillText: '#c8d3e8',
  waveformInactive: '#3d4663',
  waveformBandBackground: '#141826',
  waveformDimBackground: '#161a28',
  waveformBar: '#5c6888',
  waveformMarkerBackground: '#23283c',
});

const tintedRed = paint(VoiceMemosColorsDark, '#f07178', {
  text: '#f0d5d8',
  secondaryText: '#b08990',
  background: '#2b1b1e',
  sheetBackground: '#382328',
  editorCanvasBackground: '#221418',
  separator: '#4a3034',
  searchFieldBackground: '#221418',
  pillBackground: '#3a2428',
  pillText: '#f0d5d8',
  waveformInactive: '#5c3a3e',
  waveformBandBackground: '#221418',
  waveformDimBackground: '#26171b',
  waveformBar: '#7a4e54',
  waveformMarkerBackground: '#382328',
  recordRed: '#ff6b6b',
});

const quietLight = paint(VoiceMemosColorsLight, '#4b6eaf', {
  text: '#333333',
  secondaryText: '#6e6e6e',
  background: '#f5f5f5',
  sheetBackground: '#ffffff',
  editorCanvasBackground: '#ebebeb',
  separator: '#d9d9d9',
  searchFieldBackground: '#e8e8e8',
  pillBackground: '#e4e4e4',
  pillText: '#333333',
  waveformInactive: '#d0d0d0',
  waveformBandBackground: '#ebebeb',
  waveformDimBackground: '#f7f7f7',
  waveformBar: '#bdbdbd',
  waveformMarkerBackground: '#ffffff',
});

const monokai = paint(VoiceMemosColorsDark, '#a6e22e', {
  text: '#f8f8f2',
  secondaryText: '#75715e',
  background: '#272822',
  sheetBackground: '#272822',
  editorCanvasBackground: '#1e1f1c',
  separator: '#3e3d32',
  searchFieldBackground: '#1e1f1c',
  pillBackground: '#3e3d32',
  pillText: '#f8f8f2',
  pillTextSelected: '#272822',
  waveformInactive: '#49483e',
  waveformBandBackground: '#1e1f1c',
  waveformDimBackground: '#22231e',
  waveformBar: '#75715e',
  waveformMarkerBackground: '#3e3d32',
  recordRed: '#f92672',
});

const dracula = paint(VoiceMemosColorsDark, '#bd93f9', {
  text: '#f8f8f2',
  secondaryText: '#6272a4',
  background: '#282a36',
  sheetBackground: '#282a36',
  editorCanvasBackground: '#21222c',
  separator: '#44475a',
  searchFieldBackground: '#21222c',
  pillBackground: '#44475a',
  pillText: '#f8f8f2',
  pillTextSelected: '#282a36',
  waveformInactive: '#44475a',
  waveformBandBackground: '#21222c',
  waveformDimBackground: '#1e1f29',
  waveformBar: '#6272a4',
  waveformMarkerBackground: '#282a36',
  recordRed: '#ff5555',
});

const nord = paint(VoiceMemosColorsDark, '#88c0d0', {
  text: '#eceff4',
  secondaryText: '#81a1c1',
  background: '#2e3440',
  sheetBackground: '#2e3440',
  editorCanvasBackground: '#3b4252',
  separator: '#434c5e',
  searchFieldBackground: '#3b4252',
  pillBackground: '#434c5e',
  pillText: '#eceff4',
  pillTextSelected: '#2e3440',
  waveformInactive: '#434c5e',
  waveformBandBackground: '#3b4252',
  waveformDimBackground: '#323846',
  waveformBar: '#4c566a',
  waveformMarkerBackground: '#2e3440',
  recordRed: '#bf616a',
});

const gruvbox = paint(VoiceMemosColorsDark, '#fe8019', {
  text: '#ebdbb2',
  secondaryText: '#a89984',
  background: '#282828',
  sheetBackground: '#282828',
  editorCanvasBackground: '#1d2021',
  separator: '#3c3836',
  searchFieldBackground: '#1d2021',
  pillBackground: '#3c3836',
  pillText: '#ebdbb2',
  pillTextSelected: '#282828',
  waveformInactive: '#504945',
  waveformBandBackground: '#1d2021',
  waveformDimBackground: '#1d2021',
  waveformBar: '#665c54',
  waveformMarkerBackground: '#282828',
  recordRed: '#fb4934',
});

const tokyoNight = paint(VoiceMemosColorsDark, '#bb9af7', {
  text: '#c0caf5',
  secondaryText: '#565f89',
  background: '#1a1b26',
  sheetBackground: '#1a1b26',
  editorCanvasBackground: '#16161e',
  separator: '#292e42',
  searchFieldBackground: '#16161e',
  pillBackground: '#292e42',
  pillText: '#c0caf5',
  pillTextSelected: '#1a1b26',
  waveformInactive: '#292e42',
  waveformBandBackground: '#16161e',
  waveformDimBackground: '#13141c',
  waveformBar: '#414868',
  waveformMarkerBackground: '#1a1b26',
  recordRed: '#f7768e',
});

const cyberpunk = paint(VoiceMemosColorsDark, '#00e5ff', {
  text: '#e8f7ff',
  secondaryText: '#9d7cd8',
  background: '#120818',
  sheetBackground: '#1a0b2e',
  editorCanvasBackground: '#0a0118',
  separator: '#2d1548',
  searchFieldBackground: '#0a0118',
  pillBackground: '#2a1244',
  pillText: '#e8f7ff',
  pillTextSelected: '#0a0118',
  waveformInactive: '#3a1860',
  waveformBandBackground: '#0a0118',
  waveformDimBackground: '#0d041c',
  waveformBar: '#6b3a90',
  waveformMarkerBackground: '#1a0b2e',
  recordRed: '#ff2a6d',
});

const rosePine = paint(VoiceMemosColorsDark, '#c4a7e7', {
  text: '#e0def4',
  secondaryText: '#908caa',
  background: '#191724',
  sheetBackground: '#1f1d2e',
  editorCanvasBackground: '#26233a',
  separator: '#403d52',
  searchFieldBackground: '#26233a',
  pillBackground: '#403d52',
  pillText: '#e0def4',
  pillTextSelected: '#191724',
  waveformInactive: '#524f67',
  waveformBandBackground: '#26233a',
  waveformDimBackground: '#16141f',
  waveformBar: '#6e6a86',
  waveformMarkerBackground: '#1f1d2e',
  recordRed: '#eb6f92',
});

const everforest = paint(VoiceMemosColorsDark, '#a7c080', {
  text: '#d3c6aa',
  secondaryText: '#859289',
  background: '#2d353b',
  sheetBackground: '#343f44',
  editorCanvasBackground: '#232a2e',
  separator: '#4a555b',
  searchFieldBackground: '#232a2e',
  pillBackground: '#4a555b',
  pillText: '#d3c6aa',
  pillTextSelected: '#2d353b',
  waveformInactive: '#4a555b',
  waveformBandBackground: '#232a2e',
  waveformDimBackground: '#1e2428',
  waveformBar: '#7a8478',
  waveformMarkerBackground: '#343f44',
  recordRed: '#e67e80',
});

const matrix = paint(VoiceMemosColorsDark, '#00ff66', {
  text: '#b8ffc8',
  secondaryText: '#3d9a55',
  background: '#020805',
  sheetBackground: '#06140c',
  editorCanvasBackground: '#000000',
  separator: '#0f2a18',
  searchFieldBackground: '#000000',
  pillBackground: '#0f2a18',
  pillText: '#b8ffc8',
  pillTextSelected: '#020805',
  waveformInactive: '#14522a',
  waveformBandBackground: '#000000',
  waveformDimBackground: '#010503',
  waveformBar: '#1f6b38',
  waveformMarkerBackground: '#06140c',
  recordRed: '#ff3355',
});

const sepia = paint(VoiceMemosColorsLight, '#8b5e3c', {
  text: '#4a3728',
  secondaryText: '#8a6f58',
  background: '#f4ecd8',
  sheetBackground: '#efe4cc',
  editorCanvasBackground: '#e8d9bc',
  separator: '#d4c2a3',
  searchFieldBackground: '#e8d9bc',
  pillBackground: '#e0d0b0',
  pillText: '#4a3728',
  waveformInactive: '#cbb892',
  waveformBandBackground: '#e8d9bc',
  waveformDimBackground: '#f7f0e2',
  waveformBar: '#a89070',
  waveformMarkerBackground: '#efe4cc',
  recordRed: '#a33b2b',
});

type StaticThemeId = Exclude<ThemePreference, 'system'>;

const PALETTES: Record<StaticThemeId, VoiceMemosColorScheme> = {
  light: VoiceMemosColorsLight,
  dark: VoiceMemosColorsDark,
  solarizedLight,
  solarizedDark,
  tintedBlue,
  tintedRed,
  quietLight,
  monokai,
  dracula,
  nord,
  gruvbox,
  tokyoNight,
  cyberpunk,
  rosePine,
  everforest,
  matrix,
  sepia,
};

export function paletteForTheme(pref: StaticThemeId): VoiceMemosColorScheme {
  return PALETTES[pref];
}
