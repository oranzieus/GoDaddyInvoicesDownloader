import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc';
import { closeBrowser } from '../scraper/login';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 910,
    height: 780,
    title: 'GDInvoices',
    icon: path.join(__dirname, '../../build/icon.ico'),
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  registerIpcHandlers(() => mainWindow);
});

app.on('window-all-closed', () => {
  console.log('[main] window-all-closed fired — calling closeBrowser()');
  closeBrowser();
  console.log('[main] closeBrowser() returned — calling app.quit()');
  app.quit();
});

app.on('will-quit', () => {
  console.log('[main] will-quit fired — calling closeBrowser() again as safety net');
  closeBrowser();
});
