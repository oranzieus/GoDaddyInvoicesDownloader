export interface Receipt {
  billingDate: string;   // YYYY-MM-DD
  orderNumber: string;
  invoiceUrl: string;
}

export interface DownloadProgress {
  total: number;
  completed: number;
  current: string;       // Order number being processed
  failed: string[];      // Order numbers that failed
  skipped: number;       // Already-downloaded count
}

export type AppStatus = 'disconnected' | 'connecting' | 'connected' | 'scraping' | 'downloading' | 'sending-email' | 'done' | 'error';

export interface DateRange {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;   // YYYY-MM-DD
}

export interface EmailSettings {
  emails: string[];
}

export interface DownloadOptions {
  dateRange: DateRange | null;
  emailAfterDownload: boolean;
}

export interface IElectronAPI {
  startLogin: () => Promise<void>;
  scrapeReceipts: () => Promise<Receipt[]>;
  downloadInvoices: (options: DownloadOptions) => Promise<void>;
  openOutputFolder: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  getEmailSettings: () => Promise<EmailSettings>;
  saveEmailSettings: (settings: EmailSettings) => Promise<void>;
  sendTestEmail: () => Promise<void>;
  closeApp: () => void;
  onStatusChange: (callback: (status: AppStatus) => void) => void;
  onLoginDetected: (callback: () => void) => void;
  onProgress: (callback: (progress: DownloadProgress) => void) => void;
  onReceipts: (callback: (receipts: Receipt[]) => void) => void;
  onError: (callback: (error: string) => void) => void;
  removeAllListeners: () => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
