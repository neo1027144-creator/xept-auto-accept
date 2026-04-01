# Changelog

All notable changes to Xept Auto-Accept will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.4] - 2026-04-01

### Added
- **Initializing status bar state**: spinner indicator during CDP startup, prevents premature clicks before connection is ready
- `argv.json` direct read/write for CDP port persistence — port survives IDE restarts without relying on `globalState`

### Fixed
- **Permission button flicker loop**: execution policy selector no longer auto-clicked (dom-observer exclusion)
- **Retry button**: replaced broken `reloadWindow` command with `xept.restart` for correct behavior
- Status bar now shows distinct states: `initializing` → `connected` → `disconnected` throughout lifecycle
- Health check restart/startup logic: avoids duplicate CDP connections on re-enable

## [0.2.3] - 2026-03-20

### Fixed
- **OFF 按钮不生效**：stop() 通过 PortScanner 重新发现 CDP targets 并用临时 WebSocket 发送 kill 脚本，不再依赖已被 heartbeat prune 清空的 sessions
- **连续命令交替不点击**：COOLDOWN_MS 从 5 秒缩短到 1.5 秒，防止相同 DOM 位置的后续按钮被误拦
- **黑白名单配置不实时生效**：pushFilterUpdate 用 PortScanner + directCdpEval 推送，改完配置无需 Reload

### Added
- `directCdpEval` 方法：绕过 worker 直接通过临时 WebSocket 向 CDP targets 发送命令
- Dashboard 诊断日志：stop() 时显示 Stopping / Stopped 状态

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
