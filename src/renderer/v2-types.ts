export const REMINDER_INTERVALS = [15, 30, 45, 60, 90, 120] as const;
export const IDLE_THRESHOLDS = [1, 2, 3, 5, 10] as const;
export const MICROBREAK_INTERVALS = [10, 15, 20, 30] as const;

export const SCHEDULE_DAYS = [
  { value: 'monday', shortLabel: 'Mon', label: 'Monday' },
  { value: 'tuesday', shortLabel: 'Tue', label: 'Tuesday' },
  { value: 'wednesday', shortLabel: 'Wed', label: 'Wednesday' },
  { value: 'thursday', shortLabel: 'Thu', label: 'Thursday' },
  { value: 'friday', shortLabel: 'Fri', label: 'Friday' },
  { value: 'saturday', shortLabel: 'Sat', label: 'Saturday' },
  { value: 'sunday', shortLabel: 'Sun', label: 'Sunday' }
] as const;

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
export type ReminderVisual = 'mello' | 'original-gif';
export type AppearanceTheme = 'system' | 'light' | 'dark';
export type MelloMotionStyle = 'calm' | 'playful';
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number]['value'];
export type MoveCategory = 'mobility' | 'eyes' | 'hydration' | 'walk';
export type MelloBoardColor =
  | 'cream'
  | 'lavender'
  | 'mint'
  | 'peach'
  | 'sunshine'
  | 'slate';
export type MelloColor =
  | 'periwinkle'
  | 'mint'
  | 'coral'
  | 'apricot'
  | 'blueberry'
  | 'grape';

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
  reminderVisual: ReminderVisual;
  appearanceTheme: AppearanceTheme;
  melloMotionStyle: MelloMotionStyle;
  melloReactsToPointer: boolean;
  melloKeepSameColor: boolean;
  melloColor: MelloColor;
  reminderMessage: string;
  melloBoardColor: MelloBoardColor;
  followSystemReducedMotion: boolean;
  suppressDuringFullscreen: boolean;
  scheduleEnabled: boolean;
  scheduleActiveDays: ScheduleDay[];
  scheduleStartMinutes: number;
  scheduleEndMinutes: number;
  breakCheckEnabled: boolean;
  melloMovesEnabled: boolean;
  melloMoveCategories: MoveCategory[];
  peekEnabled: boolean;
  microbreakEnabled: boolean;
  microbreakIntervalMinutes: (typeof MICROBREAK_INTERVALS)[number];
  sessionMoodEnabled: boolean;
  shortcutTogglePause: string;
  shortcutPreview: string;
  shortcutSnooze: string;
  onboardingCompleted: boolean;
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
    | 'reminderVisual'
    | 'appearanceTheme'
    | 'melloMotionStyle'
    | 'melloReactsToPointer'
    | 'melloKeepSameColor'
    | 'melloColor'
    | 'reminderMessage'
    | 'melloBoardColor'
    | 'followSystemReducedMotion'
    | 'suppressDuringFullscreen'
    | 'scheduleEnabled'
    | 'scheduleActiveDays'
    | 'scheduleStartMinutes'
    | 'scheduleEndMinutes'
    | 'breakCheckEnabled'
    | 'melloMovesEnabled'
    | 'melloMoveCategories'
    | 'peekEnabled'
    | 'microbreakEnabled'
    | 'microbreakIntervalMinutes'
    | 'sessionMoodEnabled'
    | 'shortcutTogglePause'
    | 'shortcutPreview'
    | 'shortcutSnooze'
    | 'onboardingCompleted'
  >
>;

export interface TimerStatus {
  remainingMilliseconds: number;
  accumulatedMilliseconds: number;
  isPaused: boolean;
  pauseUntil: number | null;
  reminderPending: boolean;
  popupVisible: boolean;
  scheduleBlocked: boolean;
  microbreakEnabled: boolean;
  microbreakRemainingMilliseconds: number;
  microbreakPending: boolean;
}

export interface MonitorOption {
  fingerprint: string;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  primary: boolean;
}
