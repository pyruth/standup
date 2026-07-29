import { standUpApi } from './tauri-api';
import {
  IDLE_THRESHOLDS,
  REMINDER_INTERVALS,
  REMINDER_POSITIONS,
  REMINDER_SOUNDS,
  type ReminderPosition,
  type SettingsPatch,
  type StandUpSettings,
  type TimerStatus
} from './v2-types';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) {
    throw new Error(`Missing settings control: ${id}`);
  }
  return element;
};

const intervalSelect = byId<HTMLSelectElement>('interval-select');
const idleSelect = byId<HTMLSelectElement>('idle-select');
const loginToggle = byId<HTMLInputElement>('login-toggle');
const monitorSelect = byId<HTMLSelectElement>('monitor-select');
const soundSelect = byId<HTMLSelectElement>('sound-select');
const creativityInput = byId<HTMLTextAreaElement>('creativity-input');
const statusLabel = byId<HTMLElement>('status-label');
const statusCard = document.querySelector<HTMLElement>('.status-card')!;
const saveState = byId<HTMLElement>('save-state');
const previewButton = byId<HTMLButtonElement>('preview-button');
const soundPreviewButton =
  byId<HTMLButtonElement>('sound-preview-button');
const uploadAnimationButton = byId<HTMLButtonElement>(
  'upload-animation-button'
);
const copyPromptButton = byId<HTMLButtonElement>('copy-prompt-button');
const resetAnimationButton = byId<HTMLButtonElement>(
  'reset-animation-button'
);
const promptPreview = byId<HTMLTextAreaElement>('prompt-preview');
const animationStatus = byId<HTMLElement>('animation-status');
const positionGrid = byId<HTMLElement>('position-grid');

let currentSettings: StandUpSettings | undefined;

function createOptions(): void {
  for (const minutes of REMINDER_INTERVALS) {
    intervalSelect.add(new Option(`${minutes} minutes`, String(minutes)));
  }
  for (const minutes of IDLE_THRESHOLDS) {
    idleSelect.add(
      new Option(
        `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
        String(minutes)
      )
    );
  }
  for (const sound of REMINDER_SOUNDS) {
    soundSelect.add(new Option(sound.label, sound.value));
  }
  for (const [index, position] of REMINDER_POSITIONS.entries()) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'reminder-position';
    input.value = position;
    input.id = `position-${position}`;
    input.setAttribute('aria-label', position.replace('-', ' '));

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.title = position.replace('-', ' ');
    label.style.setProperty('--grid-index', String(index));
    label.append(input, document.createElement('span'));
    positionGrid.append(label);
  }
}

function renderSettings(settings: StandUpSettings): void {
  currentSettings = settings;
  intervalSelect.value = String(settings.reminderIntervalMinutes);
  idleSelect.value = String(settings.idleThresholdMinutes);
  loginToggle.checked = settings.launchAtLogin;
  soundSelect.value = settings.reminderSound;
  soundPreviewButton.disabled = settings.reminderSound === 'off';
  monitorSelect.value = settings.selectedMonitor;
  const position = document.querySelector<HTMLInputElement>(
    `input[name="reminder-position"][value="${settings.reminderPosition}"]`
  );
  if (position) {
    position.checked = true;
  }
  animationStatus.textContent = settings.useCustomAnimation
    ? 'Using your sanitized custom GIF'
    : 'Using the built-in StandUp animation';
  resetAnimationButton.disabled = !settings.useCustomAnimation;
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

function setSaving(saving: boolean, message?: string): void {
  saveState.textContent =
    message ?? (saving ? 'Saving…' : 'Settings saved automatically');
  saveState.classList.toggle('saving', saving);
}

async function updateSettings(patch: SettingsPatch): Promise<void> {
  setSaving(true);
  try {
    renderSettings(await standUpApi.updateSettings(patch));
    setSaving(false);
  } catch (error) {
    setSaving(false, error instanceof Error ? error.message : String(error));
  }
}

async function refreshMonitors(selectedMonitor = 'primary'): Promise<void> {
  const monitors = await standUpApi.listMonitors();
  monitorSelect.replaceChildren(
    new Option('Primary Monitor (Automatic)', 'primary')
  );
  for (const monitor of monitors) {
    const primary = monitor.primary ? ' · Primary' : '';
    monitorSelect.add(
      new Option(
        `${monitor.name} · ${monitor.width}×${monitor.height}${primary}`,
        monitor.fingerprint
      )
    );
  }
  monitorSelect.value = selectedMonitor;
  if (!monitorSelect.value) {
    monitorSelect.value = 'primary';
  }
}

function technicalPrompt(): string {
  const creativity = creativityInput.value.trim();
  const creativeSection = creativity
    ? `Creative direction from me:\n${creativity}\n\n`
    : '';
  return `${creativeSection}Create an animated GIF for a small desktop wellness reminder. Keep the creative style, subject, colors, composition, and motion open to the direction above.

Technical delivery requirements:
- GIF format with animation
- Recommended canvas: 256 × 384 pixels
- Maximum dimensions: 1024 × 1024 pixels
- Maximum file size: 15 MB
- Total duration: 0.5 to 8 seconds
- Maximum 120 frames
- Recommended frame rate: 4 to 12 FPS
- Seamless infinite loop preferred
- Transparency is optional
- No audio
- Avoid rapid flashing or strobing`;
}

async function copyPrompt(): Promise<void> {
  const prompt = technicalPrompt();
  promptPreview.value = prompt;
  try {
    await navigator.clipboard.writeText(prompt);
    copyPromptButton.textContent = 'Copied';
    window.setTimeout(() => {
      copyPromptButton.textContent = 'Copy AI prompt';
    }, 1_500);
  } catch {
    promptPreview.focus();
    promptPreview.select();
    setSaving(false, 'Select the prompt and copy it manually');
  }
}

createOptions();
promptPreview.value = technicalPrompt();

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
soundSelect.addEventListener('change', () => {
  void updateSettings({
    reminderSound: soundSelect.value as StandUpSettings['reminderSound']
  });
});
soundPreviewButton.addEventListener('click', async () => {
  try {
    await standUpApi.previewSound();
  } catch (error) {
    setSaving(false, error instanceof Error ? error.message : String(error));
  }
});
monitorSelect.addEventListener('change', () => {
  void updateSettings({ selectedMonitor: monitorSelect.value });
});
positionGrid.addEventListener('change', (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement) {
    void updateSettings({
      reminderPosition: input.value as ReminderPosition
    });
  }
});
creativityInput.addEventListener('input', () => {
  promptPreview.value = technicalPrompt();
});
previewButton.addEventListener('click', () => {
  void standUpApi.previewReminder();
});
copyPromptButton.addEventListener('click', () => {
  void copyPrompt();
});
uploadAnimationButton.addEventListener('click', async () => {
  uploadAnimationButton.disabled = true;
  uploadAnimationButton.textContent = 'Checking GIF…';
  setSaving(true, 'Validating and sanitizing your GIF…');
  try {
    const settings = await standUpApi.chooseCustomAnimation();
    if (settings) {
      renderSettings(settings);
      setSaving(false, 'Custom GIF imported securely');
      await standUpApi.previewReminder();
    } else {
      setSaving(false);
    }
  } catch (error) {
    setSaving(false, error instanceof Error ? error.message : String(error));
  } finally {
    uploadAnimationButton.disabled = false;
    uploadAnimationButton.textContent = 'Choose custom GIF';
  }
});
resetAnimationButton.addEventListener('click', async () => {
  try {
    renderSettings(await standUpApi.resetCustomAnimation());
    setSaving(false, 'Restored the built-in StandUp animation');
  } catch (error) {
    setSaving(false, error instanceof Error ? error.message : String(error));
  }
});

void standUpApi
  .getSettings()
  .then(async (settings) => {
    await refreshMonitors(settings.selectedMonitor);
    renderSettings(settings);
    renderStatus(await standUpApi.getTimerStatus());
  })
  .catch((error) => {
    setSaving(false, error instanceof Error ? error.message : String(error));
  });

window.setInterval(() => {
  void standUpApi.getTimerStatus().then(renderStatus);
}, 1_000);

window.addEventListener('focus', () => {
  if (currentSettings) {
    void refreshMonitors(currentSettings.selectedMonitor);
  }
});
