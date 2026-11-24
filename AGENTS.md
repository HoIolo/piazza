# Piazza 开发与交互规范

本文件约束对 Piazza（React + TypeScript + Tauri）仓库的所有修改。

## 1. 交互与动效规范（Motion & Transitions）

1. **禁止硬切显隐**：所有浮层、悬浮预览窗、面板、抽屉、弹窗、折叠与展开区域在打开/关闭、展开/收起、状态切换时，必须带平滑过渡动效。
   - 对浮层与抽屉类容器，优先保持挂载并通过 `data-open="true" | "false"` 驱动 `opacity`、`transform` 与延迟 `visibility`（参考 `src/app/App.module.css` 的 `.settingsLayer` 与 `src/features/computerUse/ComputerUsePreview.module.css`）。
   - 展开/收起列表与堆叠态切换时，需同时处理容器尺寸过渡与子项入场过渡，不能在点击后瞬间闪现或硬跳高度。
2. **统一复用设计令牌**：动效时间与缓动曲线一律引用 `src/design/tokens.css` 中的变量，禁止在业务 CSS 里散落硬编码时长或曲线：
   - 时长：`--dur-fast`（`120ms`）、`--dur-base`（`180ms`）、`--dur-slow`（`280ms`）
   - 曲线：`--ease`（`cubic-bezier(0.32, 0.72, 0, 1)`）、`--ease-out`（`cubic-bezier(0.16, 1, 0.3, 1)`）
3. **只动画合成属性与拖拽豁免**：
   - 优先使用 `transform` 和 `opacity`；拖拽交互期间（如 `data-dragging="true"`）必须显式关闭位移动画（`transition: none`），防止指针跟手滞后。
   - **macOS 毛玻璃窗口禁忌**：主壳层 `.shell` 禁止添加会创建持久化合成层的 `transform`（如 `scale()`），以免影响透明毛玻璃下原生红绿灯与 WebKit 图层复位。
4. **滚动区卡片样式克制**：
   - 滚动容器内的卡片必须设置 `flex-shrink: 0`、透明容器背景（`background: transparent`）与轻边界阴影（如 `--shadow-surface`），避免在 `overflow-y: auto` 中被压缩或被裁出灰底边缘。
   - 浮窗展开高度必须相对当前 `top` 位置按 `100vh` 动态约束（`max-height`），多卡片超出时在内部滚动，禁止溢出窗口可视区。
5. **无障碍降级**：所有新增动画与过渡都应在 CSS 中配合 `@media (prefers-reduced-motion: reduce)` 关闭 `animation` 和 `transition`。

## 2. 视觉与样式规范

- 禁止在组件 CSS 中硬编码色值、圆角或间距，统一引用 `src/design/tokens.css` 变量，保证浅色/深色主题同步切换。
- 浮窗层级需避开与输入框（`z-index: 50`）、窗口控制按钮（`60`）、命令面板/对话框（`100`）、右键菜单/气泡（`200+`）冲突。

## 3. 代码结构与 ESLint 红线（见 `eslint.config.js`）

- 单文件代码行数上限 `max-lines: 150`（不含空行与注释）。
- 单函数行数上限：`.ts` 文件 ≤ `50` 行，`.tsx` 文件 ≤ `100` 行；圈复杂度 `complexity <= 10`。
- 禁止使用 `any`；纯类型导入必须使用 `import type`。
- `src/features/*` 之间禁止互相 import；共用逻辑上提到 `src/shared/` 或 `src/store/`，仅在 `src/app/` 做组装。

## 4. 校验命令

每次修改后按涉及范围执行：
- 前端：`npm run typecheck && npm run lint`
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml`
- 打包验证：`APPLE_SIGNING_IDENTITY="$(sh scripts/sign-identity.sh)" npm run tauri build -- --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'`
