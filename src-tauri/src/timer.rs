use serde::Serialize;

#[derive(Debug, Clone, Copy)]
pub struct TickInput {
    pub now_ms: u64,
    pub idle_seconds: u64,
    pub blacklisted: bool,
    pub popup_visible: bool,
    pub system_blocked: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerStatus {
    pub remaining_milliseconds: u64,
    pub accumulated_milliseconds: u64,
    pub is_paused: bool,
    pub pause_until: Option<u64>,
    pub reminder_pending: bool,
    pub popup_visible: bool,
}

pub struct TimerEngine {
    reminder_interval_ms: u64,
    idle_threshold_seconds: u64,
    accumulated_ms: u64,
    last_tick_ms: Option<u64>,
    pause_until: Option<u64>,
    reminder_pending: bool,
}

impl TimerEngine {
    pub fn new(reminder_interval_minutes: u16, idle_threshold_minutes: u16) -> Self {
        Self {
            reminder_interval_ms: u64::from(reminder_interval_minutes) * 60_000,
            idle_threshold_seconds: u64::from(idle_threshold_minutes) * 60,
            accumulated_ms: 0,
            last_tick_ms: None,
            pause_until: None,
            reminder_pending: false,
        }
    }

    pub fn tick(&mut self, input: TickInput) -> bool {
        let elapsed = self
            .last_tick_ms
            .map(|last| input.now_ms.saturating_sub(last))
            .unwrap_or(0);
        self.last_tick_ms = Some(input.now_ms);

        let paused = self
            .pause_until
            .is_some_and(|deadline| input.now_ms < deadline);
        if self
            .pause_until
            .is_some_and(|deadline| input.now_ms >= deadline)
        {
            self.pause_until = None;
        }

        if !paused
            && !input.system_blocked
            && input.idle_seconds < self.idle_threshold_seconds
            && !input.popup_visible
            && !self.reminder_pending
        {
            self.accumulated_ms = self.accumulated_ms.saturating_add(elapsed);
            if self.accumulated_ms >= self.reminder_interval_ms {
                self.reminder_pending = true;
            }
        }

        self.reminder_pending && !input.blacklisted && !input.popup_visible && !paused
    }

    pub fn mark_reminder_shown(&mut self, now_ms: u64) {
        self.accumulated_ms = 0;
        self.reminder_pending = false;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn pause_for(&mut self, duration_ms: u64, now_ms: u64) {
        self.pause_until = Some(now_ms.saturating_add(duration_ms));
        self.last_tick_ms = Some(now_ms);
    }

    pub fn resume(&mut self, now_ms: u64) {
        self.pause_until = None;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn set_reminder_interval(&mut self, minutes: u16, now_ms: u64) {
        self.reminder_interval_ms = u64::from(minutes) * 60_000;
        self.accumulated_ms = 0;
        self.reminder_pending = false;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn set_idle_threshold(&mut self, minutes: u16) {
        self.idle_threshold_seconds = u64::from(minutes) * 60;
    }

    pub fn status(&self, now_ms: u64, popup_visible: bool) -> TimerStatus {
        let is_paused = self
            .pause_until
            .is_some_and(|deadline| now_ms < deadline);
        TimerStatus {
            remaining_milliseconds: self
                .reminder_interval_ms
                .saturating_sub(self.accumulated_ms),
            accumulated_milliseconds: self.accumulated_ms,
            is_paused,
            pause_until: self.pause_until.filter(|_| is_paused),
            reminder_pending: self.reminder_pending,
            popup_visible,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn active(now_ms: u64) -> TickInput {
        TickInput {
            now_ms,
            idle_seconds: 0,
            blacklisted: false,
            popup_visible: false,
            system_blocked: false,
        }
    }

    #[test]
    fn accumulates_only_active_time() {
        let mut timer = TimerEngine::new(15, 3);
        timer.tick(active(0));
        timer.tick(active(30_000));
        timer.tick(TickInput {
            now_ms: 60_000,
            idle_seconds: 240,
            ..active(60_000)
        });
        assert_eq!(timer.status(60_000, false).accumulated_milliseconds, 30_000);
    }

    #[test]
    fn defers_a_due_reminder_while_blacklisted() {
        let mut timer = TimerEngine::new(15, 3);
        timer.tick(active(0));
        assert!(!timer.tick(TickInput {
            now_ms: 900_000,
            blacklisted: true,
            ..active(900_000)
        }));
        assert!(timer.status(900_000, false).reminder_pending);
        assert!(timer.tick(active(901_000)));
    }

    #[test]
    fn pause_and_system_blocks_do_not_accumulate() {
        let mut timer = TimerEngine::new(15, 3);
        timer.tick(active(0));
        timer.pause_for(30_000, 0);
        timer.tick(active(20_000));
        timer.tick(TickInput {
            now_ms: 40_000,
            system_blocked: true,
            ..active(40_000)
        });
        assert_eq!(timer.status(40_000, false).accumulated_milliseconds, 0);
    }

    #[test]
    fn changing_interval_starts_a_fresh_cycle() {
        let mut timer = TimerEngine::new(15, 3);
        timer.tick(active(0));
        timer.tick(active(60_000));
        timer.set_reminder_interval(30, 60_000);
        let status = timer.status(60_000, false);
        assert_eq!(status.accumulated_milliseconds, 0);
        assert_eq!(status.remaining_milliseconds, 1_800_000);
    }
}
