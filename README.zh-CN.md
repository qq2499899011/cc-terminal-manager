# CC Terminal Manager

Windows 平台的 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 多标签终端管理器。

![演示](docs/demo.gif)

## 功能特性

- **多标签终端** — 同时运行多个 Claude Code 会话
- **实时状态检测** — 状态指示器（思考中、等待审批、空闲）
- **桌面通知** — Claude 完成任务或需要审批时弹窗提醒
- **会话历史** — 浏览和恢复历史 Claude Code 会话，支持全文搜索
- **多种启动模式** — 默认、YOLO（跳过权限确认）、Plan 模式
- **托盘图标** — 角标显示待处理会话数量
- **自动命名** — 根据你的第一条消息自动命名会话

| 设置面板 | 桌面通知 | 恢复会话 |
|---------|---------|---------|
| ![设置](docs/settings.png) | ![通知](docs/notification.png) | ![恢复](docs/resume.png) |

## 平台支持

- ✅ Windows 10/11 x64（已测试）
- ❌ Windows ARM64（未测试，欢迎 PR）
- ❌ macOS / Linux（暂不支持）

## 安装

### 前置要求

- 已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

### 下载

从 [Releases 页面](https://github.com/chenyue/cc-terminal-manager/releases) 下载最新版本：

- **`CC.Terminal.Manager-Setup-x.y.z.exe`** — NSIS 安装包（推荐）
- **`CC.Terminal.Manager-x.y.z-win-x64.zip`** — 便携版（免安装）

### Windows SmartScreen 警告

> ⚠️ 本应用**尚未进行代码签名**。运行安装程序时，Windows Defender SmartScreen 会显示 **"Windows 已保护你的电脑"**。这是未签名应用的正常行为。
>
> 操作步骤：
> 1. 点击 **"更多信息"**
> 2. 点击 **"仍要运行"**
>
> 你可以通过 [Release 页面](https://github.com/chenyue/cc-terminal-manager/releases) 上的 SHA256 校验值验证安装包的完整性。

## 工作原理

### Hooks 机制

CC Terminal Manager 通过 Claude Code 的 [hooks 系统](https://docs.anthropic.com/en/docs/claude-code/hooks) 进行集成：

1. 在设置中启用 hooks 后，应用会修改 `~/.claude/settings.json` 注册 `Stop` 和 `Notification` hooks
2. 本地 HTTP 服务运行在 `127.0.0.1:7800`，接收 hook 事件
3. 内置的 `cc-hook.exe` 由 Claude Code 在事件触发时调用，将事件转发到本地服务
4. 所有注入的条目都带有 `__cc_manager__` 标记，便于清理

**修改 `settings.json` 前**，应用会在 `%APPDATA%/cc-terminal-manager/backups/` 创建带时间戳的备份。

### 卸载流程

1. 打开应用设置，**先禁用 hooks**
2. 然后通过 Windows 设置 > 应用 卸载，或运行卸载程序
3. NSIS 卸载程序会自动清理 `~/.claude/settings.json` 中残留的 hook 条目

## 开发

```bash
git clone https://github.com/chenyue/cc-terminal-manager.git
cd cc-terminal-manager
npm install
npm run rebuild   # 为 Electron 重新编译 node-pty
npm run dev       # 构建渲染进程 + 以开发模式启动
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 常见问题

**Q: 应用提示找不到 Claude Code CLI？**
A: 确保 `claude` 在 PATH 中可用。在终端运行 `claude --version` 验证。

**Q: 启用了 hooks 但收不到通知？**
A: 检查 `~/.claude/settings.json` 中是否包含带 `__cc_manager__` 标记的条目。尝试在设置中禁用后重新启用 hooks。

**Q: 创建会话后终端空白？**
A: 应用在 PTY 中启动 `claude`。如果 Claude Code 未安装或 shell 配置有误，终端可能显示空白。检查默认 shell 设置。

## 许可证

[MIT](LICENSE) © 2026 chenyue

---

[English](README.md)
