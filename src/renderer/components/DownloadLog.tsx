import { useEffect, useRef } from 'react';

interface DownloadLogProps {
  logs: string[];
}

export default function DownloadLog({ logs }: DownloadLogProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="download-log">
      <div className="log-header">Activity Log</div>
      <div className="log-entries">
        {logs.map((log, i) => (
          <div
            key={i}
            className={`log-entry ${log.startsWith('Error') ? 'log-error' : ''}`}
          >
            {log}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
