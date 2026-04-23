# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-xx

First public release.

### Added

- Tabbed terminal manager for Claude Code sessions on Windows
- Session status detection (thinking, waiting for approval, idle, exited)
- Desktop notifications for Claude Code events (stop, permission prompt)
- Hook system integration with `~/.claude/settings.json`
- Session history browser with full-text search
- Resume previous Claude Code sessions
- Multiple launch modes: default, YOLO, plan
- Tray icon with pending session badge
- Sidebar with CWD-grouped session list
- Auto-naming sessions from first user message
- Right-click context menu (rename, copy CWD, close)
- Settings panel (hooks toggle, notification toggle, default shell)
- Structured logging with `electron-log`
- i18n support (English + Simplified Chinese)
- Environment prerequisite checks (Claude CLI, shell availability)
- Bundled `cc-hook.exe` — no system Node.js required
- NSIS installer with automatic hook cleanup on uninstall
- Portable zip distribution
- Lightweight update checker (links to GitHub Releases)

### Security

- Local-only HTTP server on `127.0.0.1`
- No telemetry or external data collection
- Automatic backup of `~/.claude/settings.json` before modification
- Log scrubbing (home path, UUIDs)
