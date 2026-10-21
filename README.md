# OpenCodeReview Desktop

把 [alibaba/open-code-review](https://github.com/alibaba/open-code-review) 的命令行审查能力放进一个可操作的桌面工作台：选择仓库与审查范围、实时查看运行过程、按文件阅读发现、回看历史会话并对比两次审查。

界面使用 Electron + React，审查逻辑、规则匹配、模型调用与会话格式全部由本机的 `ocr` 命令行完成。桌面端只负责编排与呈现，不复制审查实现。

## 功能

- **四种审查范围**：工作区更改、分支对比、单次提交、全量扫描。
- **运行前预览**：不调用模型，先列出将要审查的文件与增删行数。
- **实时运行面板**：流式显示 `ocr` 的进度日志，可随时取消。
- **发现阅读器**：按文件分组，支持严重度/类别/关键词筛选；展开可看模型分析、现有代码与建议代码，并直接跳转到编辑器对应行。
- **本地处理状态**：标记“已修复”或“忽略”，仅保存在本机，不影响会话文件。
- **历史会话**：列出仓库的全部审查记录，查看摘要与逐文件明细；勾选两次审查即可对比新增、仍存在、已解决、未复查。
- **继续审查**：从中断或部分完成的会话恢复；也可以复用上次的审查范围。
- **导出**：Markdown、JSON，以及命令行生成的自包含 HTML 会话报告。
- **模型配置**：内置 30 个服务商目录，支持自定义 OpenAI / Anthropic / Responses 兼容端点，保存前可测试连接。
- **同名冲突修复**：自定义服务商与内置服务商重名时，一键重命名或把密钥迁移到内置配置。

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| Node.js | 建议使用 20.19+ 或 22.12+（开发与打包兼容性要求） |
| Git | 建议使用 2.41 或更高；差异类审查依赖 Git |
| ocr | `npm install -g @alibaba-group/open-code-review` |

Node.js 和 Git 版本目前用于兼容性参考，桌面端启动时会检查命令是否可执行，但不会强制比较最低版本。

首次启动时如果没有找到 `ocr`，界面会显示环境检查与一键安装页，安装日志直接显示在窗口里。

## 快速开始

```bash
cd open-code-review-desktop
npm install
npm run dev
```

`npm install` 需要下载 Electron 二进制。国内网络可以先设置镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

如果依赖装好后仍提示 `Electron uninstall`，在 `node_modules/electron` 目录执行：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node install.js
```

Windows PowerShell 使用下面的写法设置镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

如果需要重新安装 Electron：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
cd node_modules/electron
node install.js
```

## 配置模型

1. 打开左侧「设置」。
2. 选择内置服务商（如 Anthropic、DeepSeek、通义千问）或切到「自定义服务商」。
3. 填写模型与 API Key；内置服务商也可以留空 Key，改为在启动环境中设置对应的环境变量。
4. 点击「测试填写的连接」可以先验证，再保存。

配置写入 `~/.opencodereview/config.json`，与命令行完全共用。桌面端不会把已保存的 Key 回填到输入框，只显示末四位。

> 自定义服务商名称不能与内置服务商重名。若检测到重名，设置页会给出修复入口。

## 分享与密钥安全

- `config.example.json` 只包含占位符，可复制后按需填写；不要把真实 API Key 写入项目目录或提交到版本库。
- 桌面端实际读取的配置位于 `~/.opencodereview/config.json`（Windows 通常为 `%USERPROFILE%\\.opencodereview\\config.json`），该文件不属于本项目迁移内容。
- 也可以使用供应商目录中列出的环境变量提供密钥。分享项目文件夹前，请检查终端环境、编辑器任务和本机配置中没有真实密钥。

## 使用流程

1. 点击左上角「项目 → 打开」，选择一个 Git 仓库。
2. 在左栏选择审查范围：
   - **工作区更改**：已暂存、未暂存与未跟踪文件。
   - **分支对比**：填写起点与终点引用，可交换。
   - **单次提交**：从最近提交中选择或粘贴哈希/标签。
   - **全量扫描**：可填逗号分隔的路径；留空扫描整个仓库。
3. 可选填写「业务背景」，并在「高级选项」中覆盖力度、并发、Token 预算、模型、排除规则等。
4. 点「预览文件」确认范围，或直接「开始审查」。
5. 运行结束后在右侧阅读发现；在「历史」中回看或对比。

## 打包

```bash
npm run package
```

- `release/win-unpacked/`：免安装的便携版，直接运行 `OpenCodeReview.exe`。
- `release-installer/OpenCodeReview Setup <version>.exe`：Windows x64 NSIS 安装包，文件名中的版本号来自 `package.json`。

脚本先生成便携版，再从该目录构建安装包，避免在部分 Windows 环境中解压重命名被安全软件短暂锁定。应用图标来自项目 Logo，位于 `resources/icon.png`。

## 项目结构

```
src/
  main/                 Electron 主进程
    index.ts            IPC、窗口与文件/编辑器交互
    services/cli.ts     ocr 进程管理、审查运行、取消、JSON 解析
    services/config.ts  模型配置读写、密钥脱敏、连接测试
    services/sessions.ts 会话列表/详情/对比/导出
    services/git.ts     Git 状态、分支、提交
    services/settings.ts 桌面端偏好与最近项目
  preload/              contextBridge 暴露的受控 API
  shared/               主进程与渲染进程共享的类型与供应商目录
  renderer/
    index.html          渲染进程入口页面
    src/                React 界面、组件、样式与资源
scripts/gen-providers.mjs  从上游 providers.go 生成供应商目录
resources/              应用图标与 Logo
config.example.json     配置模板（仅包含占位符）
```

### 与命令行的对应关系

| 界面操作 | 实际命令 |
| --- | --- |
| 开始审查 | `ocr review --format json [--from/--to/--commit/--resume ...]` |
| 全量扫描 | `ocr scan --format json [--path ...]` |
| 预览文件 | `ocr review --format text --preview` 或 `ocr scan --format text --preview` |
| 历史列表 | `ocr session list --repo <repo> --json --limit 0` |
| 会话详情 | `ocr session show --repo <repo> --json <id>`；审查评论使用 `ocr session comments --repo <repo> --json <id>` |
| 会话对比 | `ocr session compare --repo <repo> --json <before> <after>` |
| 导出 HTML | `ocr session export --repo <repo> <id> -o <path>` |
| 删除会话 | `ocr session rm --yes <id>` |
| 测试连接 | `ocr llm test` |

## 安全说明

- 渲染进程启用 `contextIsolation`，关闭 `nodeIntegration`，只通过 preload 暴露白名单 API。
- 配置中的 `api_key` / `auth_token` 在主进程读取时即被脱敏，不会把完整密钥发送到界面。
- 外部链接只允许 `http/https`，并在系统浏览器中打开。
- 会话与配置文件沿用命令行的本机目录（`~/.opencodereview`）。桌面端不额外收集或上传数据；模型请求由本机 `ocr` CLI 按用户配置发送给相应服务商。

## 已知限制

- 需要本机已经安装或能够安装 `ocr` 命令行；桌面端不内置二进制。
- 项目选择目前要求目录位于 Git 仓库中；纯文件系统目录的全量扫描暂不支持。
- 委派模式（`ocr delegate`）、`ocr auth` 登录（如 ChatGPT 订阅）与 MCP 服务配置尚未提供图形化入口，需要时可在终端完成。
- 本地“已修复/忽略”标记只保存在当前设备的 `localStorage`，不会写回会话。

## 协作提示

这是从本地开发目录迁移出的源码副本；`node_modules/`、`out/`、`release/` 和 `release-installer/` 等可再生目录不会随源码分发。协作者在项目目录执行 `npm install` 后即可开发。

## 许可

Apache-2.0。OpenCodeReview 命令行、名称与 Logo 来自 [alibaba/open-code-review](https://github.com/alibaba/open-code-review)，同样以 Apache-2.0 发布；详见 `NOTICE`。
