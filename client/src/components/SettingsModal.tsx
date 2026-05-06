import { useState, useEffect, useRef } from 'react';
import * as api from '../services/api';
import { COLOR_SCHEMES, applyColorScheme, getSchemeById } from '../colorSchemes';
import { useKeybindings } from '../contexts/KeybindingsContext';
import { KEYBINDING_META, type KeybindingAction, type KeybindingsConfig } from '../types/keybindings';

interface Props {
  open: boolean;
  onClose: () => void;
  showNotification: (msg: string) => void;
}

type Tab = 'general' | 'shortcuts';

function formatKey(key: string): string {
  if (!key) return '—';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function ShortcutRow({ action, label, scope }: { action: KeybindingAction; label: string; scope: string }) {
  const { keybindings, setKeybinding } = useKeybindings();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      setKeybinding(action, e.key.toLowerCase());
      setRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, action, setKeybinding]);

  return (
    <div className="shortcut-row">
      <div className="shortcut-info">
        <span className="shortcut-label">{label}</span>
        <span className="shortcut-scope">{scope}</span>
      </div>
      <button
        type="button"
        className={`key-button ${recording ? 'key-button-recording' : ''}`}
        onClick={() => setRecording(r => !r)}
        title={recording ? 'Press a key (Esc to cancel)' : 'Click to rebind'}
      >
        {recording ? 'Press a key…' : formatKey(keybindings[action])}
      </button>
    </div>
  );
}

function findDuplicate(action: KeybindingAction, key: string, all: KeybindingsConfig): KeybindingAction | null {
  for (const other of Object.keys(all) as KeybindingAction[]) {
    if (other !== action && all[other] === key) return other;
  }
  return null;
}

export default function SettingsModal({ open, onClose, showNotification }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [colorScheme, setColorScheme] = useState('default-dark');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.82);
  const [cardFontSize, setCardFontSize] = useState<number>(1);
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const overlayMouseDownRef = useRef(false);

  const { keybindings, resetKeybindings } = useKeybindings();
  const hasConflict = KEYBINDING_META.some(m => findDuplicate(m.action, keybindings[m.action], keybindings));

  useEffect(() => {
    if (open) {
      setLoading(true);
      setShowKey(false);
      api.getSettings().then(settings => {
        setApiKey(settings.claudeApiKey);
        setColorScheme(settings.colorScheme);
        setSimilarityThreshold(settings.similarityThreshold);
        setCardFontSize(settings.cardFontSize);
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSchemeChange = (schemeId: string) => {
    setColorScheme(schemeId);
    const scheme = getSchemeById(schemeId);
    if (scheme) {
      applyColorScheme(scheme);
    }
  };

  const handleSave = async () => {
    try {
      await api.saveSettings({ claudeApiKey: apiKey.trim(), colorScheme, similarityThreshold, cardFontSize });
      api.applyCardFontSize(cardFontSize);
      showNotification('Settings saved');
      onClose();
    } catch {
      showNotification('Failed to save settings');
    }
  };

  const handleFontSizeChange = (size: number) => {
    setCardFontSize(size);
    api.applyCardFontSize(size);
  };

  const handleCancel = () => {
    // Revert color scheme and font size to saved values
    const visualPrefs = api.getVisualPrefsSync();
    const scheme = getSchemeById(visualPrefs.colorScheme);
    if (scheme) {
      applyColorScheme(scheme);
    }
    api.applyCardFontSize(visualPrefs.cardFontSize);
    onClose();
  };

  const handleVerify = async () => {
    const key = apiKey.trim();
    if (!key) {
      showNotification('Please enter an API key first');
      return;
    }

    setVerifying(true);
    try {
      const result = await api.verifyApiKey(key);
      if (result.valid) {
        showNotification('API key is valid');
      } else {
        showNotification(`Invalid API key: ${result.error || 'Unknown error'}`);
      }
    } catch {
      showNotification('Failed to verify API key');
    } finally {
      setVerifying(false);
    }
  };

  const handleClear = async () => {
    setApiKey('');
    try {
      await api.saveSettings({ claudeApiKey: '', colorScheme, similarityThreshold, cardFontSize });
      showNotification('API key removed');
    } catch {
      showNotification('Failed to remove API key');
    }
  };

  const maskedKey = apiKey ? apiKey.slice(0, 10) + '...' + apiKey.slice(-4) : '';

  return (
    <div
      className="settings-overlay"
      onMouseDown={e => { overlayMouseDownRef.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (overlayMouseDownRef.current && e.target === e.currentTarget) handleCancel();
        overlayMouseDownRef.current = false;
      }}
    >
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-tabs">
            <button
              className={`settings-tab ${tab === 'general' ? 'active' : ''}`}
              onClick={() => setTab('general')}
            >
              General
            </button>
            <button
              className={`settings-tab ${tab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setTab('shortcuts')}
            >
              Shortcuts
            </button>
          </div>
          <button className="btn-icon" onClick={handleCancel}>&times;</button>
        </div>

        {tab === 'general' && (loading ? (
          <div className="settings-body" style={{ textAlign: 'center', padding: '2rem' }}>
            Loading settings...
          </div>
        ) : (
          <div className="settings-body">
            <div className="settings-section">
              <h3>Color Scheme</h3>
              <p className="settings-description">
                Choose a color scheme for the application. Changes preview instantly.
              </p>

              <div className="scheme-grid">
                {COLOR_SCHEMES.map(scheme => (
                  <button
                    key={scheme.id}
                    className={`scheme-card ${colorScheme === scheme.id ? 'active' : ''}`}
                    onClick={() => handleSchemeChange(scheme.id)}
                  >
                    <div className="scheme-preview">
                      <div
                        className="scheme-swatch-bg"
                        style={{ background: scheme.colors.bgPrimary }}
                      >
                        <div
                          className="scheme-swatch-bar"
                          style={{ background: scheme.colors.bgSecondary, borderBottom: `2px solid ${scheme.colors.borderColor}` }}
                        />
                        <div className="scheme-swatch-body">
                          <div
                            className="scheme-swatch-card"
                            style={{ background: scheme.colors.bgCard, border: `1px solid ${scheme.colors.borderColor}` }}
                          >
                            <div
                              className="scheme-swatch-text"
                              style={{ background: scheme.colors.textPrimary }}
                            />
                            <div
                              className="scheme-swatch-text short"
                              style={{ background: scheme.colors.textSecondary }}
                            />
                          </div>
                          <div
                            className="scheme-swatch-accent"
                            style={{ background: scheme.colors.accent }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="scheme-name">{scheme.name}</span>
                    <span className="scheme-type">{scheme.type}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: 24 }}>
              <h3>Card Font Size</h3>
              <p className="settings-description">
                Adjust the font size of paper titles and abstracts in browse and library cards.
              </p>

              <div className="font-size-slider-container">
                <input
                  type="range"
                  className="font-size-slider"
                  min="0.7"
                  max="2.5"
                  step="0.05"
                  value={cardFontSize}
                  onChange={e => handleFontSizeChange(parseFloat(e.target.value))}
                />
                <div className="font-size-slider-labels">
                  <span>A</span>
                  <span style={{ fontSize: '1.4em' }}>A</span>
                  <span style={{ fontSize: '2em' }}>A</span>
                </div>
                <span className="font-size-preview" style={{ fontSize: `${cardFontSize * 16}px` }}>
                  Aa — Preview
                </span>
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: 24 }}>
              <h3>Claude API</h3>
              <p className="settings-description">
                Connect your Claude API key to use the AI chat feature when viewing papers.
                Your key is stored securely on the server.
              </p>

              <div className="settings-field">
                <label htmlFor="claude-api-key">API Key</label>
                <div className="settings-key-row">
                  <input
                    id="claude-api-key"
                    type={showKey ? 'text' : 'password'}
                    value={showKey ? apiKey : (apiKey ? maskedKey : '')}
                    onChange={e => {
                      setShowKey(true);
                      setApiKey(e.target.value);
                    }}
                    onFocus={() => setShowKey(true)}
                    placeholder="sk-ant-..."
                    className="settings-key-input"
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowKey(!showKey)}
                    type="button"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="settings-hint">
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>

              <div className="settings-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleVerify}
                  disabled={!apiKey.trim() || verifying}
                >
                  {verifying ? 'Verifying...' : 'Verify Key'}
                </button>
                {apiKey && (
                  <button className="btn btn-danger btn-sm" onClick={handleClear}>
                    Remove Key
                  </button>
                )}
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: 24 }}>
              <h3>Worldline Similarity</h3>
              <p className="settings-description">
                When browsing ArXiv, papers are scored against your existing worldlines using semantic similarity (SPECTER embeddings).
                Adjust the threshold to control how sensitive the matching is.
                Lower values show more matches, higher values require closer relevance.
              </p>

              <div className="settings-field">
                <label>Similarity Threshold: {similarityThreshold.toFixed(2)}</label>
                <div className="settings-threshold-row">
                  <span className="settings-threshold-label">0.70</span>
                  <input
                    type="range"
                    min="0.70"
                    max="0.95"
                    step="0.01"
                    value={similarityThreshold}
                    onChange={e => setSimilarityThreshold(parseFloat(e.target.value))}
                    className="settings-threshold-slider"
                  />
                  <span className="settings-threshold-label">0.95</span>
                </div>
                <p className="settings-hint">
                  Default: 0.82. Lower = more matches (less strict), Higher = fewer matches (more strict).
                </p>
              </div>
            </div>
          </div>
        ))}

        {tab === 'shortcuts' && (
          <div className="settings-body">
            <div className="settings-section">
              <h3>Keyboard Shortcuts</h3>
              <p className="settings-description">
                Click a key to rebind. Single-character keys only; Esc cancels recording.
                Shortcuts only fire when no input is focused.
              </p>
              <div className="shortcut-list">
                {KEYBINDING_META.map(m => (
                  <ShortcutRow key={m.action} action={m.action} label={m.label} scope={m.scope} />
                ))}
              </div>
              {hasConflict && (
                <p className="shortcut-warning">
                  Duplicate key assigned — only one action will fire.
                </p>
              )}
              <div className="settings-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-secondary btn-sm" onClick={resetKeybindings}>
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
          {tab === 'general' && (
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>Save</button>
          )}
        </div>
      </div>
    </div>
  );
}
