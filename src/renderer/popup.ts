import { invoke } from '@tauri-apps/api/core';
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light_canvas';
import { loadAnimationWithFallback } from './animation-loader.js';
import { waitForLottieReady } from './lottie-loader.js';
import defaultAnimationUrl from './assets/standup-reminder.gif?url';

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
let lottieAnimation: AnimationItem | undefined;

async function prepareGif(source: string): Promise<void> {
  if (!gifAnimation) {
    throw new Error('The reminder image element is unavailable');
  }
  if (lottieContainer) {
    lottieContainer.hidden = true;
  }
  gifAnimation.hidden = false;
  await loadAnimationWithFallback(
    gifAnimation,
    source,
    defaultAnimationUrl,
    LOAD_TIMEOUT_MILLISECONDS
  );
}

async function prepareLottie(data: unknown): Promise<void> {
  if (!gifAnimation || !lottieContainer) {
    throw new Error('The reminder animation container is unavailable');
  }
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
    lottieContainer.hidden = true;
    gifAnimation.hidden = false;
    await prepareGif(defaultAnimationUrl);
  }
}

async function prepareReminder(): Promise<void> {
  if (!reminder || !gifAnimation) {
    throw new Error('The reminder animation elements are unavailable');
  }

  const configuration = await invoke<PopupConfiguration>('popup_configuration');
  switch (configuration.animation.kind) {
    case 'lottie':
      await prepareLottie(configuration.animation.data);
      break;
    case 'gif':
      await prepareGif(`${configuration.animation.url}?v=${Date.now()}`);
      break;
    case 'default':
      await prepareGif(defaultAnimationUrl);
      break;
  }

  reminder.dataset.position = configuration.position;
  await invoke<void>('popup_ready');
  lottieAnimation?.play();
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
}

reminder?.addEventListener(
  'animationend',
  () => {
    lottieAnimation?.destroy();
    void invoke<void>('popup_finished');
  },
  { once: true }
);

void prepareReminder().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await invoke<void>('popup_failed', { message });
  } catch {
    // The Rust watchdog will destroy an unresponsive popup.
  }
});

export {};
