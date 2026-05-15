export interface ColorScheme {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: {
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgCard: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    borderColor: string;
    accent: string;
    accentHover: string;
    success: string;
    successHover: string;
    danger: string;
    dangerHover: string;
    warning: string;
    shadow: string;
    shadowLg: string;
  };
}

const light: ColorScheme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f8f9fa',
    bgTertiary: '#f0f1f3',
    bgCard: '#f8f9fa',
    textPrimary: '#212529',
    textSecondary: '#6c757d',
    textMuted: '#adb5bd',
    borderColor: '#dee2e6',
    accent: '#4263eb',
    accentHover: '#3b5bdb',
    success: '#2b8a3e',
    successHover: '#37a047',
    danger: '#c92a2a',
    dangerHover: '#e03131',
    warning: '#e67700',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
    shadowLg: '0 4px 16px rgba(0, 0, 0, 0.12)',
  },
};

const nord: ColorScheme = {
  id: 'nord',
  name: 'Nord',
  type: 'dark',
  colors: {
    bgPrimary: '#2e3440',
    bgSecondary: '#3b4252',
    bgTertiary: '#434c5e',
    bgCard: '#3b4252',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    textMuted: '#7b88a1',
    borderColor: '#4c566a',
    accent: '#88c0d0',
    accentHover: '#8fbcbb',
    success: '#a3be8c',
    successHover: '#b4d09a',
    danger: '#bf616a',
    dangerHover: '#d08770',
    warning: '#ebcb8b',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
    shadowLg: '0 4px 12px rgba(0, 0, 0, 0.4)',
  },
};

export const COLOR_SCHEMES: ColorScheme[] = [light, nord];

export const DEFAULT_LIGHT_SCHEME_ID = 'light';
export const DEFAULT_DARK_SCHEME_ID = 'nord';
export const DEFAULT_SCHEME_ID = DEFAULT_LIGHT_SCHEME_ID;

const LEGACY_SCHEME_MAP: Record<string, string> = {
  'default-light': DEFAULT_LIGHT_SCHEME_ID,
  'solarized-light': DEFAULT_LIGHT_SCHEME_ID,
  'github-light': DEFAULT_LIGHT_SCHEME_ID,
  'catppuccin-latte': DEFAULT_LIGHT_SCHEME_ID,
  'default-dark': DEFAULT_DARK_SCHEME_ID,
  'solarized-dark': DEFAULT_DARK_SCHEME_ID,
  dracula: DEFAULT_DARK_SCHEME_ID,
  monokai: DEFAULT_DARK_SCHEME_ID,
  'one-dark-pro': DEFAULT_DARK_SCHEME_ID,
  'nord-dark': DEFAULT_DARK_SCHEME_ID,
  'nord-light': DEFAULT_LIGHT_SCHEME_ID,
  'dracula-dark': DEFAULT_DARK_SCHEME_ID,
  'dracula-light': DEFAULT_LIGHT_SCHEME_ID,
};

export function coerceSchemeId(id: string | undefined | null, fallback = DEFAULT_SCHEME_ID): string {
  if (!id) return fallback;
  const mapped = LEGACY_SCHEME_MAP[id] ?? id;
  return COLOR_SCHEMES.some(s => s.id === mapped) ? mapped : fallback;
}

export function getSchemeById(id: string): ColorScheme | undefined {
  return COLOR_SCHEMES.find(s => s.id === id);
}

export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', scheme.colors.bgPrimary);
  root.style.setProperty('--bg-secondary', scheme.colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', scheme.colors.bgTertiary);
  root.style.setProperty('--bg-card', scheme.colors.bgCard);
  root.style.setProperty('--text-primary', scheme.colors.textPrimary);
  root.style.setProperty('--text-secondary', scheme.colors.textSecondary);
  root.style.setProperty('--text-muted', scheme.colors.textMuted);
  root.style.setProperty('--border-color', scheme.colors.borderColor);
  root.style.setProperty('--accent', scheme.colors.accent);
  root.style.setProperty('--accent-hover', scheme.colors.accentHover);
  root.style.setProperty('--success', scheme.colors.success);
  root.style.setProperty('--success-hover', scheme.colors.successHover);
  root.style.setProperty('--danger', scheme.colors.danger);
  root.style.setProperty('--danger-hover', scheme.colors.dangerHover);
  root.style.setProperty('--warning', scheme.colors.warning);
  root.style.setProperty('--shadow', scheme.colors.shadow);
  root.style.setProperty('--shadow-lg', scheme.colors.shadowLg);
  root.setAttribute('data-theme-type', scheme.type);
}
