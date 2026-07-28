# StandUp

StandUp is a private, activity-aware desktop reminder for Windows and macOS.
After a configurable amount of active keyboard and mouse time, a silent animated
character slides in from the bottom-right of the primary display for eight
seconds. The reminder is always on top, does not take focus, and is completely
click-through.

## Features

- 45-minute default reminder interval, with 15/30/45/60/90/120-minute choices
- Configurable 1/2/3/5/10-minute idle cutoff, defaulting to 3 minutes
- Automatic pauses while idle, locked, suspended, or manually paused
- Tray/menu-bar status, 30-minute and 1-hour pauses, preview, settings, and quit
- Foreground-only application blacklist
- Launch at login, enabled by default in packaged builds
- Local-only settings with no account, network calls, analytics, or activity log
- Transparent, silent, focus-safe reminder over normal and full-screen apps

## Development

Requirements:

- Node.js 22 or newer
- npm

Install and run:

```powershell
npm install
npm start
```

`npm start` builds the TypeScript main process and Vite renderer, then launches
Electron. Login launch is intentionally not registered from a development build.

Useful commands:

```powershell
npm test
npm run typecheck
npm run build
npm run dist:win
npm run dist:mac
```

The macOS DMG must be produced on macOS. The GitHub Actions workflow builds the
Windows x64 installer and a universal macOS DMG on native runners.

## Application behavior

StandUp samples system idle time once per second. Active time is accumulated
only while the idle duration is below the configured threshold. A long scheduler
gap, sleep, lock, or suspend is never treated as active time.

Blacklisted application paths are compared only with the foreground
application. Time inside a blacklisted application still counts; if the reminder
becomes due there, it waits until focus moves elsewhere. Failure to inspect the
foreground application fails open, so the reminder remains available.

Changing the reminder interval resets current progress. Changing the idle
threshold applies immediately. Timer progress and manual pause state are kept in
memory and start fresh after the app restarts. Preferences and blacklist entries
are stored in Electron's per-user application data directory.

## Personal installer warnings

The generated installers are intentionally unsigned:

- **Windows:** Microsoft Defender SmartScreen may show an “unrecognized app”
  warning. Use **More info → Run anyway** only for an artifact you built or
  downloaded from your own trusted workflow.
- **macOS:** Gatekeeper may block the first launch. In Finder, Control-click
  StandUp, choose **Open**, then confirm. System Settings may also offer an
  **Open Anyway** action under Privacy & Security.

Signing and notarization credentials are not included.

## Privacy and permissions

StandUp does not store activity history, window titles, URLs, or usage
statistics. Foreground-app detection requests only the owning application path.
On macOS, Accessibility and Screen Recording permission checks are disabled
because the blacklist does not need window titles or browser data.

## Release verification

Before distributing a build:

1. Run `npm test`, `npm run typecheck`, and `npm run build`.
2. Confirm tray controls, settings persistence, pause/resume, and preview.
3. Confirm the reminder appears on the primary display without taking focus and
   that clicks pass through it.
4. Confirm a due reminder is deferred in a blacklisted foreground app and appears
   after switching away.
5. Confirm login launch from an installed build.
