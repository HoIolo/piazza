# Piazza

基于 [pi coding agent](https://github.com/earendil-works/pi) 的桌面 GUI，界面复刻 OpenAI Codex 桌面版，并把 pi 的自定义模型配置变成可视化编辑。

Piazza 的 macOS 安装包包含 Pi SDK 和 Node.js。安装后可直接启动，并继续使用已有的 `~/.pi/agent` 配置与会话。首次使用需配置模型和凭据。

## 构建环境

| 依赖 | 说明 |
|---|---|
| Node.js ≥ 22 | 前端构建 |
| Rust stable | Tauri 后端 |
| Xcode CLT | macOS 构建工具链 |

## 开发

```bash
npm install
npm run tauri dev      # 启动开发模式
npm run tauri build    # 打包 .app
```

首次构建会下载校验固定版本的 Node.js，并按锁文件安装 Pi SDK。运行时版本保存在 `scripts/prepare-pi-runtime.sh` 和 `pi-runtime/package.json`。

质量门槛

```bash
npm run typecheck                      # tsc --noEmit
npm run lint                           # ESLint，零警告
cd src-tauri && cargo clippy -- -D warnings
```

## 架构

前端与 pi 之间不直接通信，全部经由 Rust 侧的子进程桥接：

```
React UI  ──invoke/event──  Rust (Tauri)  ──JSONL over stdio──  内置 Node.js + Pi SDK
```

### Rust 侧（`src-tauri/src/`）

| 文件 | 职责 |
|---|---|
| `rpc.rs` | 子进程管理、JSONL 严格分帧、事件转发 |
| `config.rs` | `models.json` / `settings.json` 的原子读写 |
| `sessions.rs` | 扫描 `~/.pi/agent/sessions` 并按真实 cwd 分组 |
| `git.rs` | 分支读取/列举/切换、worktree 管理、工作区增删统计 |
| `files.rs` | 项目内文件搜索，供输入框的 @ 提及使用 |
| `external.rs` | 探测已安装的编辑器，用 `open -a` 打开项目 |

**五个容易踩的坑，已在代码中处理：**

1. **后台运行时**。Tauri 按应用资源绝对路径启动 Node.js 和 `pi-runtime/worker.mjs`，每个会话槽位保留自己的进程及工作目录。

2. **JSONL 分帧**：pi 的 RPC 协议规定**只以 LF 作为记录分隔符**。不能使用通用行读取器——例如 Node 的 `readline` 会额外在 `U+2028`/`U+2029` 处断行，而这两个字符在 JSON 字符串内是合法内容，会把一帧劈成两半。`rpc.rs` 手工按字节扫描 `0x0A`，并有 7 个单元测试覆盖（含 CRLF、U+2028、跨读取重组、200KB 超大帧）。

3. **`message_update` 与文档不符**：pi 官方文档称该事件带有 `message`（当前完整消息）和 `assistantMessageEvent.partial`。**v0.82.1 实测两者都不存在**，只有 `{ type, contentIndex, delta }`。若照文档实现，会在 `event.message.role` 处直接抛 TypeError。因此 `store/chat/stream.ts` 自行按 `contentIndex` 累积内容，并用 `*_end` 事件携带的完整文本覆盖累积结果以纠正偏差。

4. **SDK 兼容性**。后台入口复用 Pi 的会话运行时、RPC 和内置扩展，并按固定版本加载与该版本配套的代理及项目信任逻辑。

5. **切换会话会误报「进程已退出」**：`rpc_start` 会先 kill 旧进程，旧进程 stdout 关闭同样触发退出事件。`rpc.rs` 给每次会话分配递增的代号，reader 结束时比对代号，只有仍是当前代（即非主动切换）才上报，否则每切一次会话都会弹一次假错误。

### 没有对应能力的按钮一律不做

Codex 的部分入口在 pi 里没有对应物，这些位置**不保留占位按钮**——点了没反应比没有这个入口更让人困惑：

| Codex 的入口 | pi 的情况 | 处置 |
|---|---|---|
| 拉取请求、已安排任务 | 无 | 移除 |
| 通知铃铛 | 无通知机制 | 移除 |
| 新工作树、关联 Codex web、发送至云端 | 只在本地跑 | 「本地」换成 git worktree 切换/新建 |
| 三档操作审批 | 无沙箱、无操作级审批 | 换成真实存在的「项目信任」（`defaultProjectTrust`） |
| 向用户提问（`request_user_input`） | 无同名工具，但有扩展 UI 协议 | 用 `select`/`confirm`/`input`/`editor` 呈现同样的问答卡片 |
| 目标、计划模式、录制技能、宠物 | 无 | 移除 |
| 浏览器、电脑操控 | 无 | 移除 |
| 插件 | 有 packages | 指向设置的「扩展包」分区 |

### 会话目录名不可反解

会话存储路径是把 cwd 的 `/` 替换成 `-` 得到的，该变换**有损**：
`--Users-haha-Desktop-xinlian-h5-live-streaming--` 的真实 cwd 是
`/Users/haha/Desktop/xinlian/h5-live-streaming`（两级目录）。
因此 `sessions.rs` 从每个 `.jsonl` 的首行 header 读取真实 `cwd`，而不是从目录名反推。

### 前端（`src/`）

分层依赖严格单向，上层可依赖下层，反之不可：

```
design/primitives  →  无业务、无 store、无 RPC
shared/            →  工具、Tauri API 封装、通用组件
rpc/ + store/      →  通信与状态
features/          →  业务 UI（彼此不互相依赖）
app/               →  仅组装与布线
```

`design/primitives` 反向依赖 `features`/`store` 会被 ESLint 直接拦截。

## 约定

- 组件文件 ≤150 行；逻辑函数 ≤50 行（JSX 组件放宽至 100，理由见 `eslint.config.js`）
- 颜色、圆角、间距一律走 `design/tokens.css` 的 CSS 变量，代码中不出现硬编码色值
- 动效时长与缓动同样走令牌（`--dur-*` / `--ease-*`）。开启系统「减弱动态效果」时全局降级为无动画，仅 Spinner / Skeleton 保留循环——静止的进度指示会被误读成程序卡死
- RPC 类型以 `src/rpc/types/` 为唯一来源，不在别处重复定义
- 禁用 `any`；副作用只在 hooks 中，组件不直接调用 RPC

## 已实现

- 三栏布局：项目/会话侧栏、聊天区、右侧工作区面板（审阅/终端/文件）
- 环境信息（变更行数、工作模式、分支）：会话区够宽时停靠在右侧成卡片，顶栏按钮开关；窄时退回顶栏弹窗
- **聊天区按轮次组织**：一次 prompt 可能产生多个 turn，完成后收起过程、只留最后一轮汇报，顶部「耗时 Ns」可展开全过程；复制/分支按钮只在整次交互末尾出现一次
- 工具调用与思考都是一行文字（`已运行 pwd ⌄`），进行中带扫光动画，点开才显示结果卡片
- 发送后底部留白 40vh，回答增长时自然吃掉，滚动持续跟到底
- 会话刻度：聊天区左侧一列横杠，悬停出该轮摘要、点击跳转，主区变窄时自动收起
- ⌘K 命令面板（含 pi 的扩展命令、技能、提示词模板）
- 输入区控件全部接真实能力：项目切换、worktree 工作模式、分支列举/切换/新建、模型与推理强度、项目信任级别
- `@` 提及与「+」菜单共用一个面板，可搜项目文件、技能与提示词、历史会话
- 扩展索取输入时（`ctx.ui.select()` 等）弹出问答卡片，侧栏同步显示转圈或「需要用户输入」
- 会话操作：双击标题重命名、导出 HTML、用已安装的编辑器打开项目
- 设置内嵌于主界面（非独立窗口）：内置运行时、默认模型、主题、压缩与重试、扩展包、项目信任
- **模型配置**：可视化增删改 `~/.pi/agent/models.json` 的 provider 与 model。页面只是概览卡片，增改在对话框里完成、按保存即落盘；上下文窗口给 200K / 400K / 1M 三档加自定义。写前备份为 `.bak`，经临时文件原子落盘，保留 GUI 不认识的用户手写字段与键顺序

## 未实现

pi 侧无对应能力的 Codex 分区（见上文表格）一律未做，且不留占位入口。
