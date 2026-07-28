export interface TimerTickInput {
  now: number;
  idleSeconds: number;
  blocked: boolean;
  popupVisible: boolean;
}

export interface TimerTickResult {
  shouldShowReminder: boolean;
}

export class TimerEngine {
  private accumulatedMilliseconds = 0;
  private lastTick: number | null = null;
  private reminderPending = false;
  private pauseUntil: number | null = null;
  private systemBlocked = false;

  constructor(
    private reminderIntervalMinutes: number,
    private idleThresholdMinutes: number
  ) {}

  tick(input: TimerTickInput): TimerTickResult {
    const elapsed =
      this.lastTick === null ? 0 : Math.max(0, input.now - this.lastTick);
    this.lastTick = input.now;

    const pauseExpired =
      this.pauseUntil !== null && input.now >= this.pauseUntil;
    if (pauseExpired) {
      this.pauseUntil = null;
    }

    const manuallyPaused =
      this.pauseUntil !== null && input.now < this.pauseUntil;
    const idle =
      input.idleSeconds >= Math.max(1, this.idleThresholdMinutes) * 60;
    const safeElapsed = elapsed <= 5_000 ? elapsed : 0;

    if (
      !this.reminderPending &&
      !pauseExpired &&
      !manuallyPaused &&
      !this.systemBlocked &&
      !idle &&
      !input.popupVisible
    ) {
      this.accumulatedMilliseconds += safeElapsed;
      if (
        this.accumulatedMilliseconds >=
        this.reminderIntervalMinutes * 60_000
      ) {
        this.reminderPending = true;
      }
    }

    return {
      shouldShowReminder:
        this.reminderPending &&
        !manuallyPaused &&
        !this.systemBlocked &&
        !idle &&
        !input.blocked &&
        !input.popupVisible
    };
  }

  markReminderShown(now: number): void {
    this.accumulatedMilliseconds = 0;
    this.reminderPending = false;
    this.lastTick = now;
  }

  setReminderInterval(minutes: number): void {
    this.reminderIntervalMinutes = minutes;
    this.accumulatedMilliseconds = 0;
    this.reminderPending = false;
  }

  setIdleThreshold(minutes: number): void {
    this.idleThresholdMinutes = minutes;
  }

  setSystemBlocked(blocked: boolean, now: number): void {
    this.systemBlocked = blocked;
    this.lastTick = now;
  }

  pauseFor(milliseconds: number, now: number): void {
    this.pauseUntil = now + milliseconds;
    this.lastTick = now;
  }

  resume(now: number): void {
    this.pauseUntil = null;
    this.lastTick = now;
  }

  getStatus(now: number, popupVisible: boolean) {
    const intervalMilliseconds = this.reminderIntervalMinutes * 60_000;
    return {
      remainingMilliseconds: this.reminderPending
        ? 0
        : Math.max(0, intervalMilliseconds - this.accumulatedMilliseconds),
      accumulatedMilliseconds: this.accumulatedMilliseconds,
      isPaused: this.pauseUntil !== null && now < this.pauseUntil,
      pauseUntil:
        this.pauseUntil !== null && now < this.pauseUntil
          ? this.pauseUntil
          : null,
      reminderPending: this.reminderPending,
      popupVisible
    };
  }
}
