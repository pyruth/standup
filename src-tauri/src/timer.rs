use serde::Serialize;

const PEEK_LEAD_MS: u64 = 60_000;

#[derive(Debug, Clone, Copy)]
pub struct TickInput {
    pub now_ms: u64,
    pub idle_seconds: u64,
    pub blacklisted: bool,
    pub popup_visible: bool,
    pub system_blocked: bool,
    pub schedule_blocked: bool,
    pub peek_enabled: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimerDecision {
    None,
    Peek,
    Microbreak,
    Stand,
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
    pub schedule_blocked: bool,
    pub microbreak_enabled: bool,
    pub microbreak_remaining_milliseconds: u64,
    pub microbreak_pending: bool,
}

pub struct TimerEngine {
    reminder_interval_ms: u64,
    idle_threshold_seconds: u64,
    accumulated_ms: u64,
    last_tick_ms: Option<u64>,
    pause_until: Option<u64>,
    reminder_pending: bool,
    schedule_blocked: bool,
    peek_shown: bool,
    microbreak_enabled: bool,
    microbreak_interval_ms: u64,
    microbreak_accumulated_ms: u64,
    microbreak_pending: bool,
}

impl TimerEngine {
    pub fn new(
        reminder_interval_minutes: u16,
        idle_threshold_minutes: u16,
        microbreak_enabled: bool,
        microbreak_interval_minutes: u16,
    ) -> Self {
        Self {
            reminder_interval_ms: u64::from(reminder_interval_minutes) * 60_000,
            idle_threshold_seconds: u64::from(idle_threshold_minutes) * 60,
            accumulated_ms: 0,
            last_tick_ms: None,
            pause_until: None,
            reminder_pending: false,
            schedule_blocked: false,
            peek_shown: false,
            microbreak_enabled,
            microbreak_interval_ms: u64::from(microbreak_interval_minutes) * 60_000,
            microbreak_accumulated_ms: 0,
            microbreak_pending: false,
        }
    }

    pub fn tick(&mut self, input: TickInput) -> TimerDecision {
        let elapsed = self
            .last_tick_ms
            .map(|last| input.now_ms.saturating_sub(last))
            .unwrap_or(0);
        self.last_tick_ms = Some(input.now_ms);
        self.schedule_blocked = input.schedule_blocked;
        let paused = self
            .pause_until
            .is_some_and(|deadline| input.now_ms < deadline);
        if self
            .pause_until
            .is_some_and(|deadline| input.now_ms >= deadline)
        {
            self.pause_until = None;
        }

        let available = !paused
            && !input.system_blocked
            && !input.schedule_blocked
            && input.idle_seconds < self.idle_threshold_seconds
            && !input.popup_visible;
        if available && !self.reminder_pending {
            self.accumulated_ms = self.accumulated_ms.saturating_add(elapsed);
            if self.accumulated_ms >= self.reminder_interval_ms {
                self.reminder_pending = true;
            }
        }
        if available && self.microbreak_enabled && !self.microbreak_pending {
            self.microbreak_accumulated_ms = self.microbreak_accumulated_ms.saturating_add(elapsed);
            if self.microbreak_accumulated_ms >= self.microbreak_interval_ms {
                self.microbreak_pending = true;
            }
        }

        if !available || input.blacklisted {
            return TimerDecision::None;
        }
        if self.reminder_pending {
            return TimerDecision::Stand;
        }
        if self.microbreak_pending {
            return TimerDecision::Microbreak;
        }
        if input.peek_enabled
            && !self.peek_shown
            && self.reminder_interval_ms > PEEK_LEAD_MS
            && self.accumulated_ms >= self.reminder_interval_ms - PEEK_LEAD_MS
        {
            self.peek_shown = true;
            return TimerDecision::Peek;
        }
        TimerDecision::None
    }

    pub fn mark_reminder_shown(&mut self, now_ms: u64) {
        self.accumulated_ms = 0;
        self.reminder_pending = false;
        self.peek_shown = false;
        self.microbreak_accumulated_ms = 0;
        self.microbreak_pending = false;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn mark_microbreak_shown(&mut self, now_ms: u64) {
        self.microbreak_accumulated_ms = 0;
        self.microbreak_pending = false;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn pause_for(&mut self, duration_ms: u64, now_ms: u64) {
        self.pause_until(now_ms.saturating_add(duration_ms), now_ms);
    }
    pub fn pause_until(&mut self, deadline_ms: u64, now_ms: u64) {
        self.pause_until = (deadline_ms > now_ms).then_some(deadline_ms);
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
        self.peek_shown = false;
        self.last_tick_ms = Some(now_ms);
    }
    pub fn set_idle_threshold(&mut self, minutes: u16) {
        self.idle_threshold_seconds = u64::from(minutes) * 60;
    }
    pub fn configure_microbreak(&mut self, enabled: bool, minutes: u16, now_ms: u64) {
        let interval = u64::from(minutes) * 60_000;
        if self.microbreak_enabled != enabled || self.microbreak_interval_ms != interval {
            self.microbreak_accumulated_ms = 0;
            self.microbreak_pending = false;
        }
        self.microbreak_enabled = enabled;
        self.microbreak_interval_ms = interval;
        self.last_tick_ms = Some(now_ms);
    }

    pub fn status(&self, now_ms: u64, popup_visible: bool) -> TimerStatus {
        let is_paused = self.pause_until.is_some_and(|deadline| now_ms < deadline);
        TimerStatus {
            remaining_milliseconds: self
                .reminder_interval_ms
                .saturating_sub(self.accumulated_ms),
            accumulated_milliseconds: self.accumulated_ms,
            is_paused,
            pause_until: self.pause_until.filter(|_| is_paused),
            reminder_pending: self.reminder_pending,
            popup_visible,
            schedule_blocked: self.schedule_blocked,
            microbreak_enabled: self.microbreak_enabled,
            microbreak_remaining_milliseconds: self
                .microbreak_interval_ms
                .saturating_sub(self.microbreak_accumulated_ms),
            microbreak_pending: self.microbreak_pending,
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
            schedule_blocked: false,
            peek_enabled: false,
        }
    }

    #[test]
    fn accumulates_only_active_time() {
        let mut timer = TimerEngine::new(15, 3, false, 20);
        timer.tick(active(0));
        timer.tick(active(30_000));
        timer.tick(TickInput {
            idle_seconds: 240,
            ..active(60_000)
        });
        assert_eq!(timer.status(60_000, false).accumulated_milliseconds, 30_000);
    }

    #[test]
    fn defers_a_due_reminder_while_blacklisted() {
        let mut timer = TimerEngine::new(15, 3, false, 20);
        timer.tick(active(0));
        assert_eq!(
            timer.tick(TickInput {
                blacklisted: true,
                ..active(900_000)
            }),
            TimerDecision::None
        );
        assert!(timer.status(900_000, false).reminder_pending);
        assert_eq!(timer.tick(active(901_000)), TimerDecision::Stand);
    }

    #[test]
    fn pause_schedule_and_system_blocks_do_not_accumulate() {
        let mut timer = TimerEngine::new(15, 3, false, 20);
        timer.tick(active(0));
        timer.pause_for(30_000, 0);
        timer.tick(active(20_000));
        timer.tick(TickInput {
            system_blocked: true,
            ..active(40_000)
        });
        timer.tick(TickInput {
            schedule_blocked: true,
            ..active(50_000)
        });
        assert_eq!(timer.status(50_000, false).accumulated_milliseconds, 0);
    }

    #[test]
    fn changing_interval_starts_a_fresh_cycle() {
        let mut timer = TimerEngine::new(15, 3, false, 20);
        timer.tick(active(0));
        timer.tick(active(60_000));
        timer.set_reminder_interval(30, 60_000);
        assert_eq!(
            timer.status(60_000, false).remaining_milliseconds,
            1_800_000
        );
    }

    #[test]
    fn peek_fires_once_before_each_stand_reminder() {
        let mut timer = TimerEngine::new(15, 3, false, 20);
        timer.tick(active(0));
        assert_eq!(
            timer.tick(TickInput {
                peek_enabled: true,
                ..active(840_000)
            }),
            TimerDecision::Peek
        );
        assert_eq!(
            timer.tick(TickInput {
                peek_enabled: true,
                ..active(841_000)
            }),
            TimerDecision::None
        );
        assert_eq!(
            timer.tick(TickInput {
                peek_enabled: true,
                ..active(900_000)
            }),
            TimerDecision::Stand
        );
        timer.mark_reminder_shown(900_000);
        assert_eq!(
            timer.tick(TickInput {
                peek_enabled: true,
                ..active(1_740_000)
            }),
            TimerDecision::Peek
        );
    }

    #[test]
    fn microbreaks_have_an_independent_optional_rhythm() {
        let mut timer = TimerEngine::new(45, 3, true, 10);
        timer.tick(active(0));
        assert_eq!(timer.tick(active(600_000)), TimerDecision::Microbreak);
        timer.mark_microbreak_shown(600_000);
        assert_eq!(
            timer.status(600_000, false).remaining_milliseconds,
            2_100_000
        );
        assert_eq!(timer.tick(active(1_200_000)), TimerDecision::Microbreak);
    }
}
