# StandUp

StandUp is a private, offline-first desktop companion by ioiostudio. It counts
active computer time and shows a silent, click-through animated reminder to
stand and move.

The `v2` branch is migrating StandUp from Electron to Tauri 2. The Electron
source remains temporarily as a parity reference; v2 builds use the Rust
backend in `src-tauri`.

## v2 targets

- Windows 10/11 x64 with an NSIS installer
- Apple Silicon macOS 12 or newer with a DMG

StandUp v2 does not contain an updater, analytics, telemetry, accounts, ads,
remote assets, HTTP client, localhost server, or runtime network calls.

## Current v2 foundation

- 45-minute default reminder interval with 15/30/45/60/90/120-minute choices
- Configurable 1/2/3/5/10-minute idle cutoff
- Rust-owned in-memory timer and local settings
- Launch at login enabled by default
- Tray/menu-bar controls for pause, resume, preview, settings, and quit
- Fresh, always-on-top, non-focusable, click-through popup for every reminder,
  shown only after its GIF or Lottie canvas is render-ready
- Nine reminder positions and automatic/specific monitor selection
- Local creative prompt builder for making a custom GIF or vector Lottie JSON
  with any AI provider
- Secure native animation picker with GIF sanitizing or strict vector-only
  Lottie validation, strict popup-sized complexity limits, background import,
  private storage, selected-animation preview, and reset to the built-in
  animation
- Silent-by-default system beep, one-second soft chime, and two-second gentle
  chime with sound testing
- Per-window Tauri capabilities and a strict local-only CSP
- Single-instance behavior

See [V2_MIGRATION.md](./V2_MIGRATION.md) for the remaining work before v2 is
release-ready, including foreground-app blacklisting and platform smoke tests.

## Development

Windows prerequisites:

- Node.js 22 or newer
- Rust stable with the MSVC toolchain
- Microsoft C++ Build Tools with Desktop development with C++
- Microsoft Edge WebView2

Install and validate:

```powershell
npm install
npm test
npm run typecheck
npm run build:web
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the Tauri development application:

```powershell
npm run dev
```

Build installers:

```powershell
npm run dist:win
npm run dist:mac
```

The macOS command must run on Apple Silicon macOS. GitHub Actions uses native
Windows x64 and Apple Silicon macOS runners.

## Installer warnings

Development installers are unsigned:

- Windows SmartScreen may display an “unrecognized app” warning.
- macOS Gatekeeper may require Control-clicking the app, choosing **Open**, and
  confirming the first launch.

Production distribution should use Windows code signing and Apple Developer ID
signing/notarization.

## Privacy

Preferences are stored only in the operating system’s per-user application-data
directory. Active-time progress remains in memory and resets after the app
restarts. The default animation and Lottie renderer are packaged inside the
application; custom animations never require a network connection.
