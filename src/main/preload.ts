import { contextBridge, ipcRenderer } from 'electron';
import type { AppStatus, DownloadOptions, DownloadProgress, EmailSettings, Receipt } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  startLogin: () => ipcRenderer.invoke('start-login'),
  scrapeReceipts: () => ipcRenderer.invoke('scrape-receipts'),
  downloadInvoices: (options: DownloadOptions) => ipcRenderer.invoke('download-invoices', options),
  openOutputFolder: () => ipcRenderer.invoke('open-output-folder'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getEmailSettings: () => ipcRenderer.invoke('get-email-settings'),
  saveEmailSettings: (settings: EmailSettings) => ipcRenderer.invoke('save-email-settings', settings),
  sendTestEmail: () => ipcRenderer.invoke('send-test-email'),
  closeApp: () => ipcRenderer.send('close-app'),

  onStatusChange: (callback: (status: AppStatus) => void) => {
    ipcRenderer.on('status-change', (_event, status) => callback(status));
  },
  onLoginDetected: (callback: () => void) => {
    ipcRenderer.on('login-detected', () => callback());
  },
  onProgress: (callback: (progress: DownloadProgress) => void) => {
    ipcRenderer.on('download-progress', (_event, progress) => callback(progress));
  },
  onReceipts: (callback: (receipts: Receipt[]) => void) => {
    ipcRenderer.on('receipts-loaded', (_event, receipts) => callback(receipts));
  },
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('error', (_event, error) => callback(error));
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('status-change');
    ipcRenderer.removeAllListeners('login-detected');
    ipcRenderer.removeAllListeners('download-progress');
    ipcRenderer.removeAllListeners('receipts-loaded');
    ipcRenderer.removeAllListeners('error');
  },
});
