import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  sanitizeSettings
} from '../src/main/settings-store.js';

describe('settings validation', () => {
  it('uses the product defaults for missing or invalid data', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(
      sanitizeSettings({
        reminderIntervalMinutes: 17,
        idleThresholdMinutes: 99,
        launchAtLogin: 'yes',
        blacklistedApps: 'none'
      })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid settings and removes malformed blacklist entries', () => {
    const settings = sanitizeSettings({
      reminderIntervalMinutes: 60,
      idleThresholdMinutes: 5,
      launchAtLogin: false,
      blacklistedApps: [
        {
          id: 'valid',
          name: 'Focus',
          path: '/Applications/Focus.app',
          normalizedPath: '/Applications/Focus.app',
          platform: 'darwin'
        },
        { id: 2 }
      ]
    });

    expect(settings.reminderIntervalMinutes).toBe(60);
    expect(settings.idleThresholdMinutes).toBe(5);
    expect(settings.launchAtLogin).toBe(false);
    expect(settings.blacklistedApps).toHaveLength(1);
  });
});
