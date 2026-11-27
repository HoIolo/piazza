# 架构

这份文档写给要改代码的人（以及 agent）。README 讲「能做什么」，这里讲「为什么这么接」。

## 总览

```
┌─────────────┐  invoke / event   ┌──────────────┐   JSONL over stdio   ┌──────────────────────┐
│  React UI   │ ────────────────▶ │  Rust/Tauri  │ ───────────────────▶ │ 内置 Node + Pi SDK   │
│   (src/)    │ ◀──────────────── │ (src-tauri/) │ ◀─────────────────── │ (pi-runtime/*.mjs)   │
└─────────────┘                   └──────────────┘                      └──────────────────────┘
```

- 前端**不**直连 Node，所有调用都经过 Rust 侧的子进程桥接。
- 每个会话槽位有自己的 pi 进程与 cwd；主会话、侧边聊天、账号授权各占一条通道。
- 事件名前缀、通道常量两边必须一致：`src/rpc/channels.ts` ↔ `src-tauri/src/rpc.rs`。

## 前端分层

依赖严格单向，上层可依赖下层，反之不可——由 ESLint 的 `no-restricted-imports` 强制：

```
design/primitives  →  无业务、无 store、无 RPC
shared/            →  工具、Tauri API 封装、通用组件
rpc/ + store/      →  通信与状态
features/          →  业务 UI（彼此不互相依赖）
app/               →  仅组装与布线
```

- `features/*` 之间禁止互相 import：要共享就上提到 `shared/` 或 `store/`。
- `design/primitives` 反向依赖 `features`/`store` 会被 lint 直接拦下。
- 组件文件 ≤150 行，逻辑函数 ≤50 行（JSX 组件放宽到 100，理由见 `eslint.config.js` 注释）。

### `store/chat` 的分工

| 文件组                                                                       | 职责                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| `store.ts` / `storeBuilders.ts` / `types.ts`                                 | 状态骨架、切片构造、类型                 |
| `stream.ts`                                                                  | 把流式事件按 `contentIndex` 累积成消息块 |
| `reducer.ts` / `useAgentEvents.ts`                                           | 事件 → 状态；订阅与分发                  |
| `sendPrompt.ts` / `pendingSteers.ts`                                         | 发送、运行中引导与排队                   |
| `sessionPool.ts` / `bootSession.ts` / `sessionCache.ts` / `switchHelpers.ts` | 多槽位会话池、启动、缓存、切换           |
| `editFork.ts` / `editFallback.ts`                                            | 编辑重发与内存回退                       |
| `restoreTools.ts` / `refreshRuntime.ts`                                      | 空闲重连、工具与运行时状态恢复           |
| `contextWindow.ts` / `modelFallback.ts` / `sessionMetadata.ts`               | 上下文用量、模型兜底、会话元数据         |

## Rust 模块

| 文件                 | 职责                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `lib.rs`             | Tauri 入口与命令注册（`generate_handler!` 是命令的唯一清单）                             |
| `commands.rs`        | 暴露给前端的命令，薄封装，只做参数整理与错误转换                                         |
| `rpc.rs`             | 子进程生命周期、JSONL 严格分帧、事件转发、进程代次                                       |
| `config.rs`          | `models.json` / `settings.json` 的原子读写                                               |
| `data_dir.rs`        | 数据根与 agent 目录（`~/.piazza/agent`），worker 通过 `PI_CODING_AGENT_DIR` 拿到同一个值 |
| `import.rs`          | 首次启动把 `~/.pi/agent` 的配置与会话复制进来                                            |
| `sessions.rs`        | 扫描 `<agent>/sessions`、按真实 cwd 分组、快照、截断、回收                               |
| `git.rs`             | 分支读取/列举/切换、worktree 管理、工作区变更统计                                        |
| `files.rs`           | 项目内文件搜索与读取，供 `@` 提及与文件面板使用                                          |
| `external.rs`        | 探测已安装的编辑器，用 `open -a` 打开项目                                                |
| `agent_resources.rs` | 技能 / 扩展 / MCP / 指令文档的读写与校验                                                 |
| `memory.rs`          | 长期记忆的存储、索引与整理（`<agent>/memory`）                                           |
| `terminal.rs`        | 每个标签页一个真实 PTY（管道下 shell 检测不到 tty）                                      |
| `shells.rs`          | 可用 shell 枚举（Windows 上是 Git Bash / WSL）                                           |
| `browser.rs`         | 右侧面板的原生子 webview（`<iframe>` 会被 `frame-ancestors` 拦死）                       |
| `attachments.rs`     | 附件落盘与读取                                                                           |
| `computer_use.rs`    | 受控窗口预览、权限探测、帧流转发（Windows 版在 `computer_use_win*.rs`）                  |
| `win_console.rs`     | 让 Windows 上启动的控制台程序不弹窗（GUI 子系统自身没有控制台）                          |

## 桥接协议

- **命令**：`invoke('rpc_send', { slotId, channel, command })`，单条命令 60s 超时
  （`COMMAND_TIMEOUT_MS`），超时只拒绝该 Promise，不影响会话本身。
- **事件**：Rust 用 `pi://message`、`pi://stderr`、`pi://exit` 三条事件名转发；侧边聊天是
  `pi-side://*`。混用会让侧聊的回答灌进主会话。
- **槽位**：`rpc_start` 返回 `slotId`，后续命令都带着它；切换会话时旧进程会被 kill。
- **代次**：每次会话分配递增代号，reader 结束时比对代号，只有仍是当前代才上报退出——
  否则「主动切换」会被误报成「进程已退出」。

## 五个容易踩的坑

**1. JSONL 只认 LF。** pi 的 RPC 协议规定只以 `0x0A` 作记录分隔符。不能用通用行读取器：
Node 的 `readline` 会额外在 `U+2028` / `U+2029` 处断行，而这两个字符在 JSON 字符串内是合法内容，
会把一帧劈成两半。`rpc.rs` 手工按字节扫描 `0x0A`，单测覆盖 CRLF、`U+2028`、跨读取重组与 200KB 大帧。

**2. `message_update` 只给增量。** 它带的是 `{ type, contentIndex, delta }`，不是当前完整消息。
`store/chat/stream.ts` 按 `contentIndex` 自行累积，并用 `*_end` 事件携带的完整文本覆盖累积结果纠偏。
`contentIndex` 可能跳跃，中间用空文本块填补，避免数组出现 `undefined`。

**3. 会话目录名不可反解。** 存储路径是把 cwd 的 `/` 换成 `-`，该变换**有损**：
`--Users-haha-Desktop-xinlian-h5-live-streaming--` 的真实 cwd 是
`/Users/haha/Desktop/xinlian/h5-live-streaming`（两级目录）。所以 `sessions.rs` 从每个 `.jsonl`
首行的 header 读真实 `cwd`，绝不从目录名反推。

**4. 写配置要保留用户手写的内容。** `models.json` 允许用户手写 GUI 不认识的字段。
写入流程是：读原文件 → 合并 → 备份 `.bak` → 临时文件 → rename 原子落盘，并保持键顺序。

**5. macOS 上不要给主壳层加持久 `transform`。** `.shell` 上的 `scale()` 之类会创建持久合成层，
影响透明毛玻璃下原生红绿灯与 WebKit 的图层复位。

## 数据目录

```
~/.piazza/agent/
├── models.json          # provider / model，GUI 与手写共存
├── settings.json        # 主题、默认模型、压缩与重试、项目信任…
├── sessions/            # pi 原生 JSONL，按 cwd 变换后的目录名分桶
├── memory/              # 长期记忆（global/ 与按 cwd 哈希分的项目目录）
├── skills/              # 技能
├── extensions/          # 扩展
└── AGENTS.md            # 全局指令文档
```

`PIAZZA_DATA_DIR` 换根目录，`PIAZZA_MEMORY_DIR` 单独换记忆目录（测试用）。

## 测试

- **Rust**：`cargo test` 68 个单测，覆盖分帧、会话扫描与截断、配置合并、记忆存储、
  路径规范化、终端与 shell 探测等容易悄悄坏掉的部分。
- **前端**：`tsc --noEmit` + ESLint（零警告）挡类型与结构问题；行为验证走 `e2e/` 下的探针。
- **端到端探针**：在浏览器里跑真实前端，只把 Tauri 桥接层换成桩，回放的帧来自真实
  `pi --mode rpc` 抓包（`e2e/frames.jsonl`）。前提是 `npm run dev` 在 1420 端口跑着，
  再用 Playwright 的 `run_code` 指向具体文件。每个探针都对应一类「曾经真的出过事」的回归，
  例如用户消息重复渲染、发送失败后气泡凭空消失、错误信息原样甩出 JSON。
- **桩的信封**：`rpcClient.bindEvents` 从事件里取 `payload.payload` 与 `payload.slotId`，
  所以桩必须发 `{ slotId, payload }`。少了这层包装，命令能发出去，应答却永远到不了调用方，
  表现是「输入框按 Enter 没反应」——排查时先看这里。

## 发布

推一个 `v*` tag，`.github/workflows/release.yml` 在 macOS（universal）与 Windows 上并行构建，
`scripts/build-latest-json.mjs` 汇总成一份 `latest.json` 供自动更新读取。更新包签名需要
`TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 两个仓库 Secret。
