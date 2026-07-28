import { describe, expect, it } from 'vitest';
import { TimerEngine } from '../src/main/timer-engine.js';

describe('TimerEngine', () => {
  it('accumulates active time and emits a due reminder', () => {
    const timer = new TimerEngine(1 / 60, 3);

    expect(
      timer.tick({
        now: 0,
        idleSeconds: 0,
        blocked: false,
        popupVisible: false
      }).shouldShowReminder
    ).toBe(false);
    expect(
      timer.tick({
        now: 1_000,
        idleSeconds: 0,
        blocked: false,
        popupVisible: false
      }).shouldShowReminder
    ).toBe(true);
  });

  it('pauses accumulation while the user is idle', () => {
    const timer = new TimerEngine(1, 1);
    timer.tick({
      now: 0,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.tick({
      now: 1_000,
      idleSeconds: 60,
      blocked: false,
      popupVisible: false
    });

    expect(timer.getStatus(1_000, false).accumulatedMilliseconds).toBe(0);
  });

  it('keeps a reminder pending until a blacklisted app loses focus', () => {
    const timer = new TimerEngine(1 / 60, 3);
    timer.tick({
      now: 0,
      idleSeconds: 0,
      blocked: true,
      popupVisible: false
    });

    const blockedResult = timer.tick({
      now: 1_000,
      idleSeconds: 0,
      blocked: true,
      popupVisible: false
    });
    expect(blockedResult.shouldShowReminder).toBe(false);
    expect(timer.getStatus(1_000, false).reminderPending).toBe(true);

    const unblockedResult = timer.tick({
      now: 2_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    expect(unblockedResult.shouldShowReminder).toBe(true);
  });

  it('preserves progress during a manual pause and resumes automatically', () => {
    const timer = new TimerEngine(1, 3);
    timer.tick({
      now: 0,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.tick({
      now: 500,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.pauseFor(1_000, 500);

    timer.tick({
      now: 1_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.tick({
      now: 1_500,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    expect(timer.getStatus(1_500, false).accumulatedMilliseconds).toBe(500);

    timer.tick({
      now: 2_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    expect(timer.getStatus(2_000, false).accumulatedMilliseconds).toBe(1_000);
  });

  it('does not count lock, suspend, or long scheduling gaps', () => {
    const timer = new TimerEngine(1, 3);
    timer.tick({
      now: 0,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.setSystemBlocked(true, 1_000);
    timer.tick({
      now: 2_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.setSystemBlocked(false, 3_000);
    timer.tick({
      now: 30_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });

    expect(timer.getStatus(30_000, false).accumulatedMilliseconds).toBe(0);
  });

  it('resets progress when the interval changes or a reminder is shown', () => {
    const timer = new TimerEngine(1, 3);
    timer.tick({
      now: 0,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.tick({
      now: 10_000,
      idleSeconds: 0,
      blocked: false,
      popupVisible: false
    });
    timer.setReminderInterval(2);
    expect(timer.getStatus(10_000, false).accumulatedMilliseconds).toBe(0);

    timer.markReminderShown(11_000);
    expect(timer.getStatus(11_000, false).reminderPending).toBe(false);
    expect(timer.getStatus(11_000, false).accumulatedMilliseconds).toBe(0);
  });
});
