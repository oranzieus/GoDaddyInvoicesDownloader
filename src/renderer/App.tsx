import { useState, useEffect, useCallback } from 'react';
import type { AppStatus, Receipt, DownloadProgress, DateRange } from '../shared/types';
import StatusCard from './components/StatusCard';
import DateFilter from './components/DateFilter';
import ProgressBar from './components/ProgressBar';
import DownloadLog from './components/DownloadLog';
import SettingsPanel from './components/SettingsPanel';

function getDefaultDateRange(): DateRange {
  const now = new Date();
  const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { startDate: fmt(twoMonthsAgo), endDate: fmt(now) };
}

export default function App() {
  const [status, setStatus] = useState<AppStatus>('disconnected');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emailAfterDownload, setEmailAfterDownload] = useState(false);
  const [hasEmailConfig, setHasEmailConfig] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;

    api.onStatusChange((s) => setStatus(s));
    api.onLoginDetected(() => {
      setLogs((prev) => [...prev, 'Successfully connected to GoDaddy']);
    });
    api.onReceipts((r) => {
      setReceipts(r);
      setLogs((prev) => [...prev, `Found ${r.length} receipts`]);
    });
    api.onProgress((p) => {
      setProgress(p);
      if (p.current) {
        setLogs((prev) => {
          const last = prev[prev.length - 1];
          const msg = p.current === 'Cancelled'
            ? 'Download cancelled'
            : p.current.startsWith('Skipped')
              ? p.current
              : `Downloading Order #${p.current}...`;
          if (last === msg) return prev;
          return [...prev, msg];
        });
      }
    });
    api.onError((err) => {
      setError(err);
      setLogs((prev) => [...prev, `Error: ${err}`]);
    });

    return () => api.removeAllListeners();
  }, []);

  // Load email settings on mount
  useEffect(() => {
    window.electronAPI.getEmailSettings().then((s) => {
      setHasEmailConfig(s.emails.length > 0);
    });
  }, [showSettings]); // Reload when settings panel closes

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      await window.electronAPI.startLogin();
      await window.electronAPI.scrapeReceipts();
    } catch {
      // Error handled via IPC events
    }
  }, []);

  const handleDownload = useCallback(async (all = false) => {
    setError(null);
    setProgress(null);
    const filter = all ? null : (dateRange.startDate || dateRange.endDate ? dateRange : null);
    try {
      await window.electronAPI.downloadInvoices({
        dateRange: filter,
        emailAfterDownload: emailAfterDownload && hasEmailConfig,
      });
    } catch {
      // Error handled via IPC events
    }
  }, [dateRange, emailAfterDownload, hasEmailConfig]);

  const handleCancel = useCallback(() => {
    window.electronAPI.cancelDownload();
    setLogs((prev) => [...prev, 'Cancelling...']);
  }, []);

  const handleOpenFolder = useCallback(() => {
    window.electronAPI.openOutputFolder();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI.closeApp();
  }, []);

  const filteredCount = receipts.filter((r) => {
    if (dateRange.startDate && r.billingDate < dateRange.startDate) return false;
    if (dateRange.endDate && r.billingDate > dateRange.endDate) return false;
    return true;
  }).length;

  return (
    <div className="app">
      <header className="app-header">
        <h1>GDInvoices</h1>
        <span className="subtitle">GoDaddy Invoice Downloader</span>
        <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
          &#9881;
        </button>
      </header>

      <main className="app-main">
        <StatusCard status={status} onConnect={handleConnect} onClose={handleClose} />

        {error && <div className="error-banner">{error}</div>}

        {receipts.length > 0 && (
          <>
            <DateFilter
              dateRange={dateRange}
              onChange={setDateRange}
              totalCount={receipts.length}
              filteredCount={filteredCount}
            />

            <div className="actions">
              {status === 'downloading' ? (
                <button className="btn btn-danger" onClick={handleCancel}>
                  Cancel Download
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleDownload(false)}
                    disabled={filteredCount === 0}
                  >
                    Download {filteredCount} Invoice{filteredCount !== 1 ? 's' : ''}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleDownload(true)}
                  >
                    Download All ({receipts.length})
                  </button>
                </>
              )}
              <button className="btn btn-secondary" onClick={handleOpenFolder}>
                Open Output Folder
              </button>
            </div>

            <label className="email-checkbox">
              <input
                type="checkbox"
                checked={emailAfterDownload}
                onChange={(e) => setEmailAfterDownload(e.target.checked)}
                disabled={!hasEmailConfig}
              />
              <span>Email invoices after download</span>
              {!hasEmailConfig && (
                <span className="email-checkbox-hint">
                  (configure emails in <button className="link-btn" onClick={() => setShowSettings(true)}>Settings</button>)
                </span>
              )}
            </label>
          </>
        )}

        {progress && <ProgressBar progress={progress} />}

        {logs.length > 0 && <DownloadLog logs={logs} />}
      </main>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
