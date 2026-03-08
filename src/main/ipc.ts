import { ipcMain, BrowserWindow, shell, app } from 'electron';
import { launchBrowser, closeBrowser } from '../scraper/login';
import { scrapeReceipts } from '../scraper/scraper';
import { downloadInvoices, getDefaultOutputDir, requestCancel } from '../scraper/downloader';
import { sendInvoiceEmail, sendTestEmail } from '../scraper/emailer';
import { loadSettings, saveSettings } from '../shared/settings';
import type { DownloadOptions, EmailSettings, Receipt } from '../shared/types';
import type { Page } from 'playwright-core';
import path from 'path';
import fs from 'fs';

let activePage: Page | null = null;
let cachedReceipts: Receipt[] = [];

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  const sendToRenderer = (channel: string, ...args: unknown[]) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  };

  ipcMain.handle('start-login', async () => {
    try {
      sendToRenderer('status-change', 'connecting');
      activePage = await launchBrowser();
      sendToRenderer('status-change', 'connected');
      sendToRenderer('login-detected');
    } catch (err) {
      sendToRenderer('status-change', 'error');
      sendToRenderer('error', `Login failed: ${(err as Error).message}`);
      throw err;
    }
  });

  ipcMain.handle('scrape-receipts', async () => {
    if (!activePage) throw new Error('Not logged in');
    try {
      sendToRenderer('status-change', 'scraping');
      cachedReceipts = await scrapeReceipts(activePage);
      sendToRenderer('receipts-loaded', cachedReceipts);
      sendToRenderer('status-change', 'connected');
      return cachedReceipts;
    } catch (err) {
      sendToRenderer('status-change', 'error');
      sendToRenderer('error', `Scraping failed: ${(err as Error).message}`);
      throw err;
    }
  });

  ipcMain.handle('download-invoices', async (_event, options: DownloadOptions) => {
    if (!activePage) throw new Error('Not logged in');
    try {
      sendToRenderer('status-change', 'downloading');
      const outputDir = getDefaultOutputDir();
      const { dateRange, emailAfterDownload } = options;

      let receipts = cachedReceipts;
      if (dateRange?.startDate || dateRange?.endDate) {
        receipts = receipts.filter((r) => {
          if (dateRange.startDate && r.billingDate < dateRange.startDate) return false;
          if (dateRange.endDate && r.billingDate > dateRange.endDate) return false;
          return true;
        });
      }

      await downloadInvoices(activePage, receipts, outputDir, (progress) => {
        sendToRenderer('download-progress', progress);
      });

      // Send email with downloaded PDFs if requested
      if (emailAfterDownload) {
        const settings = loadSettings();
        if (settings.emails.length > 0) {
          sendToRenderer('status-change', 'sending-email');
          const pdfPaths = receipts
            .map((r) => path.join(outputDir, `${r.billingDate}_Order-${r.orderNumber}.pdf`))
            .filter((p) => fs.existsSync(p));

          sendInvoiceEmail(pdfPaths, dateRange || { startDate: null, endDate: null }, settings.emails);
        }
      }

      sendToRenderer('status-change', 'done');
    } catch (err) {
      closeBrowser();
      activePage = null;
      sendToRenderer('status-change', 'error');
      sendToRenderer('error', `Download failed: ${(err as Error).message}`);
      throw err;
    }
  });

  ipcMain.handle('cancel-download', async () => {
    requestCancel();
    closeBrowser();
    activePage = null;
    sendToRenderer('status-change', 'disconnected');
  });

  ipcMain.handle('open-output-folder', async () => {
    const outputDir = getDefaultOutputDir();
    await shell.openPath(outputDir);
  });

  // Email settings
  ipcMain.handle('get-email-settings', async () => {
    return loadSettings();
  });

  ipcMain.handle('save-email-settings', async (_event, settings: EmailSettings) => {
    saveSettings(settings);
  });

  ipcMain.handle('send-test-email', async () => {
    const settings = loadSettings();
    sendTestEmail(settings.emails);
  });

  ipcMain.on('close-app', () => {
    closeBrowser();
    app.quit();
  });

  // Cleanup on app quit
  process.on('exit', () => {
    closeBrowser();
  });
}
