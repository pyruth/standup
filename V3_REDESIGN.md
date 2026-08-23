# StandUp 3 redesign

StandUp 3 is the new Mello-led product design built on the Tauri 2 foundation.
It is developed separately on `codex/v3-redesign`; the Electron `main` line and
the existing v2 work remain intact.

## Included in 3.0.0

- Approved System, Light, and Dark settings experience with focused Animation,
  General, Reminders, Schedule, Shortcuts, Snooze & DND, and About pages.
- Mello mascot or bundled Original GIF selection.
- Editable two-line reminder message, limited to 25 characters.
- Six Mello colors and six reminder-board colors.
- Direct Mello interaction without replaying the entrance animation: clicks
  cycle punch, five-way split, and angry reactions; dragging stretches the
  jelly body and vertical releases create upward or downward bounces.
- Smooth page, theme, segmented-control, and swatch transitions.
- New happy Mello application, executable, installer, and macOS icon assets.
- Bundled GIF loading through the production asset pipeline so development and
  packaged previews use the same reliable resource.
- Fully wired weekly scheduling with selectable active days, local start/end
  times, overnight ranges, preserved timer progress, tray/status feedback, and
  automatic pending-reminder delivery when active hours resume.
- Versioned Windows NSIS and Apple Silicon macOS DMG build configuration.

## Approved motion integrated

The approved punch/split, random angry, elastic drag, drop, and bounce studies
now run in both the Settings preview and the live reminder. Mello's current
distorted shape is hit-tested continuously, so only visible mascot pixels claim
mouse input. The transparent window area remains pass-through and the window
never accepts keyboard focus.

The original review reel remains at
`artifacts/StandUp-V3-Mello-motion-approval.mp4`. Jelly dragging has its focused
stretchable study at
`artifacts/StandUp-V3-Mello-stretchable-drag-approval.mp4`.

The super-duper-happy, droplet entry, macOS top-hang, and bottom sit-up studies
remain future motion options and are not claimed as part of this interaction
slice.

## Included in 3.1.0

- Private Mello Break Check using only idle/return timing, with a local happy
  celebration and session-only energetic/sleepy mood.
- Silent one-minute Mello Peek before stand reminders.
- Optional independent microbreak timing and rotating built-in Mello Moves
  prompts. No prompt or asset is downloaded at runtime.
- Expanded DND deadlines: 2 hours, tomorrow at 8:00 AM, or the next weekly
  schedule period.
- Optional native global keyboard shortcuts with parse, duplicate, and
  operating-system registration conflict checks.
- A first-run setup for interval, schedule, sound, monitor, and mascot color.

## Verification

```powershell
npm test
npm run typecheck
npm run build:web
cargo test --manifest-path src-tauri/Cargo.toml
npm run dist:win
```

The Windows build output is
`src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/StandUp_3.1.0_x64-setup.exe`.
