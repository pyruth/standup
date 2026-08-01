use crate::{settings::Settings, state::AppState};
use gif::{ColorOutput, DecodeOptions, DisposalMethod, Encoder, Frame, Repeat};
use std::{
    fs::{self, OpenOptions},
    io::{Cursor, Write},
    path::{Path, PathBuf},
};
use tauri::{http, AppHandle, Manager, UriSchemeContext};
use thiserror::Error;

const MAX_FILE_BYTES: usize = 15 * 1024 * 1024;
const MAX_DIMENSION: u16 = 1024;
const MAX_FRAMES: usize = 120;
const MIN_DURATION_CENTISECONDS: u64 = 50;
const MAX_DURATION_CENTISECONDS: u64 = 800;
const MAX_DECODED_PIXELS: u64 = 32_000_000;

#[derive(Debug, Error)]
enum ImportError {
    #[error("Choose a file ending in .gif")]
    InvalidExtension,
    #[error("The selected file is empty or larger than 15 MB")]
    InvalidFileSize,
    #[error("The selected file is not a GIF87a or GIF89a image")]
    InvalidSignature,
    #[error("The GIF could not be decoded safely: {0}")]
    Decode(String),
    #[error("The GIF dimensions must be between 1×1 and 1024×1024 pixels")]
    InvalidDimensions,
    #[error("The GIF must contain between 1 and 120 frames")]
    InvalidFrameCount,
    #[error("The GIF duration must be between 0.5 and 8 seconds")]
    InvalidDuration,
    #[error("The GIF is too complex to import safely")]
    PixelBudgetExceeded,
    #[error("The sanitized GIF is larger than 15 MB")]
    SanitizedFileTooLarge,
    #[error("StandUp could not store the custom GIF: {0}")]
    Storage(#[from] std::io::Error),
}

pub fn choose_and_import(app: &AppHandle) -> Result<Option<Settings>, String> {
    let selected = rfd::FileDialog::new()
        .set_title("Choose a custom StandUp animation")
        .add_filter("Animated GIF", &["gif"])
        .pick_file();
    let Some(path) = selected else {
        return Ok(None);
    };

    let sanitized = import_from_path(&path).map_err(|error| error.to_string())?;
    let state = app.state::<AppState>();
    replace_atomically(&state.custom_animation_path, &sanitized)
        .map_err(|error| error.to_string())?;

    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .use_custom_animation()
        .map_err(|error| error.to_string())?;
    Ok(Some(settings))
}

pub fn reset(app: &AppHandle) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    match fs::remove_file(&state.custom_animation_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("could not remove the custom GIF: {error}")),
    }

    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .use_default_animation()
        .map_err(|error| error.to_string())?;
    Ok(settings)
}

pub fn active_url(app: &AppHandle, settings: &Settings) -> &'static str {
    if settings.use_custom_animation && stored_animation_is_valid(app) {
        #[cfg(target_os = "windows")]
        return "http://standup-animation.localhost/current.gif";

        #[cfg(not(target_os = "windows"))]
        return "standup-animation://localhost/current.gif";
    }
    "default"
}

pub fn protocol_response(
    context: UriSchemeContext<'_, tauri::Wry>,
    request: http::Request<Vec<u8>>,
) -> http::Response<Vec<u8>> {
    if !context.webview_label().starts_with("reminder-") || request.uri().path() != "/current.gif" {
        return response(
            http::StatusCode::NOT_FOUND,
            b"not found".to_vec(),
            "text/plain",
        );
    }

    let state = context.app_handle().state::<AppState>();
    match read_bounded(&state.custom_animation_path) {
        Ok(bytes) if has_gif_signature(&bytes) => {
            response(http::StatusCode::OK, bytes, "image/gif")
        }
        _ => response(
            http::StatusCode::NOT_FOUND,
            b"custom animation unavailable".to_vec(),
            "text/plain",
        ),
    }
}

fn response(
    status: http::StatusCode,
    body: Vec<u8>,
    content_type: &'static str,
) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, content_type)
        .header(http::header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .expect("static custom-animation response is valid")
}

fn stored_animation_is_valid(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    read_bounded(&state.custom_animation_path)
        .and_then(|bytes| sanitize_gif(&bytes))
        .is_ok()
}

fn import_from_path(path: &Path) -> Result<Vec<u8>, ImportError> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("gif"))
    {
        return Err(ImportError::InvalidExtension);
    }
    let bytes = read_bounded(path)?;
    sanitize_gif(&bytes)
}

fn read_bounded(path: &Path) -> Result<Vec<u8>, ImportError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() == 0 || metadata.len() > MAX_FILE_BYTES as u64 {
        return Err(ImportError::InvalidFileSize);
    }
    let bytes = fs::read(path)?;
    if bytes.is_empty() || bytes.len() > MAX_FILE_BYTES {
        return Err(ImportError::InvalidFileSize);
    }
    Ok(bytes)
}

fn has_gif_signature(bytes: &[u8]) -> bool {
    bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")
}

fn sanitize_gif(bytes: &[u8]) -> Result<Vec<u8>, ImportError> {
    if !has_gif_signature(bytes) {
        return Err(ImportError::InvalidSignature);
    }

    let mut options = DecodeOptions::new();
    options.set_color_output(ColorOutput::RGBA);
    options.check_frame_consistency(true);
    options.check_lzw_end_code(true);
    options.allow_unknown_blocks(false);
    let mut decoder = options
        .read_info(Cursor::new(bytes))
        .map_err(|error| ImportError::Decode(error.to_string()))?;
    let width = decoder.width();
    let height = decoder.height();
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(ImportError::InvalidDimensions);
    }

    let mut output = Vec::new();
    let mut frame_count = 0usize;
    let mut duration_centiseconds = 0u64;
    let mut decoded_pixels = 0u64;
    {
        let mut encoder = Encoder::new(&mut output, width, height, &[])
            .map_err(|error| ImportError::Decode(error.to_string()))?;
        encoder
            .set_repeat(Repeat::Infinite)
            .map_err(|error| ImportError::Decode(error.to_string()))?;

        while let Some(frame) = decoder
            .read_next_frame()
            .map_err(|error| ImportError::Decode(error.to_string()))?
        {
            frame_count += 1;
            if frame_count > MAX_FRAMES {
                return Err(ImportError::InvalidFrameCount);
            }

            decoded_pixels = decoded_pixels.saturating_add(u64::from(width) * u64::from(height));
            if decoded_pixels > MAX_DECODED_PIXELS {
                return Err(ImportError::PixelBudgetExceeded);
            }
            duration_centiseconds = duration_centiseconds.saturating_add(u64::from(frame.delay));
            if duration_centiseconds > MAX_DURATION_CENTISECONDS {
                return Err(ImportError::InvalidDuration);
            }

            let mut rgba = frame.buffer.to_vec();
            let mut clean = Frame::from_rgba_speed(frame.width, frame.height, &mut rgba, 10);
            clean.left = frame.left;
            clean.top = frame.top;
            clean.delay = frame.delay;
            clean.dispose = match frame.dispose {
                DisposalMethod::Any => DisposalMethod::Keep,
                other => other,
            };
            encoder
                .write_frame(&clean)
                .map_err(|error| ImportError::Decode(error.to_string()))?;
        }
    }

    if frame_count == 0 {
        return Err(ImportError::InvalidFrameCount);
    }
    if !(MIN_DURATION_CENTISECONDS..=MAX_DURATION_CENTISECONDS).contains(&duration_centiseconds) {
        return Err(ImportError::InvalidDuration);
    }
    if output.len() > MAX_FILE_BYTES {
        return Err(ImportError::SanitizedFileTooLarge);
    }
    Ok(output)
}

fn replace_atomically(destination: &Path, bytes: &[u8]) -> Result<(), ImportError> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    let pending = pending_path(destination);
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&pending)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);

    if let Err(error) = atomic_replace(&pending, destination) {
        let _ = fs::remove_file(&pending);
        return Err(ImportError::Storage(error));
    }
    Ok(())
}

fn pending_path(destination: &Path) -> PathBuf {
    destination.with_file_name("custom-animation.pending.gif")
}

#[cfg(target_os = "windows")]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn MoveFileExW(source: *const u16, destination: *const u16, flags: u32) -> i32;
    }
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_gif(delay: u16) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = Encoder::new(&mut bytes, 2, 2, &[]).unwrap();
            encoder.set_repeat(Repeat::Finite(1)).unwrap();
            for color in [[255, 0, 0, 255], [0, 128, 255, 255]] {
                let mut pixels = color.repeat(4);
                let mut frame = Frame::from_rgba_speed(2, 2, &mut pixels, 10);
                frame.delay = delay;
                encoder.write_frame(&frame).unwrap();
            }
        }
        bytes
    }

    #[test]
    fn rejects_non_gif_content() {
        assert!(matches!(
            sanitize_gif(b"not a gif"),
            Err(ImportError::InvalidSignature)
        ));
    }

    #[test]
    fn rejects_animations_shorter_than_half_a_second() {
        assert!(matches!(
            sanitize_gif(&sample_gif(10)),
            Err(ImportError::InvalidDuration)
        ));
    }

    #[test]
    fn reencodes_valid_input_as_an_infinite_sanitized_gif() {
        let sanitized = sanitize_gif(&sample_gif(25)).unwrap();
        assert!(has_gif_signature(&sanitized));
        assert!(sanitized.len() <= MAX_FILE_BYTES);

        let decoder = DecodeOptions::new()
            .read_info(Cursor::new(sanitized))
            .unwrap();
        assert_eq!(decoder.width(), 2);
        assert_eq!(decoder.height(), 2);
        assert_eq!(decoder.repeat(), Repeat::Infinite);
    }

    #[test]
    fn accepts_the_bundled_standup_animation_under_custom_limits() {
        let bundled = include_bytes!("../../src/renderer/assets/standup-reminder.gif");
        let sanitized = sanitize_gif(bundled).unwrap();
        assert!(has_gif_signature(&sanitized));
    }
}
