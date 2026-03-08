import type { DownloadProgress } from '../../shared/types';

interface ProgressBarProps {
  progress: DownloadProgress;
}

export default function ProgressBar({ progress }: ProgressBarProps) {
  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="progress-section">
      <div className="progress-header">
        <span>
          {progress.completed} of {progress.total} invoices
          {progress.skipped > 0 && ` (${progress.skipped} skipped)`}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      {progress.current && (
        <div className="progress-current">
          {progress.current.startsWith('Skipped')
            ? progress.current
            : `Processing Order #${progress.current}`}
        </div>
      )}
      {progress.failed.length > 0 && (
        <div className="progress-failures">
          Failed: {progress.failed.join(', ')}
        </div>
      )}
    </div>
  );
}
