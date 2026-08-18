import { invoke } from '@tauri-apps/api/core';
import { loadAnimationWithFallback } from './animation-loader.js';
import defaultAnimationUrl from './assets/standup-reminder.gif?url';

interface PopupConfiguration {
  position: string;
  animationUrl: string;
}

const LOAD_TIMEOUT_MILLISECONDS = 3_500;
const reminder = document.querySelector<HTMLImageElement>('.reminder');

async function prepareReminder(): Promise<void> {
  if (!reminder) {
    throw new Error('The reminder image element is unavailable');
  }

  const configuration = await invoke<PopupConfiguration>('popup_configuration');
  const animationUrl =
    configuration.animationUrl === 'default'
      ? defaultAnimationUrl
      : `${configuration.animationUrl}?v=${Date.now()}`;

  await loadAnimationWithFallback(
    reminder,
    animationUrl,
    defaultAnimationUrl,
    LOAD_TIMEOUT_MILLISECONDS
  );

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
