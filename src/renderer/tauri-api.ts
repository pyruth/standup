import { invoke } from '@tauri-apps/api/core';
import type {
  MonitorOption,
  SettingsPatch,
  StandUpSettings,
  TimerStatus
} from './v2-types';

export const standUpApi = {
  getSettings: () => invoke<StandUpSettings>('get_settings'),
  updateSettings: (patch: SettingsPatch) =>
    invoke<StandUpSettings>('update_settings', { patch }),
  getTimerStatus: () => invoke<TimerStatus>('get_timer_status'),
  pauseTimer: (minutes: 30 | 60 | 120) =>
    invoke<void>('pause_timer', { minutes }),
  pauseUntil: (mode: 'tomorrow' | 'next-schedule') =>
    invoke<number>('pause_until_timer', { mode }),
  resumeTimer: () => invoke<void>('resume_timer'),
  previewReminder: () => invoke<void>('preview_reminder'),
  previewSound: () => invoke<void>('preview_sound'),
  listMonitors: () => invoke<MonitorOption[]>('list_monitors')
} as const;
