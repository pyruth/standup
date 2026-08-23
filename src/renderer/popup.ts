import { invoke } from '@tauri-apps/api/core';
import lottie, {
  type AnimationItem
} from 'lottie-web/build/player/lottie_light_canvas';
import { loadAndDecodeAnimation } from './animation-loader.js';
import { waitForLottieReady } from './lottie-loader.js';
import {
  createMelloRenderer,
  type MelloController
} from './mello-renderer.js';
import type { CursorSample } from './mello-physics.js';

type ActiveAnimation =
  | { kind: 'default' }
  | { kind: 'gif'; url: string }
  | { kind: 'lottie'; data: unknown };

interface PopupConfiguration {
  position: string;
  animation: ActiveAnimation;
}

const LOAD_TIMEOUT_MILLISECONDS = 3_500;
const reminder = document.querySelector<HTMLElement>('.reminder');
const gifAnimation = document.querySelector<HTMLImageElement>('.gif-animation');
const lottieContainer = document.querySelector<HTMLElement>(
  '.lottie-animation'
);
const melloStage = document.querySelector<HTMLElement>('.mello-stage');
const melloCanvas = document.querySelector<HTMLCanvasElement>('.mello-canvas');
let lottieAnimation: AnimationItem | undefined;
let melloController: MelloController | undefined;
let cursorInterval: number | undefined;
let cursorRequestActive = false;

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
}

function startCursorPolling(): void {
  stopCursorPolling();
  cursorInterval = window.setInterval(() => {
    if (!melloController || cursorRequestActive) {
      return;
    }
    cursorRequestActive = true;
    void invoke<CursorSample>('popup_cursor')
      .then((sample) => melloController?.setCursor(sample))
      .catch(() => undefined)
      .finally(() => {
        cursorRequestActive = false;
      });
  }, 50);
}

function prepareMello(): void {
  if (!melloStage || !melloCanvas || !gifAnimation || !lottieContainer) {
    throw new Error('The Mello mascot elements are unavailable');
  }
  lottieAnimation?.destroy();
  lottieAnimation = undefined;
  lottieContainer.replaceChildren();
  lottieContainer.hidden = true;
  gifAnimation.hidden = true;
  hideMello();
  melloStage.hidden = false;
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;
  melloController = createMelloRenderer(
    melloCanvas,
    randomSeed(),
    reducedMotion
  );
  startCursorPolling();
}

async function prepareGif(source: string): Promise<void> {
  if (!gifAnimation || !lottieContainer) {
    throw new Error('The reminder image element is unavailable');
  }
  hideMello();
  lottieContainer.hidden = true;
  gifAnimation.hidden = false;
  try {
    await loadAndDecodeAnimation(
      gifAnimation,
      source,
      LOAD_TIMEOUT_MILLISECONDS
    );
  } catch {
    prepareMello();
  }
}

async function prepareLottie(data: unknown): Promise<void> {
  if (!gifAnimation || !lottieContainer) {
    throw new Error('The reminder animation container is unavailable');
  }
  hideMello();
  gifAnimation.hidden = true;
  lottieContainer.hidden = false;
  const rendererSettings = {
    clearCanvas: true,
    preserveAspectRatio: 'xMidYMid meet',
    runExpressions: false
  };
  let animation: AnimationItem | undefined;
  try {
    animation = lottie.loadAnimation({
      container: lottieContainer,
      renderer: 'canvas',
      loop: true,
      autoplay: false,
      animationData: data as Record<string, unknown>,
      rendererSettings
    });
    await waitForLottieReady(
      animation,
      () => {
        const canvas = lottieContainer.querySelector('canvas');
        return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
      },
      LOAD_TIMEOUT_MILLISECONDS
    );
    lottieAnimation = animation;
  } catch {
    animation?.destroy();
    lottieContainer.replaceChildren();
    prepareMello();
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
    case 'lottie':
      await prepareLottie(configuration.animation.data);
      break;
    case 'gif':
      await prepareGif(`${configuration.animation.url}?v=${Date.now()}`);
      break;
    case 'default':
      prepareMello();
      break;
  }

  reminder.dataset.position = configuration.position;
  await invoke<void>('popup_ready');
  lottieAnimation?.play();
  melloController?.start();
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
}

reminder?.addEventListener(
  'animationend',
  () => {
    lottieAnimation?.destroy();
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
