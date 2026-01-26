import { useState, useEffect } from 'react';
import * as api from '../services/api';
import { COLOR_SCHEMES, applyColorScheme, getSchemeById } from '../colorSchemes';

interface Props {
  open: boolean;
  onClose: () => void;
  showNotification: (msg: string) => void;
}

export default function SettingsModal({ open, onClose, showNotification }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [colorScheme, setColorScheme] = useState('default-dark');
  const [verifying, setVerifying] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      const settings = api.getSettings();
      setApiKey(settings.claudeApiKey);
      setColorScheme(settings.colorScheme);
      setShowKey(false);
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

  const handleSave = () => {
    api.saveSettings({ claudeApiKey: apiKey.trim(), colorScheme });
    showNotification('Settings saved');
    onClose();
  };

  const handleCancel = () => {
    // Revert color scheme to saved value
    const settings = api.getSettings();
    const scheme = getSchemeById(settings.colorScheme);
    if (scheme) {
      applyColorScheme(scheme);
    }
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

  const handleClear = () => {
    setApiKey('');
    api.saveSettings({ claudeApiKey: '', colorScheme });
    showNotification('API key removed');
  };

  const maskedKey = apiKey ? apiKey.slice(0, 10) + '...' + apiKey.slice(-4) : '';

  return (
    <div className="settings-overlay" onClick={handleCancel}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={handleCancel}>&times;</button>
        </div>

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
            <h3>Claude API</h3>
            <p className="settings-description">
              Connect your Claude API key to use the AI chat feature when viewing papers.
              Your key is stored locally in your browser and sent to Claude's API via the server proxy.
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
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
