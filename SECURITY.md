# Security Policy

## What This App Does

CC Terminal Manager is a **local-only** desktop application. It does **not** upload any telemetry, analytics, or user data to external servers.

### Data Access

- **Reads** `~/.claude/projects/` and `~/.claude/sessions/` to list and resume Claude Code sessions
- **Reads and modifies** `~/.claude/settings.json` to inject/remove hook entries (prefixed with `__cc_manager__` marker)
- Before modifying `settings.json`, a timestamped backup is saved to `%APPDATA%/cc-terminal-manager/backups/`

### Local HTTP Server

- Listens on `127.0.0.1:7800` (localhost only, not exposed to network)
- Used exclusively for receiving Claude Code hook events from the local `cc-hook` script
- Falls back to port 7801/7802 if 7800 is occupied

### Hook Scripts

- When hooks are enabled, the app registers command hooks in `~/.claude/settings.json`
- These hooks call `cc-hook.exe` (bundled) which POSTs event data to the local HTTP server
- Hook entries are tagged with `_marker: "__cc_manager__"` for clean removal

## Reporting a Vulnerability

If you discover a security vulnerability, please report it through one of these channels:

1. **GitHub Security Advisory**: [Create a private advisory](https://github.com/qq2499899011/cc-terminal-manager/security/advisories/new)
2. **Email**: 2499899011@qq.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

We will acknowledge receipt within 48 hours and aim to provide a fix within 7 days for critical issues.
