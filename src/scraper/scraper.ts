import type { Page } from 'playwright-core';
import type { Receipt } from '../shared/types';
import { dismissCookieBanner } from './cookies';

const RECEIPTS_URL = 'https://account.godaddy.com/receipts';

export async function scrapeReceipts(page: Page): Promise<Receipt[]> {
  // Ensure we're on the receipts page
  if (!page.url().includes('/receipts')) {
    await page.goto(RECEIPTS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  // Wait for receipt rows to appear
  // Structure: div.grid-row.receipt-row > div.grid-cell
  await page.waitForSelector('.receipt-row', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Dismiss cookie banner FIRST — it overlays the page and blocks clicks
  await dismissCookieBanner(page);

  // Click "Load More" until all receipts are loaded
  // GoDaddy shows "50 of 62 receipts returned" with a load-more button
  while (true) {
    // Dismiss overlays before each click — GoDaddy's ux-disrupt-backdrop
    // can appear at any time and will block the click
    await dismissCookieBanner(page);

    const loadMoreBtn = await page.$('.load-more button[aria-label="load-more"]');
    if (!loadMoreBtn) break;

    const isVisible = await loadMoreBtn.isVisible().catch(() => false);
    if (!isVisible) break;

    await loadMoreBtn.click();
    await page.waitForTimeout(3000);
  }

  // Now scrape all receipt rows
  const receipts = await page.evaluate(() => {
    const results: Array<{ billingDate: string; orderNumber: string; invoiceUrl: string }> = [];

    // Each receipt is: div.grid-row.receipt-row
    //   > div.grid-cell.order-number > button.px-link  (order number)
    //   > div.grid-cell (billing date text like "11/01/2026")
    //   > div.grid-cell.receipt-amount (amount)
    const rows = document.querySelectorAll('.receipt-row');

    rows.forEach((row) => {
      // Order number is in a button.px-link inside .order-number cell
      const orderBtn = row.querySelector('.order-number button.px-link, .order-number a');
      const orderNumber = orderBtn?.textContent?.trim() || '';
      if (!orderNumber || !/^\d{7,}$/.test(orderNumber)) return;

      // The checkbox has id=orderNumber, confirming the structure
      // Invoice URL: GoDaddy uses buttons that trigger JS navigation, not direct links
      // We'll construct the receipt detail URL ourselves
      const invoiceUrl = '';

      // Billing date is in the third grid-cell (after checkbox and order number)
      const cells = row.querySelectorAll('.grid-cell');
      let billingDate = '';
      for (let i = 0; i < cells.length; i++) {
        const text = cells[i].textContent?.trim() || '';
        const dateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dateMatch) {
          const [, part1, part2, year] = dateMatch;
          // GoDaddy format: DD/MM/YYYY (confirmed by dates like 13/07/2025)
          const day = part1.padStart(2, '0');
          const month = part2.padStart(2, '0');
          billingDate = `${year}-${month}-${day}`;
          break;
        }
      }

      if (orderNumber && billingDate) {
        results.push({ billingDate, orderNumber, invoiceUrl });
      }
    });

    return results;
  });

  // Deduplicate by order number
  const seen = new Set<string>();
  return receipts.filter((r) => {
    if (seen.has(r.orderNumber)) return false;
    seen.add(r.orderNumber);
    return true;
  });
}
