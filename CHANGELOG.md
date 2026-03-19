# Changelog

All notable changes to Xept Auto-Accept will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.2] - 2026-03-19

### Added
- **User Dashboard** — Editor Webview Panel (`Ctrl+Shift+X`) with 5 sections:
  - Real-time status: running state, click count, CDP health
  - Automation toggles: file edits / terminal commands / permissions / retry
  - Safety filters: blocked/allowed command tag editor
  - Advanced settings: accept review delay slider (0–10s), custom button texts
  - Activity log: toggle, health, and click events
- **Status bar dual buttons**: `📊` Dashboard + `✅ Xept: ON` direct toggle
- `xept.acceptDelay` config: configurable review delay (default 2000ms)
- Keybinding `Ctrl+Shift+X` to open Dashboard

### Fixed
- Dashboard click count sync bug (double-counting on re-open)
- Missing activity log entries for toggle and CDP health changes
- Webview assets (css/js) now correctly bundled in VSIX via `dist/webview/`

### Changed
- CDP Port removed from Dashboard UI (runtime change causes dual-port conflicts)
- Status bar click: direct toggle instead of QuickPick menu

### Security
- CDP disconnected on OFF (hard stop via `manager.stop()`)
- 2-second review delay on accept/apply/keep/save buttons
- Alt+Enter input field protection (prevents accidental message send)
- Layer 1 VS Code commands disabled (not available in current Antigravity)

## [0.2.0] - 2026-03-19

### Added
- Core automation: auto-click Run, Accept All, Allow, Retry buttons via CDP
- Safety filter: block/allowlist with word-boundary matching
- 28 unit tests for SafetyFilter (all passing)
- Circuit breaker: max 3 retries per 60s
- Launcher: auto-configure `--remote-debugging-port` in Antigravity shortcut
- Status bar: running state + click count + CDP health indicator
- 4 independent toggle configs (autoRun, autoAcceptFileEdits, autoAllow, autoRetryEnabled)
- Fallback chain: Expand → Alt+Enter → codicon-check
- Git merge conflict exclusion
- Auto-scroll to bottom of agent panel
