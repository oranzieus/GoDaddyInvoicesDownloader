import type { Page } from 'playwright-core';

/**
 * Aggressively dismiss cookie consent banners AND promotional overlays on GoDaddy.
 * These overlays cover the page and block button clicks.
 *
 * Handles:
 *  - OneTrust cookie consent banners
 *  - GoDaddy "ux-disrupt-backdrop" promotional popups
 *  - Generic cookie/consent banners
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  try {
    // ── 1. Cookie / consent banners ──────────────────────────────
    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      'button:has-text("Accept All")',
      'button:has-text("Accept Cookies")',
      'button:has-text("Accept")',
      'button:has-text("Got it")',
      'button:has-text("I Accept")',
      'button:has-text("OK")',
      '[class*="cookie"] button',
      '[id*="cookie"] button',
      '[class*="consent"] button',
      '[id*="consent"] button',
      '.onetrust-close-btn-handler',
    ];

    for (const selector of cookieSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            await btn.click();
            await page.waitForTimeout(500);
            break;
          }
        }
      } catch {
        // selector might be invalid for this page, continue
      }
    }

    // ── 2. GoDaddy promotional / disruption overlays ─────────────
    // The "ux-disrupt-backdrop" element intercepts ALL pointer events
    const disruptSelectors = [
      '.ux-disrupt-backdrop button[aria-label="close"]',
      '.ux-disrupt-backdrop button[aria-label="Close"]',
      '.ux-disrupt-backdrop button:has-text("No")',
      '.ux-disrupt-backdrop button:has-text("Dismiss")',
      '.ux-disrupt-backdrop button:has-text("Close")',
      '.ux-disrupt-backdrop button:has-text("Not now")',
      '.ux-disrupt-backdrop button:has-text("No thanks")',
      '.ux-disrupt-backdrop [class*="close"]',
      '.ux-disrupt-backdrop button:first-of-type',
    ];

    for (const selector of disruptSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            await btn.click();
            await page.waitForTimeout(500);
            break;
          }
        }
      } catch {
        // continue
      }
    }

    // ── 3. Fallback: forcibly remove all overlays from DOM ───────
    await page.evaluate(() => {
      const selectors = [
        '#onetrust-banner-sdk',
        '#onetrust-consent-sdk',
        '.onetrust-pc-dark-filter',
        '[class*="cookie-banner"]',
        '[class*="consent-banner"]',
        '[id*="cookie-banner"]',
        '[class*="cookie-overlay"]',
        '[class*="consent-overlay"]',
        '.ux-disrupt-backdrop',
      ];

      selectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });
    });
  } catch {
    // Ignore errors — overlays might not exist
  }
}
