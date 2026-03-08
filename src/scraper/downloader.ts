import type { Page, BrowserContext } from 'playwright-core';
import type { Receipt, DownloadProgress } from '../shared/types';
import { dismissCookieBanner } from './cookies';
import path from 'path';
import fs from 'fs';
import os from 'os';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const RECEIPTS_URL = 'https://account.godaddy.com/receipts';

let cancelRequested = false;

export function getDefaultOutputDir(): string {
  const downloadsDir = path.join(os.homedir(), 'Downloads', 'GoDaddy-Invoices');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  return downloadsDir;
}

export function requestCancel() {
  cancelRequested = true;
}

export async function downloadInvoices(
  page: Page,
  receipts: Receipt[],
  outputDir: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  cancelRequested = false;

  const progress: DownloadProgress = {
    total: receipts.length,
    completed: 0,
    current: '',
    failed: [],
    skipped: 0,
  };

  for (const receipt of receipts) {
    if (cancelRequested) {
      progress.current = 'Cancelled';
      onProgress({ ...progress });
      return;
    }

    const fileName = `${receipt.billingDate}_Order-${receipt.orderNumber}.pdf`;
    const filePath = path.join(outputDir, fileName);

    // Skip if already downloaded
    if (fs.existsSync(filePath)) {
      progress.skipped++;
      progress.completed++;
      progress.current = `Skipped ${receipt.orderNumber} (exists)`;
      onProgress({ ...progress });
      continue;
    }

    progress.current = receipt.orderNumber;
    onProgress({ ...progress });

    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (cancelRequested) break;

      try {
        await downloadSingleInvoice(page, receipt, filePath);
        success = true;
        break;
      } catch (err) {
        console.error(`Attempt ${attempt} failed for ${receipt.orderNumber}:`, err);

        if (page.url().includes('login') || page.url().includes('sso')) {
          throw new Error('Session expired. Please re-login.');
        }

        if (attempt < MAX_RETRIES) {
          await page.waitForTimeout(RETRY_DELAY_MS * attempt);
        }
      }
    }

    if (success) {
      progress.completed++;
    } else if (!cancelRequested) {
      progress.failed.push(receipt.orderNumber);
      progress.completed++;
    }

    onProgress({ ...progress });
  }
}

// ────────────────────────────────────────────────────────────────
// Core download logic
//
// GoDaddy's receipts page is an SPA. Direct navigation to
// /receipts/view/{orderNumber} redirects back to /receipts.
//
// Correct flow:
//   1. Stay on the /receipts list page
//   2. Click the order number button (button.px-link) to open a
//      detail panel / drawer
//   3. In the detail panel, find and click "Print to PDF"
//   4. GoDaddy opens an about:blank popup, writes receipt HTML
//      via document.write(), then calls window.print()
//   5. We override window.open to capture that HTML silently
//   6. Render captured HTML in a temp page → CDP printToPDF
//   7. Close detail panel and return to the list
// ────────────────────────────────────────────────────────────────

async function downloadSingleInvoice(page: Page, receipt: Receipt, filePath: string): Promise<void> {
  // ── 1. Ensure we're on the receipts list page ──────────────
  await ensureOnReceiptsList(page);
  await dismissCookieBanner(page);

  // ── 2. Find the order number button on the list ────────────
  const orderBtn = page.locator(
    `button.px-link >> text="${receipt.orderNumber}"`
  ).first();

  if (!(await orderBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    await loadMoreUntilVisible(page, orderBtn);
  }
  await orderBtn.waitFor({ state: 'visible', timeout: 10000 });

  // ── 3. Click order number to open receipt modal ─────────────
  await orderBtn.click();
  console.log(`Clicked order ${receipt.orderNumber}`);

  // ── 4. Wait for Print to PDF button to appear ──────────────
  // The modal opens with skeleton loaders; "Print to PDF" only
  // renders after receipt data finishes loading. Wait directly
  // for the button — this is faster and avoids the modal closing
  // before we can act.
  const printSelector = '[data-eid*="receipt.print"], button:has-text("Print to PDF")';
  try {
    await page.waitForSelector(printSelector, { state: 'visible', timeout: 20000 });
    console.log('Print to PDF button appeared');
  } catch {
    // Button didn't appear — collect diagnostics
    const url = page.url();
    const snippet = await page.evaluate(() => document.body.innerText.substring(0, 300));
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, a, [role="button"]'))
        .filter(el => (el as HTMLElement).offsetHeight > 0)
        .map(el => `${el.tagName}[${(el.className || '').toString().substring(0, 50)}] → "${(el.textContent || '').trim().substring(0, 50)}"`)
        .slice(0, 20)
    );
    console.error(`Print button not found. URL: ${url}\nBody: ${snippet}\nButtons: ${btns.join(', ')}`);
    throw new Error(`Print button not found for order ${receipt.orderNumber}`);
  }

  // ── 5. Set up capture + inject override ─────────────────────
  // Must happen BEFORE clicking Print — override window.open to
  // silently capture the popup HTML instead of showing print dialog.
  await injectPopupCapture(page);

  // Also listen for real popups (fallback if override doesn't work)
  let capturedPopup: Page | undefined;
  const popupHandler = (p: Page) => { capturedPopup = p; };
  page.context().on('page', popupHandler);

  // ── 6. Click Print to PDF ──────────────────────────────────
  // Remove only cookie overlays (not promotional ones that might
  // interfere with the modal) right before clicking.
  await page.evaluate(() => {
    const overlaySelectors = [
      '#onetrust-banner-sdk', '#onetrust-consent-sdk',
      '.onetrust-pc-dark-filter',
    ];
    overlaySelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  });

  const printBtn = page.locator(printSelector).first();
  await printBtn.click();
  console.log(`Clicked Print to PDF for ${receipt.orderNumber}`);

  // ── 7. Wait for either capture strategy ─────────────────────
  const capturedViaOverride = await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__popupCaptured === true,
    null,
    { timeout: 10000 }
  ).then(() => true).catch(() => false);

  page.context().off('page', popupHandler);

  if (capturedViaOverride) {
    // Strategy A: window.open override captured the HTML
    const capturedHTML = await page.evaluate(
      () => ((window as unknown as Record<string, unknown>).__capturedHTML as string) || ''
    );
    if (!capturedHTML || capturedHTML.length < 50) {
      throw new Error(`Captured HTML too short for order ${receipt.orderNumber}`);
    }
    console.log(`Captured ${capturedHTML.length} chars via window.open override for ${receipt.orderNumber}`);
    await renderHTMLToPDF(page.context(), capturedHTML, filePath);
    await page.bringToFront();
  } else if (capturedPopup) {
    // Strategy B: real popup appeared — use CDP printToPDF on it directly
    console.log(`Using popup page directly for ${receipt.orderNumber}: ${capturedPopup.url()}`);
    try {
      await capturedPopup.evaluate(() => {
        window.print = function () {};
      }).catch(() => {});
      await capturedPopup.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await capturedPopup.waitForTimeout(1000);

      const cdpSession = await capturedPopup.context().newCDPSession(capturedPopup);
      const { data } = await cdpSession.send('Page.printToPDF', {
        printBackground: true,
        preferCSSPageSize: false,
        paperWidth: 8.5,
        paperHeight: 11,
        marginTop: 0.4,
        marginBottom: 0.4,
        marginLeft: 0.4,
        marginRight: 0.4,
      } as Record<string, unknown>);

      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      await cdpSession.detach();
      console.log(`Saved PDF from popup: ${filePath}`);
    } finally {
      await capturedPopup.close().catch(() => {});
      await page.bringToFront();
    }
  } else {
    throw new Error(`Neither capture strategy worked for order ${receipt.orderNumber}`);
  }

  // ── 8. Return to the receipts list ─────────────────────────
  await returnToReceiptsList(page);
}

// ────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────

/** Render HTML string to a PDF file via CDP printToPDF */
async function renderHTMLToPDF(context: BrowserContext, html: string, filePath: string): Promise<void> {
  const pdfPage = await context.newPage();
  try {
    await pdfPage.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const cdpSession = await pdfPage.context().newCDPSession(pdfPage);
    const { data } = await cdpSession.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: false,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.4,
      marginBottom: 0.4,
      marginLeft: 0.4,
      marginRight: 0.4,
    } as Record<string, unknown>);

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    await cdpSession.detach();
    console.log(`Saved PDF: ${filePath}`);
  } finally {
    await pdfPage.close();
  }
}

/** Navigate to /receipts if not already there */
async function ensureOnReceiptsList(page: Page): Promise<void> {
  const url = page.url();
  // Already on the list (and not on a detail sub-route)
  if (url.includes('/receipts') && !url.includes('/receipts/view/')) {
    return;
  }
  await page.goto(RECEIPTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.receipt-row', { timeout: 30000 });
  await page.waitForTimeout(2000);
}

/** Click "Load More" until the target element is visible */
async function loadMoreUntilVisible(page: Page, target: ReturnType<Page['locator']>): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await dismissCookieBanner(page);

    const loadMoreBtn = await page.$('.load-more button[aria-label="load-more"]');
    if (!loadMoreBtn) break;

    const isVisible = await loadMoreBtn.isVisible().catch(() => false);
    if (!isVisible) break;

    await loadMoreBtn.click();
    await page.waitForTimeout(2000);

    if (await target.isVisible().catch(() => false)) return;
  }
}

/** Inject window.open override to capture popup HTML silently.
 *  Only intercepts about:blank popups (print popups); lets other URLs through. */
async function injectPopupCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__capturedHTML = '';
    w.__popupCaptured = false;

    const origOpen = window.open.bind(window);

    const fakeOpen = function (url?: string | URL, ...rest: unknown[]) {
      const urlStr = url == null ? '' : String(url);
      // Only intercept about:blank / empty popups (the print receipt popup)
      if (!urlStr || urlStr === 'about:blank') {
        const htmlParts: string[] = [];
        return {
          document: {
            open() { htmlParts.length = 0; },
            write(html: string) { htmlParts.push(html); },
            writeln(html: string) { htmlParts.push(html + '\n'); },
            close() {
              w.__capturedHTML = htmlParts.join('');
              w.__popupCaptured = true;
            },
            readyState: 'loading',
            title: '',
            body: null,
            head: null,
          },
          print() {},   // suppress OS print dialog
          close() {},
          focus() {},
          blur() {},
          closed: false,
          addEventListener() {},
          removeEventListener() {},
          location: { href: 'about:blank' },
        };
      }
      // Let real navigations through
      return origOpen(urlStr, ...(rest as [string?, string?]));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).open = fakeOpen;
  });
}

/** Find and click the Print to PDF button in the receipt detail panel */
async function clickPrintButton(page: Page, orderNumber: string): Promise<void> {
  // Try Playwright locator selectors first
  const printSelectors = [
    'button:has-text("Print to PDF")',
    'a:has-text("Print to PDF")',
    'button:has-text("Print")',
    'a:has-text("Print")',
    '[data-eid*="print"]',
    '[data-eid*="Print"]',
    'button[aria-label*="print" i]',
    '[role="button"]:has-text("Print")',
  ];

  for (const selector of printSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click();
        console.log(`Clicked print button via: ${selector}`);
        return;
      }
    } catch {
      continue;
    }
  }

  // Fallback: search the DOM for any element with "print" text
  const clicked = await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll('button, a, [role="button"], span[class*="btn"], div[class*="btn"]')
    );
    for (const el of elements) {
      const text = (el.textContent || '').trim().toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const dataEid = (el.getAttribute('data-eid') || '').toLowerCase();
      if (
        (text.includes('print') || ariaLabel.includes('print') || dataEid.includes('print')) &&
        (el as HTMLElement).offsetHeight > 0
      ) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    console.log('Clicked print button via DOM fallback');
    return;
  }

  // Not found — log diagnostics
  const diag = await page.evaluate(() => {
    const allClickable = Array.from(
      document.querySelectorAll('button, a, [role="button"]')
    )
      .filter((el) => (el as HTMLElement).offsetHeight > 0)
      .map((el) => {
        const tag = el.tagName;
        const cls = (el.className && typeof el.className === 'string') ? el.className.substring(0, 60) : '';
        const txt = (el.textContent || '').trim().substring(0, 60);
        const eid = el.getAttribute('data-eid') || '';
        return `  ${tag}[${cls}] eid="${eid}" → "${txt}"`;
      });
    return {
      url: window.location.href,
      bodySnippet: document.body.innerText.substring(0, 300),
      buttons: allClickable,
    };
  });
  console.error(
    `\n╔═══ PRINT BUTTON NOT FOUND ═══\n` +
    `║ URL: ${diag.url}\n` +
    `║ Body: ${diag.bodySnippet.substring(0, 200)}\n` +
    `║ Buttons (${diag.buttons.length}):\n` +
    diag.buttons.join('\n') + '\n╚══════════════════════════════'
  );
  throw new Error(`Print button not found for order ${orderNumber}`);
}

/** Navigate back to the receipts list after downloading */
async function returnToReceiptsList(page: Page): Promise<void> {
  // Try browser back first (preserves SPA state & loaded receipts)
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    if (page.url().includes('/receipts') && !page.url().includes('/receipts/view/')) {
      // Verify the list is actually showing
      const hasReceipts = await page.$('.receipt-row');
      if (hasReceipts) return;
    }
  } catch {
    // goBack failed or timed out
  }

  // Fallback: navigate directly to the receipts page
  await page.goto(RECEIPTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.receipt-row', { timeout: 30000 });
  await page.waitForTimeout(2000);
}
