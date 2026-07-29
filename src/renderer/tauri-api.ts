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
  pauseTimer: (minutes: 30 | 60) =>
    invoke<void>('pause_timer', { minutes }),
  resumeTimer: () => invoke<void>('resume_timer'),
  previewReminder: () => invoke<void>('preview_reminder'),
  listMonitors: () => invoke<MonitorOption[]>('list_monitors'),
  resetCustomAnimation: () =>
    invoke<StandUpSettings>('reset_custom_animation')
} as const;
