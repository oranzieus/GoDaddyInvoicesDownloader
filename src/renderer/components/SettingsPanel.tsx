import { useState, useEffect } from 'react';
import type { EmailSettings } from '../../shared/types';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [emailsText, setEmailsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI.getEmailSettings().then((settings: EmailSettings) => {
      setEmailsText(settings.emails.join(', '));
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const emails = emailsText
        .split(/[,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      await window.electronAPI.saveEmailSettings({ emails });
      setMessage({ text: 'Settings saved', type: 'success' });
      setSaved(true);
    } catch {
      setMessage({ text: 'Failed to save settings', type: 'error' });
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      // Save first so test uses latest emails
      const emails = emailsText
        .split(/[,;]+/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      await window.electronAPI.saveEmailSettings({ emails });
      await window.electronAPI.sendTestEmail();
      setMessage({ text: 'Test email sent via Outlook', type: 'success' });
    } catch (err) {
      setMessage({ text: `Test failed: ${(err as Error).message}`, type: 'error' });
    }
    setTesting(false);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">Email Recipients</label>
            <p className="settings-hint">
              Comma-separated email addresses. Emails are sent via Microsoft Outlook.
            </p>
            <textarea
              className="settings-input"
              value={emailsText}
              onChange={(e) => { setEmailsText(e.target.value); setSaved(false); }}
              placeholder="user@company.com, manager@company.com"
              rows={3}
            />
          </div>

          {message && (
            <div className={`settings-message ${message.type}`}>
              {message.text}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button
            className="btn btn-secondary"
            onClick={handleTest}
            disabled={testing || !emailsText.trim()}
          >
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
          <div className="settings-footer-right">
            {saved ? (
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
