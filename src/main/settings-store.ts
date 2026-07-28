import fs from 'node:fs';
import path from 'node:path';
import {
  IDLE_THRESHOLDS,
  REMINDER_INTERVALS,
  type BlacklistedApp,
  type IdleThresholdMinutes,
  type ReminderIntervalMinutes,
  type StandUpSettings
} from '../shared/types.js';

export const DEFAULT_SETTINGS: StandUpSettings = {
  reminderIntervalMinutes: 45,
  idleThresholdMinutes: 3,
  launchAtLogin: true,
  blacklistedApps: []
};

function isReminderInterval(value: unknown): value is ReminderIntervalMinutes {
  return REMINDER_INTERVALS.includes(value as ReminderIntervalMinutes);
}

function isIdleThreshold(value: unknown): value is IdleThresholdMinutes {
  return IDLE_THRESHOLDS.includes(value as IdleThresholdMinutes);
}

function isBlacklistedApp(value: unknown): value is BlacklistedApp {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<BlacklistedApp>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.path === 'string' &&
    typeof entry.normalizedPath === 'string' &&
    (entry.platform === 'win32' || entry.platform === 'darwin')
  );
}

export function sanitizeSettings(value: unknown): StandUpSettings {
  if (!value || typeof value !== 'object') {
    return structuredClone(DEFAULT_SETTINGS);
  }

  const candidate = value as Partial<StandUpSettings>;
  return {
    reminderIntervalMinutes: isReminderInterval(candidate.reminderIntervalMinutes)
      ? candidate.reminderIntervalMinutes
      : DEFAULT_SETTINGS.reminderIntervalMinutes,
    idleThresholdMinutes: isIdleThreshold(candidate.idleThresholdMinutes)
      ? candidate.idleThresholdMinutes
      : DEFAULT_SETTINGS.idleThresholdMinutes,
    launchAtLogin:
      typeof candidate.launchAtLogin === 'boolean'
        ? candidate.launchAtLogin
        : DEFAULT_SETTINGS.launchAtLogin,
    blacklistedApps: Array.isArray(candidate.blacklistedApps)
      ? candidate.blacklistedApps.filter(isBlacklistedApp)
      : []
  };
}

export class SettingsStore {
  private settings: StandUpSettings;

  constructor(private readonly filePath: string) {
    this.settings = this.load();
  }

  get(): StandUpSettings {
    return structuredClone(this.settings);
  }

  set(next: StandUpSettings): StandUpSettings {
    this.settings = sanitizeSettings(next);
    this.persist();
    return this.get();
  }

  private load(): StandUpSettings {
    try {
      return sanitizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf8');
  }
}
