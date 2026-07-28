const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');
import type {
  SettingsPatch,
  StandUpApi,
  StandUpSettings,
  TimerStatus
} from '../shared/types.js';

const IPC_CHANNELS = {
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  chooseBlacklistedApp: 'blacklist:choose',
  removeBlacklistedApp: 'blacklist:remove',
  previewReminder: 'reminder:preview',
  getStatus: 'timer:status'
} as const;

const api: StandUpApi = {
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getSettings) as Promise<StandUpSettings>,
  updateSettings: (patch: SettingsPatch) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.updateSettings,
      patch
    ) as Promise<StandUpSettings>,
  chooseBlacklistedApp: () =>
    ipcRenderer.invoke(
      IPC_CHANNELS.chooseBlacklistedApp
    ) as Promise<StandUpSettings>,
  removeBlacklistedApp: (id: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.removeBlacklistedApp,
      id
    ) as Promise<StandUpSettings>,
  previewReminder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.previewReminder) as Promise<void>,
  getStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getStatus) as Promise<TimerStatus>
};

contextBridge.exposeInMainWorld('standUp', api);
