use crate::{
    settings::{CustomAnimationFormat, Settings},
    state::AppState,
};
use gif::{ColorOutput, DecodeOptions, DisposalMethod, Encoder, Frame, Repeat};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Cursor, Write},
    path::{Path, PathBuf},
};
use tauri::{http, AppHandle, Manager, UriSchemeContext};
use thiserror::Error;

const MAX_FILE_BYTES: usize = 15 * 1024 * 1024;
const MAX_LOTTIE_BYTES: usize = 2 * 1024 * 1024;
const MAX_DIMENSION: u16 = 1024;
const MAX_FRAMES: usize = 120;
const MIN_DURATION_CENTISECONDS: u64 = 50;
const MAX_DURATION_CENTISECONDS: u64 = 800;
const MAX_DECODED_PIXELS: u64 = 32_000_000;
const MAX_LOTTIE_DEPTH: usize = 64;
const MAX_LOTTIE_NODES: usize = 20_000;
const MAX_LOTTIE_LAYERS: usize = 80;
const MAX_LOTTIE_COLLECTION: usize = 5_000;
const MAX_LOTTIE_STRING: usize = 4_096;
const MAX_LOTTIE_PRECOMP_DEPTH: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ActiveAnimation {
    Default,
    Gif { url: String },
    Lottie { data: Value },
}

#[derive(Debug, Error)]
enum ImportError {
    #[error("Choose an animated GIF or a Lottie JSON file")]
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
    #[error("The Lottie JSON must be between 1 byte and 2 MB")]
    InvalidLottieFileSize,
    #[error("The Lottie file is not valid JSON: {0}")]
    InvalidLottieJson(String),
    #[error("The Lottie file must define valid width, height, frame rate, and frame range")]
    InvalidLottieComposition,
    #[error("The Lottie duration must be between 0.5 and 8 seconds")]
    InvalidLottieDuration,
    #[error("The Lottie file is too complex to import safely")]
    LottieComplexityExceeded,
    #[error("The Lottie file contains an invalid or recursive precomposition")]
    InvalidLottiePrecomposition,
    #[error("Only vector Lottie animations are supported; images, text, fonts, and audio are not allowed")]
    UnsupportedLottieAsset,
    #[error("Lottie expressions are not allowed")]
    LottieExpressionNotAllowed,
    #[error("Lottie files cannot contain external URLs or embedded data assets")]
    ExternalLottieAsset,
    #[error("StandUp could not store the custom animation: {0}")]
    Storage(#[from] std::io::Error),
}

pub async fn choose_and_import(app: AppHandle) -> Result<Option<Settings>, String> {
    let selected = rfd::AsyncFileDialog::new()
        .set_title("Choose a custom StandUp animation")
        .add_filter("StandUp animation", &["gif", "json"])
        .pick_file()
        .await;
    let Some(path) = selected else {
        return Ok(None);
    };
    let path = path.path().to_path_buf();

    tauri::async_runtime::spawn_blocking(move || import_selected(&app, &path))
        .await
        .map_err(|error| format!("animation import task failed: {error}"))?
        .map(Some)
}

fn import_selected(app: &AppHandle, path: &Path) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| ImportError::InvalidExtension.to_string())?;
    let (format, destination, stale, sanitized) = match extension.as_str() {
        "gif" => (
            CustomAnimationFormat::Gif,
            &state.custom_gif_path,
            &state.custom_lottie_path,
            import_gif_from_path(path).map_err(|error| error.to_string())?,
        ),
        "json" => (
            CustomAnimationFormat::Lottie,
            &state.custom_lottie_path,
            &state.custom_gif_path,
            import_lottie_from_path(path).map_err(|error| error.to_string())?,
        ),
        _ => return Err(ImportError::InvalidExtension.to_string()),
    };
    replace_atomically(destination, &sanitized).map_err(|error| error.to_string())?;
    let _ = remove_if_exists(stale);

    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .use_custom_animation(format)
        .map_err(|error| error.to_string())?;
    Ok(settings)
}

pub fn reset(app: &AppHandle) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    remove_if_exists(&state.custom_gif_path)
        .map_err(|error| format!("could not remove the custom GIF: {error}"))?;
    remove_if_exists(&state.custom_lottie_path)
        .map_err(|error| format!("could not remove the custom Lottie animation: {error}"))?;

    let settings = state
        .settings
        .lock()
        .map_err(|_| "settings state is unavailable".to_string())?
        .use_default_animation()
        .map_err(|error| error.to_string())?;
    Ok(settings)
}

pub fn active(app: &AppHandle, settings: &Settings) -> ActiveAnimation {
    if !settings.use_custom_animation {
        return ActiveAnimation::Default;
    }
    let state = app.state::<AppState>();
    match settings.custom_animation_format {
        CustomAnimationFormat::Gif if stored_gif_is_valid(&state.custom_gif_path) => {
            #[cfg(target_os = "windows")]
            let url = "http://standup-animation.localhost/current.gif";

            #[cfg(not(target_os = "windows"))]
            let url = "standup-animation://localhost/current.gif";

            ActiveAnimation::Gif { url: url.into() }
        }
        CustomAnimationFormat::Lottie => read_lottie(&state.custom_lottie_path)
            .ok()
            .and_then(|bytes| validate_lottie(&bytes).ok())
            .map(|data| ActiveAnimation::Lottie { data })
            .unwrap_or(ActiveAnimation::Default),
        _ => ActiveAnimation::Default,
    }
}

pub fn stored_file_is_valid(
    settings: &Settings,
    custom_gif_path: &Path,
    custom_lottie_path: &Path,
) -> bool {
    if !settings.use_custom_animation {
        return true;
    }
    match settings.custom_animation_format {
        CustomAnimationFormat::Gif => stored_gif_is_valid(custom_gif_path),
        CustomAnimationFormat::Lottie => read_lottie(custom_lottie_path)
            .and_then(|bytes| validate_lottie(&bytes))
            .is_ok(),
    }
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
    match read_bounded(&state.custom_gif_path) {
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

fn stored_gif_is_valid(path: &Path) -> bool {
    read_bounded(path)
        .and_then(|bytes| sanitize_gif(&bytes))
        .is_ok()
}

fn import_gif_from_path(path: &Path) -> Result<Vec<u8>, ImportError> {
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

fn import_lottie_from_path(path: &Path) -> Result<Vec<u8>, ImportError> {
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err(ImportError::InvalidExtension);
    }
    let bytes = read_lottie(path)?;
    let validated = validate_lottie(&bytes)?;
    serde_json::to_vec(&validated)
        .map_err(|error| ImportError::InvalidLottieJson(error.to_string()))
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

fn read_lottie(path: &Path) -> Result<Vec<u8>, ImportError> {
    let metadata = fs::metadata(path)?;
    if metadata.len() == 0 || metadata.len() > MAX_LOTTIE_BYTES as u64 {
        return Err(ImportError::InvalidLottieFileSize);
    }
    let bytes = fs::read(path)?;
    if bytes.is_empty() || bytes.len() > MAX_LOTTIE_BYTES {
        return Err(ImportError::InvalidLottieFileSize);
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

#[derive(Default)]
struct LottieBudget {
    nodes: usize,
    layers: usize,
}

fn validate_lottie(bytes: &[u8]) -> Result<Value, ImportError> {
    if bytes.is_empty() || bytes.len() > MAX_LOTTIE_BYTES {
        return Err(ImportError::InvalidLottieFileSize);
    }
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| ImportError::InvalidLottieJson(error.to_string()))?;
    let composition = value
        .as_object()
        .ok_or(ImportError::InvalidLottieComposition)?;

    let width = composition.get("w").and_then(Value::as_u64);
    let height = composition.get("h").and_then(Value::as_u64);
    let frame_rate = finite_number(composition.get("fr"));
    let first_frame = finite_number(composition.get("ip"));
    let last_frame = finite_number(composition.get("op"));
    let version_valid = composition
        .get("v")
        .and_then(Value::as_str)
        .is_some_and(|version| !version.is_empty() && version.len() <= 32);
    if !version_valid
        || !width.is_some_and(|value| (1..=u64::from(MAX_DIMENSION)).contains(&value))
        || !height.is_some_and(|value| (1..=u64::from(MAX_DIMENSION)).contains(&value))
        || !frame_rate.is_some_and(|value| (1.0..=60.0).contains(&value))
        || first_frame.is_none()
        || last_frame.is_none()
    {
        return Err(ImportError::InvalidLottieComposition);
    }
    let frame_rate = frame_rate.unwrap_or_default();
    let first_frame = first_frame.unwrap_or_default();
    let last_frame = last_frame.unwrap_or_default();
    let duration = (last_frame - first_frame) / frame_rate;
    if !(0.5..=8.0).contains(&duration) {
        return Err(ImportError::InvalidLottieDuration);
    }
    if composition.contains_key("fonts") || composition.contains_key("chars") {
        return Err(ImportError::UnsupportedLottieAsset);
    }

    let mut budget = LottieBudget::default();
    validate_lottie_value(&value, 0, &mut budget)?;
    if budget.layers == 0 {
        return Err(ImportError::InvalidLottieComposition);
    }
    validate_lottie_precompositions(composition)?;
    Ok(value)
}

fn validate_lottie_precompositions(
    composition: &serde_json::Map<String, Value>,
) -> Result<(), ImportError> {
    let mut assets = HashMap::<String, &Vec<Value>>::new();
    if let Some(asset_values) = composition.get("assets") {
        for asset in asset_values
            .as_array()
            .ok_or(ImportError::InvalidLottieComposition)?
        {
            let asset = asset
                .as_object()
                .ok_or(ImportError::InvalidLottieComposition)?;
            let id = asset
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty() && id.len() <= 256)
                .ok_or(ImportError::InvalidLottiePrecomposition)?;
            let layers = asset
                .get("layers")
                .and_then(Value::as_array)
                .ok_or(ImportError::InvalidLottiePrecomposition)?;
            if assets.insert(id.to_string(), layers).is_some() {
                return Err(ImportError::InvalidLottiePrecomposition);
            }
        }
    }

    let root_layers = composition
        .get("layers")
        .and_then(Value::as_array)
        .ok_or(ImportError::InvalidLottieComposition)?;
    validate_precomp_layers(root_layers, &assets, &mut HashSet::new(), 0)
}

fn validate_precomp_layers(
    layers: &[Value],
    assets: &HashMap<String, &Vec<Value>>,
    visiting: &mut HashSet<String>,
    depth: usize,
) -> Result<(), ImportError> {
    if depth > MAX_LOTTIE_PRECOMP_DEPTH {
        return Err(ImportError::InvalidLottiePrecomposition);
    }
    for layer in layers {
        let object = layer
            .as_object()
            .ok_or(ImportError::InvalidLottieComposition)?;
        if object.get("ty").and_then(Value::as_i64) != Some(0) {
            continue;
        }
        let reference = object
            .get("refId")
            .and_then(Value::as_str)
            .ok_or(ImportError::InvalidLottiePrecomposition)?;
        let referenced_layers = assets
            .get(reference)
            .ok_or(ImportError::InvalidLottiePrecomposition)?;
        if !visiting.insert(reference.to_string()) {
            return Err(ImportError::InvalidLottiePrecomposition);
        }
        validate_precomp_layers(referenced_layers, assets, visiting, depth + 1)?;
        visiting.remove(reference);
    }
    Ok(())
}

fn finite_number(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|number| number.is_finite())
}

fn validate_lottie_value(
    value: &Value,
    depth: usize,
    budget: &mut LottieBudget,
) -> Result<(), ImportError> {
    if depth > MAX_LOTTIE_DEPTH {
        return Err(ImportError::LottieComplexityExceeded);
    }
    budget.nodes = budget.nodes.saturating_add(1);
    if budget.nodes > MAX_LOTTIE_NODES {
        return Err(ImportError::LottieComplexityExceeded);
    }

    match value {
        Value::Array(values) => {
            if values.len() > MAX_LOTTIE_COLLECTION {
                return Err(ImportError::LottieComplexityExceeded);
            }
            for value in values {
                validate_lottie_value(value, depth + 1, budget)?;
            }
        }
        Value::Object(object) => {
            if object.len() > 512 {
                return Err(ImportError::LottieComplexityExceeded);
            }
            for (key, value) in object {
                if key.len() > 128 {
                    return Err(ImportError::LottieComplexityExceeded);
                }
                if key == "x"
                    && value
                        .as_str()
                        .is_some_and(|expression| !expression.is_empty())
                {
                    return Err(ImportError::LottieExpressionNotAllowed);
                }
                if key == "layers" {
                    validate_lottie_layers(value, depth + 1, budget)?;
                    continue;
                }
                if key == "assets" {
                    validate_lottie_assets(value, depth + 1, budget)?;
                    continue;
                }
                validate_lottie_value(value, depth + 1, budget)?;
            }
        }
        Value::String(value) => {
            if value.len() > MAX_LOTTIE_STRING {
                return Err(ImportError::LottieComplexityExceeded);
            }
            let normalized = value.trim().to_ascii_lowercase();
            if ["http:", "https:", "file:", "data:", "blob:", "//"]
                .iter()
                .any(|prefix| normalized.starts_with(prefix))
            {
                return Err(ImportError::ExternalLottieAsset);
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_lottie_layers(
    value: &Value,
    depth: usize,
    budget: &mut LottieBudget,
) -> Result<(), ImportError> {
    let layers = value
        .as_array()
        .ok_or(ImportError::InvalidLottieComposition)?;
    budget.layers = budget.layers.saturating_add(layers.len());
    if budget.layers > MAX_LOTTIE_LAYERS {
        return Err(ImportError::LottieComplexityExceeded);
    }
    for layer in layers {
        let object = layer
            .as_object()
            .ok_or(ImportError::InvalidLottieComposition)?;
        let layer_type = object
            .get("ty")
            .and_then(Value::as_i64)
            .ok_or(ImportError::InvalidLottieComposition)?;
        if !matches!(layer_type, 0 | 1 | 3 | 4) {
            return Err(ImportError::UnsupportedLottieAsset);
        }
        validate_lottie_value(layer, depth + 1, budget)?;
    }
    Ok(())
}

fn validate_lottie_assets(
    value: &Value,
    depth: usize,
    budget: &mut LottieBudget,
) -> Result<(), ImportError> {
    let assets = value
        .as_array()
        .ok_or(ImportError::InvalidLottieComposition)?;
    if assets.len() > MAX_LOTTIE_COLLECTION {
        return Err(ImportError::LottieComplexityExceeded);
    }
    for asset in assets {
        let object = asset
            .as_object()
            .ok_or(ImportError::InvalidLottieComposition)?;
        if object.contains_key("p") || object.contains_key("u") || object.contains_key("e") {
            return Err(ImportError::UnsupportedLottieAsset);
        }
        validate_lottie_value(asset, depth + 1, budget)?;
    }
    Ok(())
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
    let extension = destination
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("data");
    destination.with_file_name(format!("custom-animation.pending.{extension}"))
}

fn remove_if_exists(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
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

    fn sample_lottie() -> Value {
        serde_json::json!({
            "v": "5.13.0",
            "fr": 30,
            "ip": 0,
            "op": 60,
            "w": 256,
            "h": 384,
            "layers": [{
                "ddd": 0,
                "ind": 1,
                "ty": 4,
                "nm": "StandUp shape",
                "sr": 1,
                "ks": {
                    "o": { "a": 0, "k": 100 },
                    "r": { "a": 0, "k": 0 },
                    "p": { "a": 0, "k": [128, 192, 0] },
                    "a": { "a": 0, "k": [0, 0, 0] },
                    "s": { "a": 0, "k": [100, 100, 100] }
                },
                "shapes": [
                    {
                        "ty": "el",
                        "p": { "a": 0, "k": [0, 0] },
                        "s": { "a": 0, "k": [80, 80] },
                        "nm": "Ellipse"
                    },
                    {
                        "ty": "fl",
                        "c": { "a": 0, "k": [1, 0.4, 0.2, 1] },
                        "o": { "a": 0, "k": 100 },
                        "r": 1,
                        "nm": "Fill"
                    }
                ],
                "ip": 0,
                "op": 60,
                "st": 0,
                "bm": 0
            }]
        })
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

    #[test]
    fn imports_stores_and_reopens_a_custom_gif_from_disk() {
        let directory =
            std::env::temp_dir().join(format!("standup-custom-animation-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let source = directory.join("My Reminder.GIF");
        let destination = directory.join("custom-animation.gif");
        fs::write(&source, sample_gif(25)).unwrap();

        let sanitized = import_gif_from_path(&source).unwrap();
        replace_atomically(&destination, &sanitized).unwrap();
        let stored = read_bounded(&destination).unwrap();
        assert_eq!(stored, sanitized);

        let mut decoder = DecodeOptions::new().read_info(Cursor::new(stored)).unwrap();
        assert_eq!(decoder.width(), 2);
        assert_eq!(decoder.height(), 2);
        assert_eq!(decoder.repeat(), Repeat::Infinite);
        let mut frames = 0;
        let mut duration = 0u64;
        while let Some(frame) = decoder.read_next_frame().unwrap() {
            frames += 1;
            duration += u64::from(frame.delay);
        }
        assert_eq!(frames, 2);
        assert_eq!(duration, 50);

        fs::remove_file(source).unwrap();
        fs::remove_file(destination).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn rejected_custom_gif_never_replaces_the_stored_animation() {
        let directory = std::env::temp_dir().join(format!(
            "standup-custom-animation-rejection-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&directory).unwrap();
        let destination = directory.join("custom-animation.gif");
        let rejected = directory.join("broken.gif");
        let original = sanitize_gif(&sample_gif(25)).unwrap();
        replace_atomically(&destination, &original).unwrap();
        fs::write(&rejected, b"not a gif").unwrap();

        assert!(matches!(
            import_gif_from_path(&rejected),
            Err(ImportError::InvalidSignature)
        ));
        assert_eq!(fs::read(&destination).unwrap(), original);

        fs::remove_file(rejected).unwrap();
        fs::remove_file(destination).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn accepts_and_canonicalizes_a_vector_lottie_animation() {
        let bytes = serde_json::to_vec_pretty(&sample_lottie()).unwrap();
        let validated = validate_lottie(&bytes).unwrap();
        let canonical = serde_json::to_vec(&validated).unwrap();

        assert!(canonical.len() < bytes.len());
        assert!(validate_lottie(&canonical).is_ok());
    }

    #[test]
    fn rejects_lottie_expressions_and_external_assets() {
        let mut expression = sample_lottie();
        expression["layers"][0]["ks"]["r"]["x"] = Value::String("time * 10".into());
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&expression).unwrap()),
            Err(ImportError::LottieExpressionNotAllowed)
        ));

        let mut external = sample_lottie();
        external["assets"] = serde_json::json!([{
            "id": "image_0",
            "p": "https://example.com/image.png"
        }]);
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&external).unwrap()),
            Err(ImportError::UnsupportedLottieAsset)
        ));
    }

    #[test]
    fn rejects_lottie_text_and_out_of_range_duration() {
        let mut text = sample_lottie();
        text["layers"][0]["ty"] = Value::from(5);
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&text).unwrap()),
            Err(ImportError::UnsupportedLottieAsset)
        ));

        let mut too_long = sample_lottie();
        too_long["op"] = Value::from(300);
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&too_long).unwrap()),
            Err(ImportError::InvalidLottieDuration)
        ));
    }

    #[test]
    fn rejects_lottie_files_that_are_too_detailed_for_a_popup() {
        let mut too_many_layers = sample_lottie();
        let layer = too_many_layers["layers"][0].clone();
        too_many_layers["layers"] = Value::Array(vec![layer; MAX_LOTTIE_LAYERS + 1]);
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&too_many_layers).unwrap()),
            Err(ImportError::LottieComplexityExceeded)
        ));

        let mut too_many_nodes = sample_lottie();
        too_many_nodes["layers"][0]["extra"] = Value::Array(
            (0..100)
                .map(|_| Value::Array(vec![Value::from(0); 250]))
                .collect(),
        );
        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&too_many_nodes).unwrap()),
            Err(ImportError::LottieComplexityExceeded)
        ));
    }

    #[test]
    fn rejects_recursive_lottie_precompositions() {
        let mut recursive = sample_lottie();
        recursive["layers"] = serde_json::json!([{
            "ty": 0,
            "refId": "comp_0"
        }]);
        recursive["assets"] = serde_json::json!([{
            "id": "comp_0",
            "layers": [{
                "ty": 0,
                "refId": "comp_0"
            }]
        }]);

        assert!(matches!(
            validate_lottie(&serde_json::to_vec(&recursive).unwrap()),
            Err(ImportError::InvalidLottiePrecomposition)
        ));
    }

    #[test]
    fn imports_and_reopens_a_lottie_json_file_from_disk() {
        let directory =
            std::env::temp_dir().join(format!("standup-custom-lottie-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory).unwrap();
        let source = directory.join("My Reminder.JSON");
        let destination = directory.join("custom-animation.json");
        fs::write(
            &source,
            serde_json::to_vec_pretty(&sample_lottie()).unwrap(),
        )
        .unwrap();

        let sanitized = import_lottie_from_path(&source).unwrap();
        replace_atomically(&destination, &sanitized).unwrap();
        let stored = read_lottie(&destination).unwrap();
        assert_eq!(stored, sanitized);
        assert!(validate_lottie(&stored).is_ok());

        fs::remove_file(source).unwrap();
        fs::remove_file(destination).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn invalid_stored_custom_animation_is_not_kept_active() {
        let directory = std::env::temp_dir().join(format!(
            "standup-invalid-stored-lottie-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir(&directory).unwrap();
        let gif_path = directory.join("custom-animation.gif");
        let lottie_path = directory.join("custom-animation.json");
        let mut too_complex = sample_lottie();
        let layer = too_complex["layers"][0].clone();
        too_complex["layers"] = Value::Array(vec![layer; MAX_LOTTIE_LAYERS + 1]);
        fs::write(&lottie_path, serde_json::to_vec(&too_complex).unwrap()).unwrap();

        let settings = Settings {
            use_custom_animation: true,
            custom_animation_format: CustomAnimationFormat::Lottie,
            ..Settings::default()
        };
        assert!(!stored_file_is_valid(&settings, &gif_path, &lottie_path));

        fs::remove_file(lottie_path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
