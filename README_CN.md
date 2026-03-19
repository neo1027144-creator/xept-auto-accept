# Xept Auto-Accept

<p align="center">
  <img src="https://img.shields.io/badge/版本-0.2.2-0078d4?style=flat-square" alt="版本">
  <img src="https://img.shields.io/badge/许可-Apache--2.0-43a047?style=flat-square" alt="许可">
  <img src="https://img.shields.io/open-vsx/dt/Xept/xept-auto-accept?style=flat-square&label=OpenVSX%20下载量&color=8957e5" alt="OpenVSX 下载量">
  <img src="https://img.shields.io/badge/数据收集-无-e53935?style=flat-square" alt="无数据收集">
</p>

**Antigravity IDE 零配置自动接受插件。** 自动处理审批提示、终端命令确认、文件编辑接受和权限请求——让你专注于开发。

> **无数据收集。无网络请求。一切在本地运行。**

---

## ✨ 功能特性

### 🎯 智能按钮检测

- 识别所有 Agent 操作按钮：**Accept**、**Accept All**、**Run**、**Allow**、**Retry** 等
- 词边界精确匹配 + 优先级排序，始终点击正确的按钮
- 支持纯图标按钮（codicon 勾选按钮）

### 🛡️ 安全优先

- **命令过滤** — 黑名单/白名单，词边界精确匹配
- **Git 冲突保护** — 不会点击合并/差异编辑器中的 Accept
- **熔断器** — 连续 3 次恢复点击后自动停止
- **冷却机制** — 防止快速重复点击
- **Accept 审阅延迟** — 文件变更接受前留 2 秒审阅窗口

### ⚡ 架构设计

- **事件驱动** — MutationObserver 实时响应 DOM 变化，无轮询浪费
- **Worker 线程隔离** — CDP 连接在独立线程运行，不阻塞 UI
- **多层兜底** — 折叠展开检测 + 键盘快捷键备用方案
- **硬停止** — OFF 按钮完全断开 CDP，确保停止全部自动化

### 🔧 简单控制

- 状态栏一键开关
- 实时点击计数
- CDP 健康指示器（已连接 / 重连中 / 已断开）
- 零配置 — 开箱即用

---

## 💿 安装

### 从 VSIX 安装

1. 从 Releases 下载最新 `.vsix`
2. Antigravity 中：`扩展` → `...` → `从 VSIX 安装...`
3. 完成 — 无需重启

### 从源码构建

```bash
git clone https://github.com/neo1027144-creator/xept-auto-accept.git
cd xept-auto-accept
npm install
npm run build
npx @vscode/vsce package --no-dependencies
```

---

## ⚡ 快速开始

1. **安装**插件
2. 使用 CDP 启动 Antigravity：

```bash
antigravity --remote-debugging-port=9222
```

3. 查看右下角状态栏的 **✅ Xept** 指示器
4. 完成 — 自动接受已运行

---

## ⚙️ 配置项

所有设置位于 VS Code 设置中的 `xept.*` 命名空间：

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `xept.autoAllow` | `boolean` | `true` | 自动接受权限提示 |
| `xept.autoRun` | `boolean` | `true` | 自动点击终端命令 Run |
| `xept.autoAcceptFileEdits` | `boolean` | `true` | 自动接受文件变更 |
| `xept.autoRetryEnabled` | `boolean` | `true` | 错误时自动重试 |
| `xept.cdpPort` | `number` | `9222` | CDP 调试端口 |
| `xept.blockedCommands` | `string[]` | `[]` | 永不自动执行的命令 |
| `xept.allowedCommands` | `string[]` | `[]` | 仅自动执行这些命令（空 = 全部） |

---

## 🏗️ 工作原理

```
┌─────────────────────────────────────┐
│         Xept Auto-Accept            │
├──────────────┬──────────────────────┤
│  Extension   │  CDP Worker Thread   │
│  (控制层)    │  (DOM 自动化)        │
│  ├── 开关    │  ├── MutationObserver│
│  ├── 配置    │  ├── 按钮查找器      │
│  ├── 健康    │  ├── 安全过滤器      │
│  └── 状态    │  └── 点击处理器      │
├──────────────┴──────────────────────┤
│  状态栏（点击计数 + 健康状态）      │
└─────────────────────────────────────┘
```

1. 插件通过 CDP WebSocket 连接 Antigravity
2. 向 Agent 面板注入 DOM 观察脚本
3. MutationObserver 实时监控新出现的按钮
4. 通过安全检查后自动点击匹配的按钮

---

## 🔒 隐私与安全

- ✅ **100% 本地** — 所有通信仅限 `127.0.0.1`
- ✅ **无数据收集** — 零外部网络请求
- ✅ **无数据收集** — 任何数据都不离开你的设备
- ✅ **开源** — 完全透明

---

## ⚠️ 免责声明

本项目与 Google 或 Antigravity **没有任何关联、认可或关系**。这是一个独立工具，使用风险自负。

---

## 📄 许可证

Apache License 2.0。详见 [LICENSE](./LICENSE)。
