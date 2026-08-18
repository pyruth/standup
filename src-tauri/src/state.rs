use crate::{reminder::PopupLifecycle, settings::SettingsStore, timer::TimerEngine};
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Mutex};

pub struct AppState {
    pub settings: Mutex<SettingsStore>,
    pub timer: Mutex<TimerEngine>,
    pub popup: Mutex<PopupLifecycle>,
    pub sound_playing: AtomicBool,
    pub custom_gif_path: PathBuf,
    pub custom_lottie_path: PathBuf,
}

impl AppState {
    pub fn new(
        settings: SettingsStore,
        custom_gif_path: PathBuf,
        custom_lottie_path: PathBuf,
    ) -> Self {
        let current = settings.get();
        Self {
            timer: Mutex::new(TimerEngine::new(
                current.reminder_interval_minutes,
                current.idle_threshold_minutes,
            )),
            settings: Mutex::new(settings),
            popup: Mutex::new(PopupLifecycle::default()),
            sound_playing: AtomicBool::new(false),
            custom_gif_path,
            custom_lottie_path,
        }
    }
}
