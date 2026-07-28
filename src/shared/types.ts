export const REMINDER_INTERVALS = [15, 30, 45, 60, 90, 120] as const;
export const IDLE_THRESHOLDS = [1, 2, 3, 5, 10] as const;

export type ReminderIntervalMinutes = (typeof REMINDER_INTERVALS)[number];
export type IdleThresholdMinutes = (typeof IDLE_THRESHOLDS)[number];
export type SupportedPlatform = 'win32' | 'darwin';

export interface BlacklistedApp {
  id: string;
  name: string;
  path: string;
  normalizedPath: string;
  platform: SupportedPlatform;
}

export interface StandUpSettings {
  reminderIntervalMinutes: ReminderIntervalMinutes;
  idleThresholdMinutes: IdleThresholdMinutes;
  launchAtLogin: boolean;
  blacklistedApps: BlacklistedApp[];
}

export interface SettingsPatch {
  reminderIntervalMinutes?: ReminderIntervalMinutes;
  idleThresholdMinutes?: IdleThresholdMinutes;
  launchAtLogin?: boolean;
}

export interface TimerStatus {
  remainingMilliseconds: number;
  accumulatedMilliseconds: number;
  isPaused: boolean;
  pauseUntil: number | null;
  reminderPending: boolean;
  popupVisible: boolean;
}

export interface StandUpApi {
  getSettings(): Promise<StandUpSettings>;
  updateSettings(patch: SettingsPatch): Promise<StandUpSettings>;
  chooseBlacklistedApp(): Promise<StandUpSettings>;
  removeBlacklistedApp(id: string): Promise<StandUpSettings>;
  previewReminder(): Promise<void>;
  getStatus(): Promise<TimerStatus>;
}

export const IPC_CHANNELS = {
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  chooseBlacklistedApp: 'blacklist:choose',
  removeBlacklistedApp: 'blacklist:remove',
  previewReminder: 'reminder:preview',
  getStatus: 'timer:status'
} as const;
