import { invoke } from '@tauri-apps/api/core';
import bundledReminderGifUrl from './assets/standup-reminder.gif?url';
import { loadAndDecodeAnimation } from './animation-loader.js';
import {
  createMelloRenderer,
  type MelloController,
  type MelloPose
} from './mello-renderer.js';
import type { CursorSample } from './mello-physics.js';

type ActiveAnimation =
  | { kind: 'mello' }
  | { kind: 'original-gif' };

interface PopupConfiguration {
  position: string;
  animation: ActiveAnimation;
  melloMotionStyle: 'calm' | 'playful';
  melloReactsToPointer: boolean;
  melloKeepSameColor: boolean;
  melloColor: string;
  reminderMessage: string;
  movePrompt: string | null;
  purpose: 'stand' | 'preview' | 'peek' | 'microbreak' | 'celebration';
  sessionMood: 'neutral' | 'energetic' | 'sleepy';
  durationMilliseconds: number;
  melloBoardColor: string;
  followSystemReducedMotion: boolean;
}

const BOARD_COLORS: Record<string, string> = {
  cream: '#fff5e8',
  lavender: '#eeeaff',
  mint: '#e5f7f1',
  peach: '#ffe7dd',
  sunshine: '#fff1bd',
  slate: '#dfe5f2'
};

const LOAD_TIMEOUT_MILLISECONDS = 3_500;
const reminder = document.querySelector<HTMLElement>('.reminder');
const gifAnimation = document.querySelector<HTMLImageElement>('.gif-animation');
const melloStage = document.querySelector<HTMLElement>('.mello-stage');
const melloCanvas = document.querySelector<HTMLCanvasElement>('.mello-canvas');
const melloMessage = document.querySelector<HTMLElement>('.mello-message-text');
const melloMove = document.querySelector<HTMLElement>('.mello-move');
let melloController: MelloController | undefined;
let cursorInterval: number | undefined;
let cursorRequestActive = false;
let captureEnabled = false;
let captureRequestActive = false;
let melloInteractive = false;

function randomSeed(): number {
  const seed = new Uint32Array(1);
  crypto.getRandomValues(seed);
  return seed[0] ?? Date.now();
}

function stopCursorPolling(): void {
  if (cursorInterval !== undefined) {
    window.clearInterval(cursorInterval);
    cursorInterval = undefined;
  }
  cursorRequestActive = false;
}

function hideMello(): void {
  stopCursorPolling();
  melloController?.destroy();
  melloController = undefined;
  if (melloStage) {
    melloStage.hidden = true;
  }
  reminder?.classList.remove('mello-interactive', 'is-interacting');
  melloInteractive = false;
}

function canvasPoint(clientX: number, clientY: number): { x: number; y: number } {
  const rect = melloCanvas?.getBoundingClientRect();
  return rect
    ? { x: clientX - rect.left, y: clientY - rect.top }
    : { x: 0, y: 0 };
}

function moveMessageBoard(pose: MelloPose): void {
  if (!melloStage) return;
  const boardX = Math.min(melloStage.clientWidth - 92, pose.centerX + pose.width * 0.57);
  const boardY = Math.max(30, pose.centerY - pose.height * 0.63);
  melloStage.style.setProperty('--mello-message-x', `${boardX}px`);
  melloStage.style.setProperty('--mello-message-y', `${boardY}px`);
}

function setCursorCapture(enabled: boolean): void {
  if (enabled === captureEnabled || captureRequestActive) return;
  captureRequestActive = true;
  void invoke<void>('popup_capture', { enabled })
    .then(() => { captureEnabled = enabled; })
    .catch(() => undefined)
    .finally(() => { captureRequestActive = false; });
}

function startCursorPolling(): void {
  stopCursorPolling();
  cursorInterval = window.setInterval(() => {
    if (!melloController || cursorRequestActive) {
      return;
    }
    cursorRequestActive = true;
    void invoke<CursorSample>('popup_cursor')
      .then((sample) => {
        const controller = melloController;
        if (!controller || !melloCanvas) return;
        controller.setCursor(sample);
        if (!controller.isDragging()) {
          setCursorCapture(
            sample.inside && controller.hitTest(
              sample.x * melloCanvas.clientWidth,
              sample.y * melloCanvas.clientHeight
            )
          );
        }
      })
      .catch(() => undefined)
      .finally(() => {
        cursorRequestActive = false;
      });
  }, 50);
}

function prepareMello(configuration: PopupConfiguration): void {
  if (!melloStage || !melloCanvas || !gifAnimation || !melloMessage || !melloMove) {
    throw new Error('The Mello mascot elements are unavailable');
  }
  gifAnimation.hidden = true;
  hideMello();
  melloStage.hidden = false;
  melloInteractive = configuration.melloReactsToPointer;
  reminder?.classList.toggle('mello-interactive', melloInteractive);
  melloMessage.textContent = configuration.reminderMessage;
  melloMove.textContent = configuration.movePrompt ?? '';
  melloMove.hidden = !configuration.movePrompt;
  const reducedMotion =
    configuration.followSystemReducedMotion &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  melloController = createMelloRenderer(
    melloCanvas,
    randomSeed(),
    {
      reducedMotion,
      motionStyle: configuration.melloMotionStyle,
      color: configuration.melloColor,
      keepSameColor: configuration.melloKeepSameColor,
      messageColor:
        BOARD_COLORS[configuration.melloBoardColor] ?? BOARD_COLORS.cream,
      position: configuration.position,
      mood: configuration.sessionMood,
      maxWidth: 300,
      maxHeight: 180,
      onPose: moveMessageBoard
    }
  );
}

async function prepareGif(
  source: string,
  configuration: PopupConfiguration
): Promise<void> {
  if (!gifAnimation) {
    throw new Error('The reminder image element is unavailable');
  }
  hideMello();
  gifAnimation.hidden = false;
  try {
    await loadAndDecodeAnimation(
      gifAnimation,
      source,
      LOAD_TIMEOUT_MILLISECONDS
    );
  } catch {
    prepareMello(configuration);
  }
}

async function prepareReminder(): Promise<void> {
  if (!reminder || !gifAnimation) {
    throw new Error('The reminder animation elements are unavailable');
  }

  const configuration = await invoke<PopupConfiguration>(
    'popup_configuration'
  );
  switch (configuration.animation.kind) {
    case 'original-gif':
      await prepareGif(
        `${bundledReminderGifUrl}?v=${Date.now()}`,
        configuration
      );
      break;
    case 'mello':
      prepareMello(configuration);
      break;
  }

  reminder.dataset.position = configuration.position;
  reminder.dataset.purpose = configuration.purpose;
  reminder.style.setProperty('--reminder-duration', `${configuration.durationMilliseconds}ms`);
  await invoke<void>('popup_ready');
  melloController?.start();
  if (configuration.purpose === 'celebration') melloController?.triggerReaction('celebrate');
  if (melloInteractive) startCursorPolling();
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
}

function beginInteraction(event: PointerEvent): void {
  if (!melloInteractive || !melloController || !melloCanvas) return;
  const point = canvasPoint(event.clientX, event.clientY);
  if (!melloController.pointerDown(point.x, point.y, event.timeStamp)) return;
  event.preventDefault();
  melloCanvas.setPointerCapture(event.pointerId);
  melloCanvas.classList.add('is-grabbing');
  reminder?.classList.add('is-interacting');
  void invoke<void>('popup_interaction', { active: true }).catch(() => undefined);
}

function moveInteraction(event: PointerEvent): void {
  if (!melloController || !melloCanvas) return;
  const point = canvasPoint(event.clientX, event.clientY);
  if (melloController.isDragging()) {
    event.preventDefault();
    melloController.pointerMove(point.x, point.y, event.timeStamp);
  } else if (melloInteractive) {
    setCursorCapture(melloController.hitTest(point.x, point.y));
  }
}

function endInteraction(event: PointerEvent): void {
  if (!melloController || !melloCanvas || !melloController.isDragging()) return;
  const point = canvasPoint(event.clientX, event.clientY);
  melloController.pointerUp(point.x, point.y, event.timeStamp);
  if (melloCanvas.hasPointerCapture(event.pointerId)) melloCanvas.releasePointerCapture(event.pointerId);
  melloCanvas.classList.remove('is-grabbing');
  reminder?.classList.remove('is-interacting');
  void invoke<void>('popup_interaction', { active: false }).catch(() => undefined);
  setCursorCapture(melloController.hitTest(point.x, point.y));
}

melloCanvas?.addEventListener('pointerdown', beginInteraction);
melloCanvas?.addEventListener('pointermove', moveInteraction);
melloCanvas?.addEventListener('pointerup', endInteraction);
melloCanvas?.addEventListener('pointercancel', endInteraction);
melloCanvas?.addEventListener('pointerleave', (event) => {
  if (melloController?.isDragging()) return;
  const point = canvasPoint(event.clientX, event.clientY);
  setCursorCapture(Boolean(melloController?.hitTest(point.x, point.y)));
});

reminder?.addEventListener(
  'animationend',
  () => {
    hideMello();
    void invoke<void>('popup_finished');
  },
  { once: true }
);

void prepareReminder().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  hideMello();
  try {
    await invoke<void>('popup_failed', { message });
  } catch {
    // The Rust watchdog will destroy an unresponsive popup.
  }
});

export {};
