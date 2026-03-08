import { chromium, type Browser, type Page } from 'playwright-core';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const RECEIPTS_URL = 'https://account.godaddy.com/receipts';
const LOGIN_POLL_INTERVAL = 2000;
const LOGIN_TIMEOUT = 300000; // 5 minutes to complete login
const CDP_PORT = 9222;

let browser: Browser | null = null;

// Separate user data dir so we don't interfere with user's normal browser
const USER_DATA_DIR = path.join(os.homedir(), '.gdinvoices', 'browser-data');

interface BrowserInfo {
  name: string;
  path: string;
}

/** Detect Chrome or Edge (both Chromium-based, both support CDP). Chrome preferred. */
function findBrowser(): BrowserInfo {
  const chromePaths = [
    process.env['PROGRAMFILES'] && path.join(process.env['PROGRAMFILES'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean) as string[];

  for (const p of chromePaths) {
    if (fs.existsSync(p)) return { name: 'Chrome', path: p };
  }

  const edgePaths = [
    process.env['PROGRAMFILES'] && path.join(process.env['PROGRAMFILES'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean) as string[];

  for (const p of edgePaths) {
    if (fs.existsSync(p)) return { name: 'Edge', path: p };
  }

  throw new Error('No compatible browser found. Please install Google Chrome or Microsoft Edge.');
}

/** Show the browser window (centered on screen) via CDP */
async function showBrowserWindow(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal', left: 200, top: 100, width: 1280, height: 800 },
    });
    await cdp.detach();
  } catch (err) {
    console.error('Failed to show browser window:', err);
  }
}

/** Hide the browser window by minimizing it via CDP */
async function hideBrowserWindow(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'minimized' },
    });
    await cdp.detach();
  } catch (err) {
    console.error('Failed to hide browser window:', err);
  }
}

/** Check if the page needs login (URL contains login/sso or content is too short) */
async function checkNeedsLogin(page: Page): Promise<boolean> {
  try {
    const url = page.url();
    if (url.includes('login') || url.includes('sso') || url.includes('signin')) {
      return true;
    }
    if (url.includes('/receipts')) {
      const hasContent = await page.evaluate(() => document.body.innerText.length > 100).catch(() => false);
      return !hasContent;
    }
    return true;
  } catch {
    return true;
  }
}

export async function launchBrowser(): Promise<Page> {
  // Kill any leftover browser from a previous session
  closeBrowser();

  // Ensure user data dir exists
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const browserInfo = findBrowser();
  console.log(`Using ${browserInfo.name}: ${browserInfo.path}`);

  // Launch browser hidden (off-screen) with remote debugging
  const proc = spawn(browserInfo.path, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    '--window-position=-32000,-32000',
    RECEIPTS_URL,
  ], {
    detached: false,
    stdio: 'ignore',
  });

  // The spawn PID is just Chrome's launcher stub — it exits immediately.
  // Real browser processes are found via command-line matching in closeBrowser().
  proc.unref();
  console.log(`[launchBrowser] Spawned browser launcher (PID ${proc.pid})`);

  // Wait for CDP endpoint to be ready
  await waitForCDP();

  // Connect Playwright to the running browser via CDP
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);

  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('godaddy')) || pages[0];

  // Give the page a moment to load
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Check if login is needed
  const needsLogin = await checkNeedsLogin(page);

  if (needsLogin) {
    // Show the browser window so user can log in
    console.log('Login required — showing browser window');
    await showBrowserWindow(page);

    // Wait for login to complete
    await waitForLogin(page);

    // Login done — hide the browser
    console.log('Login complete — hiding browser window');
    await hideBrowserWindow(page);
  } else {
    console.log('Already logged in — keeping browser hidden');
  }

  return page;
}

async function waitForCDP(): Promise<void> {
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const http = await import('http');
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${CDP_PORT}/json/version`, (res) => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Browser did not start in time');
}

async function waitForLogin(page: Page): Promise<void> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      if (Date.now() - startTime > LOGIN_TIMEOUT) {
        reject(new Error('Login timed out after 5 minutes'));
        return;
      }

      try {
        const url = page.url();
        if (url.includes('/receipts') && !url.includes('login') && !url.includes('sso')) {
          const hasContent = await page.evaluate(() => {
            return document.body.innerText.length > 100;
          }).catch(() => false);

          if (hasContent) {
            resolve();
            return;
          }
        }
      } catch {
        // Page might be navigating, ignore errors
      }

      setTimeout(check, LOGIN_POLL_INTERVAL);
    };

    check();
  });
}

/** Synchronously kill all browser processes launched by this app.
 *  Chrome's launcher PID exits immediately, so we can't track PIDs.
 *  Instead, find processes by our unique --user-data-dir in their command line. */
export function closeBrowser() {
  console.log(`[closeBrowser] called. browser=${!!browser}`);

  // Disconnect Playwright (best-effort, don't await)
  if (browser) {
    try { browser.close().catch(() => {}); } catch { /* ignore */ }
    browser = null;
    console.log('[closeBrowser] Playwright browser disconnected');
  }

  // Kill all Chrome/Edge processes using our user-data-dir.
  // Chrome's launcher PID exits immediately, so we find real processes
  // by matching our unique user-data-dir in their command line.
  // Use -EncodedCommand (base64) to avoid all shell quoting issues.
  try {
    const psScript = `Get-CimInstance Win32_Process -Filter "CommandLine like '%gdinvoices%browser-data%'" -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
      timeout: 10000,
      stdio: 'ignore',
    });
    console.log('[closeBrowser] Killed browser processes');
  } catch {
    // Errors are expected when no matching processes exist
  }
}
