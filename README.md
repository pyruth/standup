# StandUp

StandUp is a private, offline-first desktop companion by ioiostudio. It counts
active computer time and shows an animated reminder to stand and move.

StandUp 3 is the redesigned Tauri 2 application. The Electron source remains
temporarily as a historical parity reference; production builds use the Rust
backend in `src-tauri`.

## v3 targets

- Windows 10/11 x64 with an NSIS installer
- Apple Silicon macOS 12 or newer with a DMG

StandUp v3 does not contain an updater, analytics, telemetry, accounts, ads,
remote assets, HTTP client, localhost server, or runtime network calls.

## Current v3 foundation

- 45-minute default reminder interval with 15/30/45/60/90/120-minute choices
- Configurable 1/2/3/5/10-minute idle cutoff
- Optional local-time weekly schedule with selectable days, daytime or
  overnight active hours, preserved progress, and deferred due reminders
- Mello Break Check, which uses only the existing idle duration to recognize an
  actual 45-second away-and-return and celebrate locally; no history is stored
- Mello Peek, a silent one-minute heads-up that never resets the main timer
- Optional independent 10/15/20/30-minute microbreak rhythm and built-in,
  offline Mello Moves prompts for mobility, eyes, water, and walking
- Session-only neutral, energetic, and sleepy Mello moods that reset on quit
- First-run setup for interval, work schedule, sound, monitor, and Mello color
- Rust-owned in-memory timer and local settings
- Launch at login enabled by default
- Tray/menu-bar controls for pause (30/60/120 minutes, tomorrow, or next active
  schedule), resume, live remaining time, preview, settings, and quit
- Optional native global shortcuts for pause/resume, preview, and 30-minute
  snooze, with registration conflict validation before saving
- Fresh, always-on-top, non-focusable popup for every reminder, shown only after
  Mello or the bundled original GIF is render-ready. The Original GIF is fully
  click-through; Mello captures the pointer only over its visible jelly body.
- Mello, the built-in interactive jelly mascot, with click-to-punch/split/anger
  reactions, elastic dragging, upward/downward release bounces, spring-based
  squash, stretch, wobble, puddle, six palettes, Calm and Playful personalities,
  optional pointer interaction, and fixed/random color
- System, Light, and Dark application themes using the approved Mello design
- Nine reminder positions and automatic/specific monitor selection
- A two-option built-in visual selector: Mello mascot or Original GIF
- Full setup preview using the chosen visual, color, monitor, position, and sound
- Windows fullscreen protection that safely defers the reminder without reading
  application content or requesting additional permissions
- Silent-by-default system beep, one-second soft chime, and two-second gentle
  chime with sound testing
- Per-window Tauri capabilities and a strict local-only CSP
- Single-instance behavior

See [V2_MIGRATION.md](./V2_MIGRATION.md) for historical migration decisions and
remaining platform parity notes carried into v3.
See [V3_REDESIGN.md](./V3_REDESIGN.md) for the 3.0 redesign scope and the motion
approval checkpoint.

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
Windows x64 and Apple Silicon macOS runners. See
[docs/APPLE_SIGNING.md](./docs/APPLE_SIGNING.md) for the production Developer ID
signing and notarization setup.

## Installer warnings

Development installers are unsigned:

- Windows SmartScreen may display an “unrecognized app” warning.
- macOS Gatekeeper may require Control-clicking the app, choosing **Open**, and
  confirming the first launch.

Manual and version-tag GitHub Actions builds are configured to use Apple
Developer ID signing and notarization after the required repository secrets are
added. Windows code signing is independent and can be added later; the current
unsigned Windows installer remains functional but may show SmartScreen.

## Privacy

Preferences are stored only in the operating system’s per-user application-data
directory. Active-time progress remains in memory and resets after the app
restarts. Break Check and Mello's mood are also session-only and never become
an activity log. Mello is drawn locally by the application and the original GIF is
bundled with it; neither option requires a network connection.
While Mello is visible, the app samples only the pointer's position relative to
the reminder so its eyes and soft body can react. The samples are never stored.
Only Mello's current visible shape accepts clicks and drags; transparent popup
space and the Original GIF pass input through to the application underneath.
