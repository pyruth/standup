export const REMINDER_INTERVALS = [15, 30, 45, 60, 90, 120] as const;
export const IDLE_THRESHOLDS = [1, 2, 3, 5, 10] as const;

export const REMINDER_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
] as const;

export const REMINDER_SOUNDS = [
  { value: 'off', label: 'Off' },
  { value: 'system-beep', label: 'System beep' },
  { value: 'soft-chime', label: 'Soft chime · 1 second' },
  { value: 'gentle-chime', label: 'Gentle chime · 2 seconds' }
] as const;

export type ReminderPosition = (typeof REMINDER_POSITIONS)[number];
export type ReminderSound = (typeof REMINDER_SOUNDS)[number]['value'];
export type CustomAnimationFormat = 'gif' | 'lottie';

export interface BlacklistedApp {
  id: string;
  name: string;
  path: string;
  normalizedPath: string;
  platform: string;
}

export interface StandUpSettings {
  reminderIntervalMinutes: (typeof REMINDER_INTERVALS)[number];
  idleThresholdMinutes: (typeof IDLE_THRESHOLDS)[number];
  launchAtLogin: boolean;
  blacklistedApps: BlacklistedApp[];
  reminderPosition: ReminderPosition;
  reminderSound: ReminderSound;
  selectedMonitor: string;
  useCustomAnimation: boolean;
  customAnimationFormat: CustomAnimationFormat;
}

export type SettingsPatch = Partial<
  Pick<
    StandUpSettings,
    | 'reminderIntervalMinutes'
    | 'idleThresholdMinutes'
    | 'launchAtLogin'
    | 'reminderPosition'
    | 'reminderSound'
    | 'selectedMonitor'
  >
>;

export interface TimerStatus {
  remainingMilliseconds: number;
  accumulatedMilliseconds: number;
  isPaused: boolean;
  pauseUntil: number | null;
  reminderPending: boolean;
  popupVisible: boolean;
}

export interface MonitorOption {
  fingerprint: string;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
}
