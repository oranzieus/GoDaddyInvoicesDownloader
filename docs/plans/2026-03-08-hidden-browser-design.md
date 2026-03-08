# Hidden Browser + System Browser Detection

## Summary
Launch a hidden instance of the user's installed browser (Chrome or Edge), only showing it for login/MFA, then hiding it for background scraping/downloading. Replace bundled Playwright browser with `playwright-core` to reduce app size.

## Browser Detection
- Detect Chrome and Edge (both Chromium-based, both support CDP)
- Priority: Chrome > Edge
- Check standard Windows install paths (Program Files, AppData/Local)
- Error with clear message if neither found

## Launch Flow
1. Find browser executable
2. Launch with `--remote-debugging-port`, persistent profile dir, `--window-position=-32000,-32000` (off-screen = hidden)
3. Connect via Playwright `connectOverCDP`
4. Navigate to GoDaddy receipts URL
5. Check login state by polling URL

## Login State Machine
- URL contains `/receipts` with content → logged in → stay hidden
- URL contains `login` or `sso` → show window via CDP `Browser.setWindowBounds`
- After login/MFA complete → minimize window via CDP
- Persistent profile means cookies survive between runs (login only needed once until session expires)

## Window Management
- Show: `Browser.setWindowBounds({ windowState: 'normal', left, top, width, height })` centered
- Hide: `Browser.setWindowBounds({ windowState: 'minimized' })`
- Initial launch: `--window-position=-32000,-32000` keeps window off-screen before CDP connects

## Package Changes
- Replace `playwright` with `playwright-core` (no bundled Chromium)
- Remove `postinstall` script
- Update imports from `playwright` to `playwright-core`

## Files Changed
- `src/scraper/login.ts` — browser detection, hidden launch, window show/hide, login state detection
- `package.json` — swap playwright for playwright-core, remove postinstall
- `src/renderer/components/StatusCard.tsx` — update status messages
- `src/shared/types.ts` — add `'waiting-for-login'` status if needed

## Renderer Updates
- Status messages: "Waiting for login..." when browser window shown, "Working in background..." when hidden
