declare global {
  interface Window {
    __standupRestartReminder?: (position: string) => void;
  }
}

const reminder = document.querySelector<HTMLImageElement>('.reminder');

window.__standupRestartReminder = (position: string) => {
  if (!reminder) {
    return;
  }
  reminder.dataset.position = position;
  reminder.classList.remove('is-showing');
  void reminder.offsetWidth;
  reminder.classList.add('is-showing');
};

export {};
