import defaultAnimationUrl from './assets/standup-reminder.gif?url';

declare global {
  interface Window {
    __standupRestartReminder?: (
      position: string,
      animationUrl: string
    ) => void;
  }
}

const reminder = document.querySelector<HTMLImageElement>('.reminder');

window.__standupRestartReminder = (position: string, animationUrl: string) => {
  if (!reminder) {
    return;
  }
  reminder.src =
    animationUrl === 'default'
      ? defaultAnimationUrl
      : `${animationUrl}?v=${Date.now()}`;
  reminder.dataset.position = position;
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
};

export {};
