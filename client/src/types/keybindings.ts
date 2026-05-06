export type KeybindingAction =
  | 'pdfTocToggle'
  | 'pdfPanelToggle'
  | 'goToLibrary'
  | 'goToBrowse';

export interface KeybindingMeta {
  action: KeybindingAction;
  label: string;
  scope: string;
  defaultKey: string;
}

export const KEYBINDING_META: KeybindingMeta[] = [
  { action: 'pdfTocToggle', label: 'Toggle table of contents', scope: 'PDF viewer', defaultKey: 't' },
  { action: 'pdfPanelToggle', label: 'Toggle right panel', scope: 'PDF viewer', defaultKey: 'p' },
  { action: 'goToLibrary', label: 'Go to Library', scope: 'Global', defaultKey: 'l' },
  { action: 'goToBrowse', label: 'Browse new papers', scope: 'Global', defaultKey: 'b' },
];

export type KeybindingsConfig = Record<KeybindingAction, string>;

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = KEYBINDING_META.reduce(
  (acc, m) => ({ ...acc, [m.action]: m.defaultKey }),
  {} as KeybindingsConfig,
);
