import { invoke } from '@tauri-apps/api/core';
import defaultAnimationUrl from './assets/standup-reminder.gif?url';

interface PopupConfiguration {
  position: string;
  animationUrl: string;
}

const LOAD_TIMEOUT_MILLISECONDS = 3_500;
const reminder = document.querySelector<HTMLImageElement>('.reminder');

function loadAnimation(image: HTMLImageElement, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      finish(new Error('The reminder GIF did not load in time'));
    }, LOAD_TIMEOUT_MILLISECONDS);

    const cleanup = () => {
      window.clearTimeout(timeout);
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
    };
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleLoad = () => finish();
    const handleError = () => finish(new Error('The reminder GIF could not be loaded'));

    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = source;
    if (image.complete) {
      if (image.naturalWidth > 0) {
        finish();
      } else {
        handleError();
      }
    }
  });
}

async function prepareReminder(): Promise<void> {
  if (!reminder) {
    throw new Error('The reminder image element is unavailable');
  }

  const configuration = await invoke<PopupConfiguration>('popup_configuration');
  const animationUrl =
    configuration.animationUrl === 'default'
      ? defaultAnimationUrl
      : `${configuration.animationUrl}?v=${Date.now()}`;

  const loadAndDecode = async (source: string) => {
    await loadAnimation(reminder, source);
    await reminder.decode();
    if (!reminder.complete || reminder.naturalWidth === 0) {
      throw new Error('The reminder GIF did not decode correctly');
    }
  };

  try {
    await loadAndDecode(animationUrl);
  } catch (error) {
    if (configuration.animationUrl === 'default') {
      throw error;
    }
    await loadAndDecode(defaultAnimationUrl);
  }

  reminder.dataset.position = configuration.position;
  await invoke<void>('popup_ready');
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
}

reminder?.addEventListener(
  'animationend',
  () => {
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
