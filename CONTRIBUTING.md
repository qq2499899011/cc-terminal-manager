# Contributing to CC Terminal Manager

Thanks for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js >= 20
- npm
- Windows 10/11 x64
- Claude Code CLI installed

### Getting Started

```bash
git clone https://github.com/qq2499899011/cc-terminal-manager.git
cd cc-terminal-manager
npm install
npm run rebuild   # rebuild node-pty for Electron
npm run dev       # build renderer + launch in dev mode
```

### Project Structure

```
src/
  main/          # Electron main process
  preload/       # Preload scripts (context bridge)
  renderer/      # Frontend (vanilla JS + xterm.js)
  shared/        # Shared constants and utilities
hook-scripts/    # Claude Code hook script (compiled to exe for release)
```

## Pull Request Guidelines

1. Fork the repo and create your branch from `main`
2. Keep changes focused — one feature or fix per PR
3. Test on Windows with Claude Code installed
4. Update `CHANGELOG.md` if your change is user-facing

### Commit Messages

Use conventional commit style:

```
feat: add dark mode toggle
fix: terminal not resizing on sidebar drag
docs: update installation instructions
```

## Code Style

- No linter configured yet — just follow existing patterns
- Prefer `const` over `let`, avoid `var`
- Use single quotes for strings
- Keep comments minimal — code should be self-explanatory

## Reporting Issues

Use the [issue templates](https://github.com/qq2499899011/cc-terminal-manager/issues/new/choose) to report bugs or request features.
