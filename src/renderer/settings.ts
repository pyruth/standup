import { standUpApi } from './tauri-api';
import { createMelloRenderer, type MelloController, type MelloPose } from './mello-renderer';
import {
  IDLE_THRESHOLDS,
  MICROBREAK_INTERVALS,
  REMINDER_INTERVALS,
  REMINDER_POSITIONS,
  REMINDER_SOUNDS,
  SCHEDULE_DAYS,
  type AppearanceTheme,
  type MelloBoardColor,
  type MelloColor,
  type MelloMotionStyle,
  type MoveCategory,
  type ReminderPosition,
  type ReminderVisual,
  type ScheduleDay,
  type SettingsPatch,
  type StandUpSettings,
  type TimerStatus
} from './v2-types';

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Missing settings control: ${id}`);
  return element;
};

const DEFAULT_SETTINGS: StandUpSettings = {
  reminderIntervalMinutes: 45,
  idleThresholdMinutes: 3,
  launchAtLogin: true,
  blacklistedApps: [],
  reminderPosition: 'bottom-right',
  reminderSound: 'off',
  selectedMonitor: 'primary',
  reminderVisual: 'mello',
  appearanceTheme: 'system',
  melloMotionStyle: 'playful',
  melloReactsToPointer: true,
  melloKeepSameColor: true,
  melloColor: 'periwinkle',
  reminderMessage: 'Stand up\nmove a little',
  melloBoardColor: 'cream',
  followSystemReducedMotion: true,
  suppressDuringFullscreen: true,
  scheduleEnabled: false,
  scheduleActiveDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  scheduleStartMinutes: 9 * 60,
  scheduleEndMinutes: 18 * 60,
  breakCheckEnabled: true,
  melloMovesEnabled: true,
  melloMoveCategories: ['mobility', 'eyes', 'hydration', 'walk'],
  peekEnabled: true,
  microbreakEnabled: false,
  microbreakIntervalMinutes: 20,
  sessionMoodEnabled: true,
  shortcutTogglePause: '',
  shortcutPreview: '',
  shortcutSnooze: '',
  onboardingCompleted: new URLSearchParams(location.search).get('onboarding') !== '1'
};

const PAGE_COPY: Record<string, [string, string]> = {
  animation: ['Animation', 'Choose how Mello appears on your screen.'],
  general: ['General', 'Set your movement rhythm and accessibility preferences.'],
  reminders: ['Reminders', 'Choose where, when, and how reminders appear.'],
  schedule: ['Schedule', 'Choose the days and hours when StandUp is active.'],
  snooze: ['Snooze & DND', 'Pause reminders and protect your focused moments.'],
  shortcuts: ['Shortcuts', 'Reach the most useful actions quickly.'],
  about: ['About', 'StandUp is private, lightweight, and made by ioiostudio.']
};

const COLORS: Array<{ value: MelloColor; hex: string }> = [
  { value: 'periwinkle', hex: '#aeb9ff' },
  { value: 'mint', hex: '#a4e1d8' },
  { value: 'coral', hex: '#ff9885' },
  { value: 'apricot', hex: '#ffd07d' },
  { value: 'blueberry', hex: '#9cb3e8' },
  { value: 'grape', hex: '#be91ea' }
];

const BOARD_COLORS: Array<{ value: MelloBoardColor; hex: string }> = [
  { value: 'cream', hex: '#fff5e8' },
  { value: 'lavender', hex: '#eeeaff' },
  { value: 'mint', hex: '#e5f7f1' },
  { value: 'peach', hex: '#ffe7dd' },
  { value: 'sunshine', hex: '#fff1bd' },
  { value: 'slate', hex: '#dfe5f2' }
];

const intervalSelect = byId<HTMLSelectElement>('interval-select');
const idleSelect = byId<HTMLSelectElement>('idle-select');
const loginToggle = byId<HTMLInputElement>('login-toggle');
const reduceMotionToggle = byId<HTMLInputElement>('reduce-motion-toggle');
const monitorSelect = byId<HTMLSelectElement>('monitor-select');
const soundSelect = byId<HTMLSelectElement>('sound-select');
const motionStyleSelect = byId<HTMLSelectElement>('motion-style-select');
const pointerToggle = byId<HTMLInputElement>('pointer-toggle');
const sameColorToggle = byId<HTMLInputElement>('same-color-toggle');
const fullscreenToggle = byId<HTMLInputElement>('fullscreen-toggle');
const dndFullscreenToggle = byId<HTMLInputElement>('dnd-fullscreen-toggle');
const positionGrid = byId<HTMLElement>('position-grid');
const colorSwatches = byId<HTMLElement>('color-swatches');
const boardColorSwatches = byId<HTMLElement>('board-color-swatches');
const melloPreview = byId<HTMLElement>('mello-preview');
const gifPreview = byId<HTMLElement>('gif-preview');
const melloCanvas = byId<HTMLCanvasElement>('mello-preview-canvas');
const reminderMessage = byId<HTMLTextAreaElement>('reminder-message');
const messageCount = byId<HTMLElement>('message-count');
const statusLabel = byId<HTMLElement>('status-label');
const saveState = byId<HTMLElement>('save-state');
const scheduleToggle = byId<HTMLInputElement>('schedule-toggle');
const scheduleDays = byId<HTMLElement>('schedule-days');
const scheduleStartTime = byId<HTMLInputElement>('schedule-start-time');
const scheduleEndTime = byId<HTMLInputElement>('schedule-end-time');
const scheduleSummary = byId<HTMLElement>('schedule-summary');
const scheduleDetail = byId<HTMLElement>('schedule-detail');
const pageTitle = byId<HTMLElement>('page-title');
const pageSubtitle = byId<HTMLElement>('page-subtitle');
const breakCheckToggle = byId<HTMLInputElement>('break-check-toggle');
const peekToggle = byId<HTMLInputElement>('peek-toggle');
const movesToggle = byId<HTMLInputElement>('moves-toggle');
const moveCategories = byId<HTMLElement>('move-categories');
const microbreakToggle = byId<HTMLInputElement>('microbreak-toggle');
const microbreakIntervalSelect = byId<HTMLSelectElement>('microbreak-interval-select');
const microbreakIntervalRow = byId<HTMLElement>('microbreak-interval-row');
const sessionMoodToggle = byId<HTMLInputElement>('session-mood-toggle');
const shortcutTogglePause = byId<HTMLInputElement>('shortcut-toggle-pause');
const shortcutPreview = byId<HTMLInputElement>('shortcut-preview');
const shortcutSnooze = byId<HTMLInputElement>('shortcut-snooze');
const onboarding = byId<HTMLElement>('onboarding');
const onboardingInterval = byId<HTMLSelectElement>('onboarding-interval');
const onboardingSchedule = byId<HTMLSelectElement>('onboarding-schedule');
const onboardingSound = byId<HTMLSelectElement>('onboarding-sound');
const onboardingMonitor = byId<HTMLSelectElement>('onboarding-monitor');
const onboardingColor = byId<HTMLSelectElement>('onboarding-color');
const PREVIEW_TIMEOUT_MILLISECONDS = 5_000;

let currentSettings = DEFAULT_SETTINGS;
let previewController: MelloController | undefined;
let previewSeed = Date.now();
let previewSignature = '';
let pendingSettingsUpdate: Promise<void> = Promise.resolve();
let messageSaveTimer: number | undefined;
let pageTransitionTimer: number | undefined;

function previewPoint(event: PointerEvent): { x: number; y: number } {
  const rect = melloCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function followPreviewPose(pose: MelloPose): void {
  const boardX = Math.min(melloPreview.clientWidth - 95, pose.centerX + pose.width * 0.57);
  const boardY = Math.max(18, pose.centerY - pose.height * 0.62);
  melloPreview.style.setProperty('--speech-x', `${boardX}px`);
  melloPreview.style.setProperty('--speech-y', `${boardY}px`);
}

function createOptions(): void {
  REMINDER_INTERVALS.forEach((minutes) => intervalSelect.add(new Option(`Every ${minutes} minutes`, String(minutes))));
  REMINDER_INTERVALS.forEach((minutes) => onboardingInterval.add(new Option(`Every ${minutes} minutes`, String(minutes))));
  IDLE_THRESHOLDS.forEach((minutes) => idleSelect.add(new Option(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`, String(minutes))));
  REMINDER_SOUNDS.forEach((sound) => soundSelect.add(new Option(sound.label, sound.value)));
  REMINDER_SOUNDS.forEach((sound) => onboardingSound.add(new Option(sound.label, sound.value)));
  MICROBREAK_INTERVALS.forEach((minutes) => microbreakIntervalSelect.add(new Option(`Every ${minutes} minutes`, String(minutes))));
  SCHEDULE_DAYS.forEach(({ value, shortLabel, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'schedule-day';
    button.dataset.scheduleDay = value;
    button.textContent = shortLabel;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', 'false');
    scheduleDays.append(button);
  });
  REMINDER_POSITIONS.forEach((position) => {
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'reminder-position'; input.value = position; input.id = `position-${position}`;
    const label = document.createElement('label');
    label.htmlFor = input.id; label.title = position.replaceAll('-', ' ');
    label.append(input, document.createElement('span'));
    positionGrid.append(label);
  });
  COLORS.forEach(({ value, hex }) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'swatch'; button.dataset.color = value;
    button.title = value; button.setAttribute('aria-label', value); button.style.setProperty('--swatch', hex);
    colorSwatches.append(button);
  });
  BOARD_COLORS.forEach(({ value, hex }) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'swatch board-swatch'; button.dataset.boardColor = value;
    button.title = `${value} board`; button.setAttribute('aria-label', `${value} board`); button.style.setProperty('--swatch', hex);
    boardColorSwatches.append(button);
  });
}

function resolvedTheme(theme: AppearanceTheme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: AppearanceTheme): void {
  document.documentElement.dataset.theme = resolvedTheme(theme);
  document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === theme);
  });
}

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
  const minute = (minutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

function timeToMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : undefined;
}

function activeDaySummary(days: ScheduleDay[]): string {
  if (days.length === 7) return 'Every day';
  const weekdays: ScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (days.length === 5 && weekdays.every((day) => days.includes(day))) return 'Monday–Friday';
  if (days.length === 2 && days.includes('saturday') && days.includes('sunday')) return 'Weekends';
  return SCHEDULE_DAYS.filter(({ value }) => days.includes(value)).map(({ shortLabel }) => shortLabel).join(', ');
}

function renderScheduleSummary(settings: StandUpSettings): void {
  const scheduleList = document.querySelector<HTMLElement>('.schedule-list');
  scheduleList?.classList.toggle('schedule-disabled', !settings.scheduleEnabled);
  if (!settings.scheduleEnabled) {
    scheduleSummary.textContent = 'Always active';
    scheduleDetail.textContent = 'Scheduling is off, so active time can count every day.';
    return;
  }
  const overnight = settings.scheduleStartMinutes > settings.scheduleEndMinutes;
  scheduleSummary.textContent = `${activeDaySummary(settings.scheduleActiveDays)} · ${minutesToTime(settings.scheduleStartMinutes)}–${minutesToTime(settings.scheduleEndMinutes)}`;
  scheduleDetail.textContent = overnight
    ? 'Overnight schedule · the active period continues into the following morning.'
    : 'Progress pauses outside this window and resumes automatically.';
}

function formatStatus(status: TimerStatus): string {
  if (status.popupVisible) return 'Reminder is showing';
  if (status.isPaused && status.pauseUntil) {
    const minutes = Math.max(1, Math.ceil((status.pauseUntil - Date.now()) / 60_000));
    return `Paused for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (status.scheduleBlocked) {
    return status.reminderPending
      ? 'Reminder due · waiting for scheduled hours'
      : 'Outside scheduled hours · progress preserved';
  }
  if (status.reminderPending) return 'Reminder ready — waiting for a suitable moment';
  const minutes = Math.max(1, Math.ceil(status.remainingMilliseconds / 60_000));
  return `Active · next reminder in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function setSaving(saving: boolean, message?: string): void {
  saveState.textContent = message ?? (saving ? 'Saving…' : 'Settings saved automatically');
  saveState.classList.toggle('saving', saving);
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('invoke') || message.includes('undefined')
    ? 'Preview mode · settings are not persisted'
    : message;
}

function restartMelloPreview(force = false, animateEntrance = false): void {
  const reducedMotion = currentSettings.followSystemReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const signature = JSON.stringify({
    reducedMotion,
    motionStyle: currentSettings.melloMotionStyle,
    color: currentSettings.melloColor,
    keepSameColor: currentSettings.melloKeepSameColor,
    mood: currentSettings.sessionMoodEnabled ? 'energetic' : 'neutral',
  });
  if (!force && previewController && previewSignature === signature) {
    return;
  }
  previewController?.destroy();
  previewSeed += 1;
  previewSignature = signature;
  previewController = createMelloRenderer(melloCanvas, previewSeed, {
    reducedMotion,
    motionStyle: currentSettings.melloMotionStyle,
    color: currentSettings.melloColor,
    keepSameColor: currentSettings.melloKeepSameColor,
    mood: currentSettings.sessionMoodEnabled ? 'energetic' : 'neutral',
    messageColor: BOARD_COLORS.find(({ value }) => value === currentSettings.melloBoardColor)?.hex,
    animateEntrance,
    maxWidth: 430,
    maxHeight: 230,
    onPose: followPreviewPose
  });
}

function renderSettings(settings: StandUpSettings): void {
  const previousVisual = currentSettings.reminderVisual;
  currentSettings = { ...DEFAULT_SETTINGS, ...settings };
  intervalSelect.value = String(currentSettings.reminderIntervalMinutes);
  idleSelect.value = String(currentSettings.idleThresholdMinutes);
  loginToggle.checked = currentSettings.launchAtLogin;
  reduceMotionToggle.checked = currentSettings.followSystemReducedMotion;
  soundSelect.value = currentSettings.reminderSound;
  motionStyleSelect.value = currentSettings.melloMotionStyle;
  pointerToggle.checked = currentSettings.melloReactsToPointer;
  sameColorToggle.checked = currentSettings.melloKeepSameColor;
  fullscreenToggle.checked = currentSettings.suppressDuringFullscreen;
  dndFullscreenToggle.checked = currentSettings.suppressDuringFullscreen;
  breakCheckToggle.checked = currentSettings.breakCheckEnabled;
  peekToggle.checked = currentSettings.peekEnabled;
  movesToggle.checked = currentSettings.melloMovesEnabled;
  microbreakToggle.checked = currentSettings.microbreakEnabled;
  microbreakIntervalSelect.value = String(currentSettings.microbreakIntervalMinutes);
  microbreakIntervalRow.classList.toggle('disabled', !currentSettings.microbreakEnabled);
  sessionMoodToggle.checked = currentSettings.sessionMoodEnabled;
  shortcutTogglePause.value = currentSettings.shortcutTogglePause;
  shortcutPreview.value = currentSettings.shortcutPreview;
  shortcutSnooze.value = currentSettings.shortcutSnooze;
  moveCategories.parentElement?.classList.toggle('disabled', !currentSettings.melloMovesEnabled);
  document.querySelectorAll<HTMLButtonElement>('[data-move-category]').forEach((button) => {
    const active = currentSettings.melloMoveCategories.includes(button.dataset.moveCategory as MoveCategory);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  scheduleToggle.checked = currentSettings.scheduleEnabled;
  scheduleStartTime.value = minutesToTime(currentSettings.scheduleStartMinutes);
  scheduleEndTime.value = minutesToTime(currentSettings.scheduleEndMinutes);
  document.querySelectorAll<HTMLButtonElement>('[data-schedule-day]').forEach((button) => {
    const active = currentSettings.scheduleActiveDays.includes(button.dataset.scheduleDay as ScheduleDay);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  monitorSelect.value = currentSettings.selectedMonitor;
  document.querySelectorAll<HTMLButtonElement>('[data-visual]').forEach((button) => button.classList.toggle('active', button.dataset.visual === currentSettings.reminderVisual));
  document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((button) => button.classList.toggle('active', button.dataset.color === currentSettings.melloColor));
  document.querySelectorAll<HTMLButtonElement>('[data-board-color]').forEach((button) => button.classList.toggle('active', button.dataset.boardColor === currentSettings.melloBoardColor));
  colorSwatches.toggleAttribute('aria-disabled', !currentSettings.melloKeepSameColor);
  colorSwatches.style.opacity = currentSettings.melloKeepSameColor ? '1' : '.42';
  melloPreview.hidden = currentSettings.reminderVisual !== 'mello';
  melloPreview.classList.toggle('interactive', currentSettings.melloReactsToPointer);
  gifPreview.hidden = currentSettings.reminderVisual !== 'original-gif';
  document.querySelectorAll<HTMLElement>('[data-mello-only]').forEach((element) => {
    element.hidden = currentSettings.reminderVisual !== 'mello';
  });
  if (document.activeElement !== reminderMessage) {
    reminderMessage.value = currentSettings.reminderMessage;
  }
  melloPreview.style.setProperty(
    '--board-color',
    BOARD_COLORS.find(({ value }) => value === currentSettings.melloBoardColor)?.hex ?? '#fff5e8'
  );
  messageCount.textContent = `${Array.from(reminderMessage.value).length}/25`;
  const position = document.querySelector<HTMLInputElement>(`input[name="reminder-position"][value="${currentSettings.reminderPosition}"]`);
  if (position) position.checked = true;
  applyTheme(currentSettings.appearanceTheme);
  renderScheduleSummary(currentSettings);
  onboarding.hidden = currentSettings.onboardingCompleted;
  onboardingInterval.value = String(currentSettings.reminderIntervalMinutes);
  onboardingSchedule.value = currentSettings.scheduleEnabled ? 'workweek' : 'off';
  onboardingSound.value = currentSettings.reminderSound;
  onboardingMonitor.value = currentSettings.selectedMonitor;
  if (!onboardingMonitor.value) onboardingMonitor.value = 'primary';
  onboardingColor.value = currentSettings.melloColor;
  if (currentSettings.reminderVisual === 'mello') {
    restartMelloPreview();
  } else {
    previewController?.destroy();
    previewController = undefined;
    previewSignature = '';
  }
  if (previousVisual !== currentSettings.reminderVisual) {
    const visiblePreview = currentSettings.reminderVisual === 'mello' ? melloPreview : gifPreview;
    visiblePreview.classList.remove('content-in');
    void visiblePreview.offsetWidth;
    visiblePreview.classList.add('content-in');
  }
}

function updateSettings(patch: SettingsPatch): Promise<void> {
  pendingSettingsUpdate = pendingSettingsUpdate.then(async () => {
    setSaving(true);
    try {
      renderSettings(await standUpApi.updateSettings(patch));
      setSaving(false);
    } catch (error) {
      setSaving(false, friendlyError(error));
      void standUpApi.getSettings().then(renderSettings).catch(() => undefined);
    }
  });
  return pendingSettingsUpdate;
}

async function refreshMonitors(selected = 'primary'): Promise<void> {
  monitorSelect.replaceChildren(new Option('Primary Monitor (Automatic)', 'primary'));
  onboardingMonitor.replaceChildren(new Option('Primary Monitor (Automatic)', 'primary'));
  try {
    const monitors = await standUpApi.listMonitors();
    monitors.forEach((monitor) => {
      const label = `${monitor.name} · ${monitor.width}×${monitor.height}${monitor.primary ? ' · Primary' : ''}`;
      monitorSelect.add(new Option(label, monitor.fingerprint));
      onboardingMonitor.add(new Option(label, monitor.fingerprint));
    });
  } catch {
    // Browser previews and systems without monitor enumeration use primary.
  }
  monitorSelect.value = selected;
  if (!monitorSelect.value) monitorSelect.value = 'primary';
  onboardingMonitor.value = selected;
  if (!onboardingMonitor.value) onboardingMonitor.value = 'primary';
}

async function previewReminder(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  let timeout: number | undefined;
  try {
    await pendingSettingsUpdate;
    await Promise.race([
      standUpApi.previewReminder(),
      new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Preview took too long to start')), PREVIEW_TIMEOUT_MILLISECONDS); })
    ]);
  } catch (error) {
    setSaving(false, error instanceof Error ? error.message : String(error));
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    button.disabled = false;
  }
}

function showPage(page: string): void {
  const current = document.querySelector<HTMLElement>('[data-page-panel].active');
  if (current?.dataset.pagePanel === page) return;
  if (pageTransitionTimer !== undefined) window.clearTimeout(pageTransitionTimer);
  current?.classList.add('leaving');
  document.querySelector('.workspace-header')?.classList.add('switching');
  pageTransitionTimer = window.setTimeout(() => {
    document.querySelectorAll<HTMLElement>('[data-page-panel]').forEach((panel) => {
      panel.classList.remove('leaving');
      panel.classList.toggle('active', panel.dataset.pagePanel === page);
    });
    document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === page));
    const [title, subtitle] = PAGE_COPY[page] ?? PAGE_COPY.animation!;
    pageTitle.textContent = title; pageSubtitle.textContent = subtitle;
    document.querySelector('.workspace-header')?.classList.remove('switching');
    pageTransitionTimer = undefined;
  }, 110);
}

createOptions();
renderSettings(DEFAULT_SETTINGS);

document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page ?? 'animation')));
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach((button) => button.addEventListener('click', () => {
  const theme = button.dataset.theme as AppearanceTheme;
  currentSettings.appearanceTheme = theme;
  applyTheme(theme);
  void updateSettings({ appearanceTheme: theme });
}));
document.querySelectorAll<HTMLButtonElement>('[data-visual]').forEach((button) => button.addEventListener('click', () => {
  const reminderVisual = button.dataset.visual as ReminderVisual;
  currentSettings.reminderVisual = reminderVisual;
  renderSettings(currentSettings);
  void updateSettings({ reminderVisual });
}));
colorSwatches.addEventListener('click', (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-color]'); if (button && currentSettings.melloKeepSameColor) void updateSettings({ melloColor: button.dataset.color as MelloColor }); });
boardColorSwatches.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-board-color]');
  if (!button) return;
  currentSettings.melloBoardColor = button.dataset.boardColor as MelloBoardColor;
  renderSettings(currentSettings);
  void updateSettings({ melloBoardColor: currentSettings.melloBoardColor });
});
intervalSelect.addEventListener('change', () => void updateSettings({ reminderIntervalMinutes: Number(intervalSelect.value) as StandUpSettings['reminderIntervalMinutes'] }));
idleSelect.addEventListener('change', () => void updateSettings({ idleThresholdMinutes: Number(idleSelect.value) as StandUpSettings['idleThresholdMinutes'] }));
loginToggle.addEventListener('change', () => void updateSettings({ launchAtLogin: loginToggle.checked }));
reduceMotionToggle.addEventListener('change', () => void updateSettings({ followSystemReducedMotion: reduceMotionToggle.checked }));
soundSelect.addEventListener('change', () => void updateSettings({ reminderSound: soundSelect.value as StandUpSettings['reminderSound'] }));
motionStyleSelect.addEventListener('change', () => void updateSettings({ melloMotionStyle: motionStyleSelect.value as MelloMotionStyle }));
pointerToggle.addEventListener('change', () => void updateSettings({ melloReactsToPointer: pointerToggle.checked }));
sameColorToggle.addEventListener('change', () => void updateSettings({ melloKeepSameColor: sameColorToggle.checked }));
sessionMoodToggle.addEventListener('change', () => void updateSettings({ sessionMoodEnabled: sessionMoodToggle.checked }));
breakCheckToggle.addEventListener('change', () => void updateSettings({ breakCheckEnabled: breakCheckToggle.checked }));
peekToggle.addEventListener('change', () => void updateSettings({ peekEnabled: peekToggle.checked }));
movesToggle.addEventListener('change', () => void updateSettings({ melloMovesEnabled: movesToggle.checked }));
microbreakToggle.addEventListener('change', () => void updateSettings({ microbreakEnabled: microbreakToggle.checked }));
microbreakIntervalSelect.addEventListener('change', () => void updateSettings({
  microbreakIntervalMinutes: Number(microbreakIntervalSelect.value) as StandUpSettings['microbreakIntervalMinutes']
}));
moveCategories.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-move-category]');
  if (!button || !currentSettings.melloMovesEnabled) return;
  const category = button.dataset.moveCategory as MoveCategory;
  const selected = currentSettings.melloMoveCategories.includes(category);
  const next = selected
    ? currentSettings.melloMoveCategories.filter((candidate) => candidate !== category)
    : [...currentSettings.melloMoveCategories, category];
  if (next.length === 0) { setSaving(false, 'Choose at least one Mello Moves category'); return; }
  currentSettings.melloMoveCategories = next;
  renderSettings(currentSettings);
  void updateSettings({ melloMoveCategories: next });
});
scheduleToggle.addEventListener('change', () => {
  currentSettings.scheduleEnabled = scheduleToggle.checked;
  renderScheduleSummary(currentSettings);
  void updateSettings({ scheduleEnabled: scheduleToggle.checked });
});
scheduleDays.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-schedule-day]');
  if (!button) return;
  const day = button.dataset.scheduleDay as ScheduleDay;
  const selected = currentSettings.scheduleActiveDays.includes(day);
  const nextDays = selected
    ? currentSettings.scheduleActiveDays.filter((candidate) => candidate !== day)
    : [...currentSettings.scheduleActiveDays, day];
  if (nextDays.length === 0) {
    setSaving(false, 'Choose at least one active day');
    return;
  }
  currentSettings.scheduleActiveDays = nextDays;
  renderSettings(currentSettings);
  void updateSettings({ scheduleActiveDays: nextDays });
});
scheduleStartTime.addEventListener('change', () => {
  const minutes = timeToMinutes(scheduleStartTime.value);
  if (minutes === undefined || minutes === currentSettings.scheduleEndMinutes) {
    scheduleStartTime.value = minutesToTime(currentSettings.scheduleStartMinutes);
    setSaving(false, 'Start and end times must be different');
    return;
  }
  currentSettings.scheduleStartMinutes = minutes;
  renderScheduleSummary(currentSettings);
  void updateSettings({ scheduleStartMinutes: minutes });
});
scheduleEndTime.addEventListener('change', () => {
  const minutes = timeToMinutes(scheduleEndTime.value);
  if (minutes === undefined || minutes === currentSettings.scheduleStartMinutes) {
    scheduleEndTime.value = minutesToTime(currentSettings.scheduleEndMinutes);
    setSaving(false, 'Start and end times must be different');
    return;
  }
  currentSettings.scheduleEndMinutes = minutes;
  renderScheduleSummary(currentSettings);
  void updateSettings({ scheduleEndMinutes: minutes });
});
reminderMessage.addEventListener('input', () => {
  const characters = Array.from(reminderMessage.value);
  if (characters.length > 25) {
    reminderMessage.value = characters.slice(0, 25).join('');
  }
  messageCount.textContent = `${Array.from(reminderMessage.value).length}/25`;
  currentSettings.reminderMessage = reminderMessage.value;
  if (messageSaveTimer !== undefined) window.clearTimeout(messageSaveTimer);
  messageSaveTimer = window.setTimeout(() => {
    if (currentSettings.reminderMessage.trim()) {
      void updateSettings({ reminderMessage: currentSettings.reminderMessage });
    }
  }, 280);
});
reminderMessage.addEventListener('blur', () => {
  if (!reminderMessage.value.trim()) {
    reminderMessage.value = DEFAULT_SETTINGS.reminderMessage;
    currentSettings.reminderMessage = reminderMessage.value;
  }
  if (messageSaveTimer !== undefined) window.clearTimeout(messageSaveTimer);
  void updateSettings({ reminderMessage: currentSettings.reminderMessage });
});
monitorSelect.addEventListener('change', () => void updateSettings({ selectedMonitor: monitorSelect.value }));
positionGrid.addEventListener('change', (event) => { const input = event.target; if (input instanceof HTMLInputElement) void updateSettings({ reminderPosition: input.value as ReminderPosition }); });
[fullscreenToggle, dndFullscreenToggle].forEach((toggle) => toggle.addEventListener('change', () => void updateSettings({ suppressDuringFullscreen: toggle.checked })));
byId<HTMLButtonElement>('sound-preview-button').addEventListener('click', () => void standUpApi.previewSound().catch((error) => setSaving(false, String(error))));
[byId<HTMLButtonElement>('preview-button'), byId<HTMLButtonElement>('reminders-preview-button')].forEach((button) => button.addEventListener('click', () => void previewReminder(button)));
document.querySelectorAll<HTMLButtonElement>('[data-snooze]').forEach((button) => button.addEventListener('click', async () => { await standUpApi.pauseTimer(Number(button.dataset.snooze) as 30 | 60 | 120); statusLabel.textContent = `Paused for ${button.dataset.snooze} minutes`; showPage('general'); }));
document.querySelectorAll<HTMLButtonElement>('[data-pause-until]').forEach((button) => button.addEventListener('click', async () => {
  try {
    const mode = button.dataset.pauseUntil as 'tomorrow' | 'next-schedule';
    const deadline = await standUpApi.pauseUntil(mode);
    statusLabel.textContent = `Paused until ${new Date(deadline).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
    showPage('general');
  } catch (error) { setSaving(false, friendlyError(error)); }
}));
byId<HTMLButtonElement>('resume-button').addEventListener('click', async () => { await standUpApi.resumeTimer(); showPage('general'); });

const shortcutFields: Array<[HTMLInputElement, keyof Pick<StandUpSettings, 'shortcutTogglePause' | 'shortcutPreview' | 'shortcutSnooze'>]> = [
  [shortcutTogglePause, 'shortcutTogglePause'], [shortcutPreview, 'shortcutPreview'], [shortcutSnooze, 'shortcutSnooze']
];
shortcutFields.forEach(([input, key]) => {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.value = ''; input.blur(); }
    if (event.key === 'Enter') input.blur();
  });
  input.addEventListener('blur', () => void updateSettings({ [key]: input.value.trim() }));
});

byId<HTMLButtonElement>('onboarding-skip').addEventListener('click', () => void updateSettings({ onboardingCompleted: true }));
byId<HTMLButtonElement>('onboarding-finish').addEventListener('click', () => void updateSettings({
  reminderIntervalMinutes: Number(onboardingInterval.value) as StandUpSettings['reminderIntervalMinutes'],
  scheduleEnabled: onboardingSchedule.value === 'workweek',
  scheduleActiveDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  scheduleStartMinutes: 9 * 60,
  scheduleEndMinutes: 18 * 60,
  reminderSound: onboardingSound.value as StandUpSettings['reminderSound'],
  selectedMonitor: onboardingMonitor.value,
  melloColor: onboardingColor.value as MelloColor,
  melloKeepSameColor: true,
  onboardingCompleted: true
}));
melloPreview.addEventListener('pointermove', (event) => {
  if (!currentSettings.melloReactsToPointer || !previewController) return;
  const rect = melloPreview.getBoundingClientRect();
  previewController.setCursor({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, inside: true });
  if (previewController.isDragging()) {
    const point = previewPoint(event);
    previewController.pointerMove(point.x, point.y, event.timeStamp);
  }
});
melloPreview.addEventListener('pointerleave', () => previewController?.setCursor({ x: .5, y: .55, inside: false }));
melloCanvas.addEventListener('pointerdown', (event) => {
  if (!currentSettings.melloReactsToPointer || !previewController) return;
  const point = previewPoint(event);
  if (!previewController.pointerDown(point.x, point.y, event.timeStamp)) return;
  event.preventDefault();
  melloCanvas.setPointerCapture(event.pointerId);
  melloCanvas.classList.add('is-grabbing');
});
melloCanvas.addEventListener('pointerup', (event) => {
  if (!previewController?.isDragging()) return;
  const point = previewPoint(event);
  previewController.pointerUp(point.x, point.y, event.timeStamp);
  if (melloCanvas.hasPointerCapture(event.pointerId)) melloCanvas.releasePointerCapture(event.pointerId);
  melloCanvas.classList.remove('is-grabbing');
});
melloCanvas.addEventListener('pointercancel', (event) => {
  if (!previewController?.isDragging()) return;
  const point = previewPoint(event);
  previewController.pointerUp(point.x, point.y, event.timeStamp);
  melloCanvas.classList.remove('is-grabbing');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (currentSettings.appearanceTheme === 'system') applyTheme('system'); });

void standUpApi.getSettings().then(async (settings) => { await refreshMonitors(settings.selectedMonitor); renderSettings(settings); statusLabel.textContent = formatStatus(await standUpApi.getTimerStatus()); }).catch(() => { void refreshMonitors(); setSaving(false, 'Preview mode · settings are not persisted'); });
window.setInterval(() => { void standUpApi.getTimerStatus().then((status) => { statusLabel.textContent = formatStatus(status); }).catch(() => undefined); }, 1_000);
window.addEventListener('focus', () => void refreshMonitors(currentSettings.selectedMonitor));
window.addEventListener('beforeunload', () => previewController?.destroy());
