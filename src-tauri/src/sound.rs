use crate::{settings::ReminderSound, state::AppState};
use std::{path::PathBuf, sync::atomic::Ordering, thread, time::Duration};
use tauri::{path::BaseDirectory, AppHandle, Manager};

pub fn play(app: &AppHandle, sound: ReminderSound) -> Result<(), String> {
    if sound == ReminderSound::Off {
        return Ok(());
    }

    let state = app.state::<AppState>();
    if state
        .sound_playing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    let result = match sound {
        ReminderSound::Off => Ok(()),
        ReminderSound::SystemBeep => play_system_beep(app),
        ReminderSound::SoftChime => play_file(app, resource_path(app, "sounds/soft-chime.wav")?, 1),
        ReminderSound::GentleChime => {
            play_file(app, resource_path(app, "sounds/gentle-chime.wav")?, 2)
        }
    };

    if result.is_err() {
        state.sound_playing.store(false, Ordering::SeqCst);
    }
    result
}

fn resource_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(relative, BaseDirectory::Resource)
        .map_err(|error| format!("could not locate the bundled sound: {error}"))
}

#[cfg(target_os = "windows")]
fn play_system_beep(app: &AppHandle) -> Result<(), String> {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn MessageBeep(sound_type: u32) -> i32;
    }

    let played = unsafe { MessageBeep(0) } != 0;
    if !played {
        return Err("Windows could not play the configured system beep".into());
    }
    reset_after(app.clone(), 1);
    Ok(())
}

#[cfg(target_os = "macos")]
fn play_system_beep(app: &AppHandle) -> Result<(), String> {
    #[link(name = "AppKit", kind = "framework")]
    unsafe extern "C" {
        fn NSBeep();
    }

    unsafe { NSBeep() };
    reset_after(app.clone(), 1);
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn play_system_beep(app: &AppHandle) -> Result<(), String> {
    reset_after(app.clone(), 1);
    Ok(())
}

#[cfg(target_os = "windows")]
fn play_file(app: &AppHandle, path: PathBuf, duration_seconds: u64) -> Result<(), String> {
    use std::{ffi::c_void, os::windows::ffi::OsStrExt};

    #[link(name = "winmm")]
    unsafe extern "system" {
        fn PlaySoundW(sound: *const u16, module: *mut c_void, flags: u32) -> i32;
    }

    const SND_ASYNC: u32 = 0x0001;
    const SND_NODEFAULT: u32 = 0x0002;
    const SND_FILENAME: u32 = 0x0002_0000;

    let wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let played = unsafe {
        PlaySoundW(
            wide_path.as_ptr(),
            std::ptr::null_mut(),
            SND_ASYNC | SND_NODEFAULT | SND_FILENAME,
        )
    } != 0;
    if !played {
        return Err("Windows could not play the bundled StandUp sound".into());
    }
    reset_after(app.clone(), duration_seconds);
    Ok(())
}

#[cfg(target_os = "macos")]
fn play_file(app: &AppHandle, path: PathBuf, _duration_seconds: u64) -> Result<(), String> {
    let mut child = std::process::Command::new("/usr/bin/afplay")
        .arg(path)
        .spawn()
        .map_err(|error| format!("macOS could not play the bundled StandUp sound: {error}"))?;
    let handle = app.clone();
    thread::spawn(move || {
        let _ = child.wait();
        handle
            .state::<AppState>()
            .sound_playing
            .store(false, Ordering::SeqCst);
    });
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn play_file(app: &AppHandle, path: PathBuf, duration_seconds: u64) -> Result<(), String> {
    if !std::path::Path::new(&path).is_file() {
        return Err("the bundled StandUp sound is missing".into());
    }
    reset_after(app.clone(), duration_seconds);
    Ok(())
}

fn reset_after(app: AppHandle, duration_seconds: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(duration_seconds));
        app.state::<AppState>()
            .sound_playing
            .store(false, Ordering::SeqCst);
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn bundled_wav_files_have_valid_pcm_headers() {
        for relative in [
            "../resources/soft-chime.wav",
            "../resources/gentle-chime.wav",
        ] {
            let bytes = std::fs::read(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("src")
                    .join(relative),
            )
            .unwrap();
            assert_eq!(&bytes[0..4], b"RIFF");
            assert_eq!(&bytes[8..12], b"WAVE");
            assert_eq!(&bytes[36..40], b"data");
        }
    }
}
