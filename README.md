# Xept Auto-Accept

<p align="right"><b>English</b> | <a href="README_CN.md">中文</a></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.2.3-0078d4?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-43a047?style=flat-square" alt="License">
  <img src="https://img.shields.io/open-vsx/dt/Xept/xept-auto-accept?style=flat-square&label=OpenVSX%20downloads&color=8957e5" alt="OpenVSX Downloads">
  <img src="https://img.shields.io/badge/telemetry-none-e53935?style=flat-square" alt="No Telemetry">
</p>

**Zero-config auto-accept for Antigravity IDE.** Automatically handles approval prompts, terminal commands, file edits, and permission requests — so you can focus on building.

> **No telemetry. No network calls. Everything runs locally.**

---

## ✨ Features

### 🎯 Smart Button Detection

- Recognizes all agent action buttons: **Accept**, **Accept All**, **Run**, **Allow**, **Retry**, and more
- Word-boundary matching with priority ordering — always clicks the right button
- Icon-only button support (codicon checkmarks)

### 🛡️ Safety First

- **Command filtering** — Blocklist/allowlist with word-boundary matching
- **Git conflict protection** — Never clicks Accept in merge/diff editors
- **Circuit breaker** — Stops auto-retry after 3 consecutive recovery clicks
- **Cooldown system** — Prevents rapid duplicate clicks
- **Accept delay** — 2-second review window before accepting file changes

### ⚡ Architecture

- **Event-driven** — MutationObserver reacts to DOM changes instantly, no polling waste
- **Worker thread isolation** — CDP connection runs in a separate thread, never blocks UI
- **Fallback layers** — Expand detection + keyboard shortcut backup for edge cases
- **Hard stop** — OFF button fully disconnects CDP, guaranteed to stop all automation

### 🔧 Simple Controls

- Status bar toggle — one click ON/OFF
- Live click counter
- CDP health indicator (connected / reconnecting / disconnected)
- Zero configuration required — works out of the box

---

## 💿 Installation

### From VSIX

1. Download the latest `.vsix` from Releases
2. In Antigravity: `Extensions` → `...` → `Install from VSIX...`
3. Done — no restart required

### Build from Source

```bash
git clone https://github.com/neo1027144-creator/xept-auto-accept.git
cd xept-auto-accept
npm install
npm run build
npx @vscode/vsce package --no-dependencies
```

---

## ⚡ Quick Start

1. **Install** the extension
2. Launch Antigravity with CDP enabled:

```bash
antigravity --remote-debugging-port=9222
```

3. Look for the **✅ Xept** indicator in the bottom-right status bar
4. That's it — auto-accept is running

---

## ⚙️ Configuration

All settings under `xept.*` in VS Code settings:

| Setting | Type | Default | Description |
|---|---|---|---|
| `xept.autoAllow` | `boolean` | `true` | Auto-accept permission prompts |
| `xept.autoRun` | `boolean` | `true` | Auto-click Run for terminal commands |
| `xept.autoAcceptFileEdits` | `boolean` | `true` | Auto-accept file changes |
| `xept.autoRetryEnabled` | `boolean` | `true` | Auto-retry on errors |
| `xept.cdpPort` | `number` | `9222` | CDP debugging port |
| `xept.blockedCommands` | `string[]` | `[]` | Commands to never auto-run |
| `xept.allowedCommands` | `string[]` | `[]` | Only auto-run these commands (empty = all) |

---

## 🎯 Commands

| Command | Description |
|---|---|
| `Xept: Toggle Auto-Accept` | Enable or disable auto-accept |
| `Xept: Restore Shortcuts` | Generate CDP launcher shortcut |

---

## 🏗️ How It Works

```
┌─────────────────────────────────────┐
│         Xept Auto-Accept            │
├──────────────┬──────────────────────┤
│  Extension   │  CDP Worker Thread   │
│  (controls)  │  (DOM automation)    │
│  ├── Toggle  │  ├── MutationObserver│
│  ├── Config  │  ├── Button Finder   │
│  ├── Health  │  ├── Safety Filter   │
│  └── Status  │  └── Click Handler   │
├──────────────┴──────────────────────┤
│  Status Bar (click count + health)  │
└─────────────────────────────────────┘
```

1. Extension connects to Antigravity via CDP WebSocket
2. Injects a DOM observer script into the agent panel
3. MutationObserver watches for new buttons in real-time
4. Matching buttons are clicked after safety checks pass

---

## 🔒 Privacy & Security

- ✅ **100% local** — All communication on `127.0.0.1`
- ✅ **No telemetry** — Zero external network calls
- ✅ **No data collection** — Nothing leaves your machine
- ✅ **Open source** — Full transparency

---

## ⚠️ Disclaimer

This project is **not affiliated with, endorsed by, or associated with Google or Antigravity** in any way. It is an independent tool. Use at your own risk.

---

## 📄 License

Apache License 2.0. See [LICENSE](./LICENSE) for details.
