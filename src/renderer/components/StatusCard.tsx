import type { AppStatus } from '../../shared/types';

interface StatusCardProps {
  status: AppStatus;
  onConnect: () => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<AppStatus, string> = {
  disconnected: 'Not Connected',
  connecting: 'Launching Browser...',
  connected: 'Connected',
  scraping: 'Scanning Receipts...',
  downloading: 'Downloading Invoices...',
  'sending-email': 'Sending Email...',
  done: 'Complete',
  error: 'Error',
};

const STATUS_COLORS: Record<AppStatus, string> = {
  disconnected: '#6b7280',
  connecting: '#f59e0b',
  connected: '#10b981',
  scraping: '#3b82f6',
  downloading: '#3b82f6',
  'sending-email': '#f59e0b',
  done: '#10b981',
  error: '#ef4444',
};

export default function StatusCard({ status, onConnect, onClose }: StatusCardProps) {
  return (
    <div className="status-card">
      <div className="status-indicator" style={{ backgroundColor: STATUS_COLORS[status] }} />
      <div className="status-info">
        <span className="status-label">{STATUS_LABELS[status]}</span>
        {status === 'connecting' && (
          <span className="status-hint">If login is needed, a browser window will appear</span>
        )}
      </div>
      {status === 'disconnected' && (
        <button className="btn btn-primary" onClick={onConnect}>
          Connect to GoDaddy
        </button>
      )}
      {status === 'done' && (
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
