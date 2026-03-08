import type { EmailSettings } from './types';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SETTINGS_DIR = path.join(os.homedir(), '.gdinvoices');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

const DEFAULT_SETTINGS: EmailSettings = {
  emails: [],
};

export function loadSettings(): EmailSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // Corrupted file — return defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: EmailSettings): void {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}
