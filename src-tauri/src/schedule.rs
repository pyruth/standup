use crate::settings::{ScheduleDay, Settings};
use chrono::{Datelike, Local, Timelike, Weekday};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScheduleMoment {
    pub day: ScheduleDay,
    pub minute_of_day: u16,
}

pub fn is_active_now(settings: &Settings) -> bool {
    let now = Local::now();
    is_active_at(
        settings,
        ScheduleMoment {
            day: schedule_day(now.weekday()),
            minute_of_day: (now.hour() * 60 + now.minute()) as u16,
        },
    )
}

pub fn is_active_at(settings: &Settings, moment: ScheduleMoment) -> bool {
    if !settings.schedule_enabled {
        return true;
    }

    let starts = settings.schedule_start_minutes;
    let ends = settings.schedule_end_minutes;
    if starts < ends {
        settings.schedule_active_days.contains(&moment.day)
            && (starts..ends).contains(&moment.minute_of_day)
    } else {
        (settings.schedule_active_days.contains(&moment.day) && moment.minute_of_day >= starts)
            || (settings
                .schedule_active_days
                .contains(&previous_day(moment.day))
                && moment.minute_of_day < ends)
    }
}

pub fn minutes_until_next_active_period(settings: &Settings) -> Option<u16> {
    if !settings.schedule_enabled {
        return Some(1);
    }
    let now = Local::now();
    let start = ScheduleMoment {
        day: schedule_day(now.weekday()),
        minute_of_day: (now.hour() * 60 + now.minute()) as u16,
    };
    minutes_until_next_active_from(settings, start)
}

fn minutes_until_next_active_from(settings: &Settings, start: ScheduleMoment) -> Option<u16> {
    let mut saw_inactive = !is_active_at(settings, start);
    for offset in 1..=(8 * 24 * 60) {
        let absolute = usize::from(start.minute_of_day) + offset;
        let day_offset = absolute / (24 * 60);
        let moment = ScheduleMoment {
            day: add_days(start.day, day_offset),
            minute_of_day: (absolute % (24 * 60)) as u16,
        };
        let active = is_active_at(settings, moment);
        if saw_inactive && active {
            return u16::try_from(offset).ok();
        }
        if !active {
            saw_inactive = true;
        }
    }
    None
}

fn add_days(mut day: ScheduleDay, count: usize) -> ScheduleDay {
    for _ in 0..count {
        day = next_day(day);
    }
    day
}

fn next_day(day: ScheduleDay) -> ScheduleDay {
    match day {
        ScheduleDay::Monday => ScheduleDay::Tuesday,
        ScheduleDay::Tuesday => ScheduleDay::Wednesday,
        ScheduleDay::Wednesday => ScheduleDay::Thursday,
        ScheduleDay::Thursday => ScheduleDay::Friday,
        ScheduleDay::Friday => ScheduleDay::Saturday,
        ScheduleDay::Saturday => ScheduleDay::Sunday,
        ScheduleDay::Sunday => ScheduleDay::Monday,
    }
}

fn schedule_day(day: Weekday) -> ScheduleDay {
    match day {
        Weekday::Mon => ScheduleDay::Monday,
        Weekday::Tue => ScheduleDay::Tuesday,
        Weekday::Wed => ScheduleDay::Wednesday,
        Weekday::Thu => ScheduleDay::Thursday,
        Weekday::Fri => ScheduleDay::Friday,
        Weekday::Sat => ScheduleDay::Saturday,
        Weekday::Sun => ScheduleDay::Sunday,
    }
}

fn previous_day(day: ScheduleDay) -> ScheduleDay {
    match day {
        ScheduleDay::Monday => ScheduleDay::Sunday,
        ScheduleDay::Tuesday => ScheduleDay::Monday,
        ScheduleDay::Wednesday => ScheduleDay::Tuesday,
        ScheduleDay::Thursday => ScheduleDay::Wednesday,
        ScheduleDay::Friday => ScheduleDay::Thursday,
        ScheduleDay::Saturday => ScheduleDay::Friday,
        ScheduleDay::Sunday => ScheduleDay::Saturday,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: ScheduleDay, hour: u16, minute: u16) -> ScheduleMoment {
        ScheduleMoment {
            day,
            minute_of_day: hour * 60 + minute,
        }
    }

    #[test]
    fn disabled_schedule_is_always_active() {
        let settings = Settings::default();
        assert!(is_active_at(&settings, at(ScheduleDay::Sunday, 3, 0)));
    }

    #[test]
    fn daytime_schedule_includes_start_and_excludes_end() {
        let mut settings = Settings::default();
        settings.schedule_enabled = true;
        assert!(is_active_at(&settings, at(ScheduleDay::Monday, 9, 0)));
        assert!(is_active_at(&settings, at(ScheduleDay::Friday, 17, 59)));
        assert!(!is_active_at(&settings, at(ScheduleDay::Friday, 18, 0)));
        assert!(!is_active_at(&settings, at(ScheduleDay::Saturday, 12, 0)));
    }

    #[test]
    fn overnight_schedule_carries_into_the_following_morning() {
        let mut settings = Settings::default();
        settings.schedule_enabled = true;
        settings.schedule_active_days = vec![ScheduleDay::Friday];
        settings.schedule_start_minutes = 22 * 60;
        settings.schedule_end_minutes = 6 * 60;
        assert!(is_active_at(&settings, at(ScheduleDay::Friday, 23, 0)));
        assert!(is_active_at(&settings, at(ScheduleDay::Saturday, 5, 59)));
        assert!(!is_active_at(&settings, at(ScheduleDay::Saturday, 6, 0)));
        assert!(!is_active_at(&settings, at(ScheduleDay::Thursday, 23, 0)));
    }

    #[test]
    fn finds_the_next_period_from_inside_or_outside_a_schedule() {
        let mut settings = Settings::default();
        settings.schedule_enabled = true;
        assert_eq!(
            minutes_until_next_active_from(&settings, at(ScheduleDay::Monday, 8, 0)),
            Some(60)
        );
        assert_eq!(
            minutes_until_next_active_from(&settings, at(ScheduleDay::Monday, 10, 0)),
            Some(23 * 60)
        );
        assert_eq!(
            minutes_until_next_active_from(&settings, at(ScheduleDay::Friday, 19, 0)),
            Some(62 * 60)
        );
    }
}
