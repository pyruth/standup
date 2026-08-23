use crate::settings::MoveCategory;
use serde::Serialize;

const BREAK_AWAY_SECONDS: u64 = 45;
const BREAK_RETURN_SECONDS: u64 = 5;
const BREAK_CHECK_WINDOW_MS: u64 = 5 * 60_000;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SessionMood {
    Neutral,
    Energetic,
    Sleepy,
}

#[derive(Debug, Clone, Copy)]
struct BreakObservation {
    deadline_ms: u64,
    saw_away: bool,
}

#[derive(Default)]
pub struct WellnessState {
    observation: Option<BreakObservation>,
    mood_score: i8,
    celebration_pending: bool,
    prompt_cursor: usize,
}

impl WellnessState {
    pub fn reminder_shown(&mut self, now_ms: u64, break_check_enabled: bool) {
        self.observation = break_check_enabled.then_some(BreakObservation {
            deadline_ms: now_ms.saturating_add(BREAK_CHECK_WINDOW_MS),
            saw_away: false,
        });
    }

    pub fn tick(&mut self, now_ms: u64, idle_seconds: u64, break_check_enabled: bool) {
        if !break_check_enabled {
            self.observation = None;
            self.celebration_pending = false;
            return;
        }
        let Some(mut observation) = self.observation else {
            return;
        };
        if idle_seconds >= BREAK_AWAY_SECONDS {
            observation.saw_away = true;
        }
        if now_ms >= observation.deadline_ms && !observation.saw_away {
            self.mood_score = (self.mood_score - 1).max(-2);
            self.observation = None;
            return;
        }
        if observation.saw_away && idle_seconds < BREAK_RETURN_SECONDS {
            self.mood_score = (self.mood_score + 1).min(2);
            self.celebration_pending = true;
            self.observation = None;
        } else {
            self.observation = Some(observation);
        }
    }

    pub fn take_celebration(&mut self, popup_busy: bool) -> bool {
        if self.celebration_pending && !popup_busy {
            self.celebration_pending = false;
            true
        } else {
            false
        }
    }

    pub fn mood(&self, enabled: bool) -> SessionMood {
        if !enabled {
            return SessionMood::Neutral;
        }
        match self.mood_score {
            score if score > 0 => SessionMood::Energetic,
            score if score < 0 => SessionMood::Sleepy,
            _ => SessionMood::Neutral,
        }
    }

    pub fn next_move(&mut self, categories: &[MoveCategory]) -> Option<&'static str> {
        let mut prompts = Vec::new();
        for category in categories {
            prompts.extend(prompts_for(*category));
        }
        if prompts.is_empty() {
            return None;
        }
        let prompt = prompts[self.prompt_cursor % prompts.len()];
        self.prompt_cursor = self.prompt_cursor.wrapping_add(1);
        Some(prompt)
    }
}

fn prompts_for(category: MoveCategory) -> &'static [&'static str] {
    match category {
        MoveCategory::Mobility => &["Roll your shoulders", "Reach up gently", "Relax your hands"],
        MoveCategory::Eyes => &["Look into the distance", "Rest your eyes", "Blink slowly"],
        MoveCategory::Hydration => &["Take a water sip", "Refill your water"],
        MoveCategory::Walk => &["Take a few steps", "Walk for a minute"],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confirms_a_real_away_and_return_without_storing_history() {
        let mut state = WellnessState::default();
        state.reminder_shown(1_000, true);
        state.tick(50_000, 49, true);
        assert!(!state.take_celebration(false));
        state.tick(51_000, 0, true);
        assert!(state.take_celebration(false));
        assert_eq!(state.mood(true), SessionMood::Energetic);
    }

    #[test]
    fn misses_make_only_the_current_session_sleepy() {
        let mut state = WellnessState::default();
        state.reminder_shown(0, true);
        state.tick(BREAK_CHECK_WINDOW_MS, 0, true);
        assert_eq!(state.mood(true), SessionMood::Sleepy);
        assert_eq!(WellnessState::default().mood(true), SessionMood::Neutral);
    }

    #[test]
    fn celebrations_wait_until_the_popup_is_free() {
        let mut state = WellnessState::default();
        state.reminder_shown(0, true);
        state.tick(45_000, 45, true);
        state.tick(46_000, 0, true);
        assert!(!state.take_celebration(true));
        assert!(state.take_celebration(false));
    }

    #[test]
    fn a_long_real_break_is_still_completed_on_return() {
        let mut state = WellnessState::default();
        state.reminder_shown(0, true);
        state.tick(60_000, 60, true);
        state.tick(10 * 60_000, 600, true);
        assert_eq!(state.mood(true), SessionMood::Neutral);
        state.tick(10 * 60_000 + 1_000, 0, true);
        assert!(state.take_celebration(false));
    }

    #[test]
    fn move_prompts_cycle_offline_through_selected_categories() {
        let mut state = WellnessState::default();
        assert_eq!(
            state.next_move(&[MoveCategory::Hydration]),
            Some("Take a water sip")
        );
        assert_eq!(
            state.next_move(&[MoveCategory::Hydration]),
            Some("Refill your water")
        );
    }
}
