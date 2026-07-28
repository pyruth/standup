import {
  IDLE_THRESHOLDS,
  REMINDER_INTERVALS,
  type StandUpSettings,
  type TimerStatus
} from '../shared/types';

const intervalSelect = document.querySelector<HTMLSelectElement>(
  '#interval-select'
)!;
const idleSelect =
  document.querySelector<HTMLSelectElement>('#idle-select')!;
const loginToggle =
  document.querySelector<HTMLInputElement>('#login-toggle')!;
const blacklist = document.querySelector<HTMLUListElement>('#blacklist')!;
const emptyBlacklist =
  document.querySelector<HTMLElement>('#empty-blacklist')!;
const statusLabel = document.querySelector<HTMLElement>('#status-label')!;
const statusCard = document.querySelector<HTMLElement>('.status-card')!;
const saveState = document.querySelector<HTMLElement>('#save-state')!;
const previewButton =
  document.querySelector<HTMLButtonElement>('#preview-button')!;
const addAppButton =
  document.querySelector<HTMLButtonElement>('#add-app-button')!;

function createOptions(): void {
  for (const minutes of REMINDER_INTERVALS) {
    intervalSelect.add(new Option(`${minutes} minutes`, String(minutes)));
  }
  for (const minutes of IDLE_THRESHOLDS) {
    idleSelect.add(
      new Option(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`, String(minutes))
    );
  }
}

function renderSettings(settings: StandUpSettings): void {
  intervalSelect.value = String(settings.reminderIntervalMinutes);
  idleSelect.value = String(settings.idleThresholdMinutes);
  loginToggle.checked = settings.launchAtLogin;

  blacklist.replaceChildren();
  for (const entry of settings.blacklistedApps) {
    const item = document.createElement('li');
    item.className = 'blacklist-item';

    const details = document.createElement('div');
    details.className = 'app-details';
    const name = document.createElement('strong');
    name.textContent = entry.name;
    const appPath = document.createElement('small');
    appPath.textContent = entry.path;
    appPath.title = entry.path;
    details.append(name, appPath);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      setSaving(true);
      renderSettings(await window.standUp.removeBlacklistedApp(entry.id));
      setSaving(false);
    });

    item.append(details, remove);
    blacklist.append(item);
  }

  emptyBlacklist.hidden = settings.blacklistedApps.length > 0;
}

function formatStatus(status: TimerStatus): string {
  if (status.popupVisible) {
    return 'Reminder is showing';
  }
  if (status.reminderPending) {
    return 'Reminder ready — waiting for a suitable moment';
  }
  if (status.isPaused && status.pauseUntil) {
    const minutes = Math.max(
      1,
      Math.ceil((status.pauseUntil - Date.now()) / 60_000)
    );
    return `Paused for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  const minutes = Math.max(
    1,
    Math.ceil(status.remainingMilliseconds / 60_000)
  );
  return `Active · next reminder in about ${minutes} ${
    minutes === 1 ? 'minute' : 'minutes'
  }`;
}

function renderStatus(status: TimerStatus): void {
  statusLabel.textContent = formatStatus(status);
  statusCard.classList.toggle('paused', status.isPaused);
}

function setSaving(saving: boolean): void {
  saveState.textContent = saving ? 'Saving…' : 'Settings saved automatically';
  saveState.classList.toggle('saving', saving);
}

async function updateSettings(
  patch: Parameters<typeof window.standUp.updateSettings>[0]
): Promise<void> {
  setSaving(true);
  try {
    renderSettings(await window.standUp.updateSettings(patch));
  } finally {
    setSaving(false);
  }
}

createOptions();

intervalSelect.addEventListener('change', () => {
  void updateSettings({
    reminderIntervalMinutes: Number(
      intervalSelect.value
    ) as StandUpSettings['reminderIntervalMinutes']
  });
});

idleSelect.addEventListener('change', () => {
  void updateSettings({
    idleThresholdMinutes: Number(
      idleSelect.value
    ) as StandUpSettings['idleThresholdMinutes']
  });
});

loginToggle.addEventListener('change', () => {
  void updateSettings({ launchAtLogin: loginToggle.checked });
});

previewButton.addEventListener('click', () => {
  void window.standUp.previewReminder();
});

addAppButton.addEventListener('click', async () => {
  setSaving(true);
  try {
    renderSettings(await window.standUp.chooseBlacklistedApp());
  } finally {
    setSaving(false);
  }
});

void Promise.all([window.standUp.getSettings(), window.standUp.getStatus()]).then(
  ([settings, status]) => {
    renderSettings(settings);
    renderStatus(status);
  }
);

setInterval(() => {
  void window.standUp.getStatus().then(renderStatus);
}, 1_000);
