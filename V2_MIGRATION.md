# StandUp v2 migration

StandUp v2 is the Tauri 2 rewrite on the `v2` branch. The Electron source is
temporarily retained as a parity reference, but it is no longer part of the v2
build.

## Decisions locked for v2

- Windows x64 and Apple Silicon macOS are the only release targets.
- Runtime behavior is fully offline. There is no updater, analytics,
  telemetry, account, ad, remote asset, HTTP, or localhost plugin.
- The built-in StandUp GIF remains packaged with the app and is always the
  fallback.
- Settings are stored locally in the Tauri application-data directory.
- Launch at login defaults to enabled.
- The settings and reminder webviews have separate, minimal capabilities.
- The reminder is a non-focusable, always-on-top, click-through window.

## Implemented in the first slice

- Tauri 2 project and native Windows/macOS bundle configuration.
- Rust-owned settings persistence and timer state.
- Active/idle accumulation through the platform idle-time API.
- Pause/resume commands, single-instance behavior, launch at login, and tray
  controls.
- Reused click-through reminder window with an eight-second lifecycle.
- Work-area-aware nine-position placement and monitor selection with primary
  monitor fallback.
- Strict local-only CSP and no updater/network dependencies.
- Settings UI for timing, position, monitor, sound choice, local AI prompt
  construction, preview, and reset-to-default.
- Native system beep and bundled original one- and two-second offline chimes.
- Secure custom GIF picker with bounded reads, GIF signature and frame
  validation, decode/re-encode sanitization, metadata stripping, atomic private
  storage, preview, corruption fallback, and reset.
- Live tray status showing remaining time, pause time, due state, or popup state.
- Native Rust unit tests plus existing TypeScript tests.

## Remaining before v2 is release-ready

- Foreground application picker/detection and deferred blacklist reminders.
- Explicit lock/suspend event handling on both platforms.
- Display hot-plug handling while the popup is already visible.
- Native full-screen behavior verification on macOS.
- Signed/notarized macOS distribution and signed Windows distribution.
- End-to-end installer smoke tests and malformed-GIF corpus tests.

## Local prerequisites

Tauri development on Windows requires Rust, WebView2, and the Microsoft C++
Build Tools with the Desktop development with C++ workload.

```powershell
npm install
npm run dev
```

Run checks with:

```powershell
npm test
npm run typecheck
npm run build:web
cargo test --manifest-path src-tauri/Cargo.toml
```
