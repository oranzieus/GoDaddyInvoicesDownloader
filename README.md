# GDInvoices

A Windows desktop application that automates downloading invoice PDFs from your GoDaddy account. Built with Electron, React, TypeScript, and Playwright.

## Features

- **Automated Login** - Launches a browser window for GoDaddy login, then hides it and works in the background
- **Receipt Scraping** - Automatically finds all invoices in your GoDaddy account
- **PDF Download** - Downloads each invoice as a properly formatted PDF using Chrome's print-to-PDF
- **Date Filtering** - Filter invoices by date range (defaults to last 2 months)
- **Skip Existing** - Already-downloaded invoices are automatically skipped
- **Email via Outlook** - Optionally email downloaded invoices to configured recipients using Microsoft Outlook
- **Progress Tracking** - Real-time progress bar with activity log
- **Cancellation** - Cancel downloads at any point

## Requirements

- **Windows 10/11**
- **Google Chrome** or **Microsoft Edge** (auto-detected)
- **Node.js 18+** (for development)
- **Microsoft Outlook** (optional, for email feature)

## Installation

### From Release (End Users)

1. Download the latest release ZIP
2. Extract to any folder
3. Run `GDInvoices.exe`

### From Source (Development)

```bash
git clone https://github.com/YOUR_USERNAME/GoDaddyInvoicesDownloader.git
cd GoDaddyInvoicesDownloader
npm install
npm run dev
```

## Usage

1. **Connect** - Click "Connect to GoDaddy". A browser window will appear if login is needed.
2. **Login** - Complete the GoDaddy login in the browser window. The window will hide automatically after successful login.
3. **Filter** - Adjust the date range to select which invoices to download.
4. **Download** - Click "Download X Invoices" for filtered results or "Download All" for everything.
5. **Email** (optional) - Check "Email invoices after download" to send PDFs via Outlook after downloading.

Downloaded invoices are saved to `~/Downloads/GoDaddy-Invoices/` with the naming format:
```
YYYY-MM-DD_Order-XXXXXXXX.pdf
```

## Email Configuration

1. Click the gear icon in the top-right corner
2. Enter comma-separated recipient email addresses
3. Click "Save"
4. Use "Send Test Email" to verify Outlook integration works

Emails are sent via Microsoft Outlook COM automation - no credentials or SMTP configuration needed. Outlook must be installed and configured on your machine.

## Architecture

```
Electron App
├── Main Process (Node.js)
│   ├── index.ts          - App lifecycle, window creation
│   ├── ipc.ts            - IPC handlers, orchestration
│   └── preload.ts        - Security bridge to renderer
│
├── Scraper Module
│   ├── login.ts          - Browser launch, login automation (Playwright + CDP)
│   ├── scraper.ts        - Receipt list scraping from GoDaddy
│   ├── downloader.ts     - PDF download via CDP printToPDF
│   ├── cookies.ts        - Cookie/overlay dismissal
│   └── emailer.ts        - Outlook email via PowerShell COM
│
├── Renderer (React)
│   ├── App.tsx            - Main component & state management
│   └── components/
│       ├── StatusCard.tsx  - Connection status display
│       ├── DateFilter.tsx  - Date range picker
│       ├── ProgressBar.tsx - Download progress
│       ├── DownloadLog.tsx - Activity log
│       └── SettingsPanel.tsx - Email settings modal
│
└── Shared
    ├── types.ts           - TypeScript interfaces
    └── settings.ts        - Settings persistence (~/.gdinvoices/settings.json)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development mode with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run the built app |
| `npm run pack` | Package as portable Windows EXE |

## Build for Distribution

```bash
npm run pack
```

This creates a portable executable in `release/win-unpacked/`. Distribute the entire `win-unpacked` folder as a ZIP - no installation required.

## File Locations

| Path | Purpose |
|------|---------|
| `~/Downloads/GoDaddy-Invoices/` | Downloaded invoice PDFs |
| `~/.gdinvoices/settings.json` | Email recipient settings |
| `~/.gdinvoices/browser-data/` | Isolated browser profile |

## Tech Stack

- **Electron 40** - Desktop app framework
- **React 19** - UI
- **TypeScript 5** - Type safety
- **Playwright Core** - Browser automation via Chrome DevTools Protocol
- **Vite 7** - Build tool
- **electron-builder** - Packaging

## License

MIT
