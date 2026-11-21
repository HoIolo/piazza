/*
 * 图片查看器探针。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩。前提：vite dev 跑在 1420。
 * 跑法：playwright-cli run-code --filename=e2e/image-lightbox-probe.js
 *
 * 盯的是：
 *   打开   —— 点缩略图出现遮罩；遮罩半透明、图片从 scale(.96) 弹到 1
 *   滚轮   —— 缩放跟着滚轮走，且以光标为原点（不是图片中心）
 *   拖拽   —— 放大后能拖，拖完不误触关闭
 *   百分比 —— 按真实像素比显示；点档位能落到那个比例
 *   关闭   —— Esc / 按钮都能关，且先播完反向动画
 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    const now = Date.now()
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#4a7"/><circle cx="800" cy="600" r="420" fill="#fff"/><rect x="40" y="40" width="120" height="120" fill="#c33"/></svg>'
    const image = { data: btoa(svg), mimeType: 'image/svg+xml' }
    window.__E2E__ = { invoked: [], image }
    // 客户端从 payload.payload 取帧、payload.slotId 取槽位，桩要照着真实事件包一层
    const emit = (frame) =>
      listeners['pi://message']?.({
        event: 'pi://message',
        id: 0,
        payload: { slotId: 'default', payload: frame },
      })

    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(fn) {
        const id = seq++
        window[`_${id}`] = fn
        return id
      },
      async invoke(cmd, args) {
        window.__E2E__.invoked.push(cmd)
        if (cmd === 'plugin:event|listen') {
          listeners[args.event] = window[`_${args.handler}`]
          return seq++
        }
        if (cmd === 'rpc_send') {
          const p = args.payload
          const data = { sessionName: 's1', sessionId: 'e2e', messages: [] }
          setTimeout(() => {
            if (p.id) emit({ id: p.id, type: 'response', command: p.type, success: true, data })
            if (p.type !== 'prompt') return
            const user = {
              role: 'user',
              content: [{ type: 'text', text: '看这张图' }],
              timestamp: now,
            }
            const reply = {
              role: 'assistant',
              content: [
                { type: 'text', text: '好的，图在这里。' },
                { type: 'image', ...window.__E2E__.image },
              ],
              api: 'anthropic-messages',
              provider: 'hub',
              model: 'm',
              stopReason: 'stop',
              timestamp: now + 1,
            }
            ;[
              { type: 'agent_start' },
              { type: 'message_start', message: user },
              { type: 'message_end', message: user },
              { type: 'message_start', message: { ...reply, content: [] } },
              { type: 'message_end', message: reply },
              { type: 'agent_end' },
            ].forEach(emit)
          }, 10)
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [
            {
              cwd: '/tmp/e2e',
              name: 'e2e',
              latestMs: now,
              sessions: [
                { id: 's1', path: '/tmp/sessions/s1.jsonl', title: '看这张图', timestamp: '', modifiedMs: now },
              ],
            },
          ]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        if (cmd === 'read_git_diff' || cmd === 'read_git_diff_stat') return ''
        return null
      },
    }
  }

  await page.addInitScript(installBridge)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)

  const out = {}
  const overlay = page.locator('[aria-label^="图片预览"]')
  const thumb = page.locator('button[aria-label^="查看图片"]').first()

  /*
   * 会话不会自动恢复，缩略图得自己造出来：发一条消息，让桩返回带图的回答，
   * 这样图片走的是真实的消息渲染链路（Markdown → ImagePreview），不是硬插的 DOM。
   */
  await page.locator('textarea').first().fill('看这张图')
  await page.keyboard.press('Enter')
  for (let i = 0; i < 30 && !(await thumb.count()); i += 1) {
    await page.waitForTimeout(300)
  }

  out.thumb = await thumb.count()
  if (!out.thumb) {
    out.html = (await page.locator('body').innerText()).slice(0, 600)
    return JSON.stringify(out, null, 2)
  }

  // ---- 打开：遮罩半透明 + 有入场动画 ----
  // 缩略图在消息流里可能被滚动容器挡着，直接派发点击比 locator 点击稳
  await page.evaluate(() => document.querySelector('button[aria-label^="查看图片"]').click())
  await page.waitForTimeout(60)
  out.opened = {
    overlay: await overlay.count(),
    animation: await overlay.locator('img').first().evaluate((el) => ({
      overlay: getComputedStyle(el.closest('[aria-label^="图片预览"]')).animationName,
      stage: getComputedStyle(el.parentElement).animationName,
    })),
    layout: await overlay.evaluate((el) => {
      const stage = el.querySelector('img').parentElement
      return {
        stageW: Math.round(stage.clientWidth),
        stageH: Math.round(stage.clientHeight),
      }
    }),
    backdrop: await overlay.evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      blur: getComputedStyle(el).backdropFilter,
    })),
  }
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'e2e/.shots/lightbox-open.png' })

  const img = overlay.locator('img').first()
  const zoomLabel = () =>
    page.evaluate(() => {
      const btn = document.querySelector('[role="dialog"] button[aria-label^="缩放比例"]')
      return btn ? btn.innerText.trim() : null
    })
  out.zoomAtOpen = await zoomLabel()
  out.fitSize = await img.evaluate((el) => ({ w: Math.round(el.width), h: Math.round(el.height) }))

  // ---- 滚轮放大：以光标为原点，缩放后滚动位置应该偏移 ----
  // 舞台的滚动量用 evaluate 直接读，locator 层级在 portal 下不好写
  const stageBox = () =>
    page.evaluate(() => {
      const img = document.querySelector('[role="dialog"] img')
      if (!img) return { x: 0, y: 0, width: 0, height: 0 }
      const r = img.parentElement.getBoundingClientRect()
      return { x: r.left, y: r.top, width: r.width, height: r.height }
    })
  const scrollOf = () =>
    page.evaluate(() => {
      const img = document.querySelector('[role="dialog"] img')
      if (!img) return { left: 0, top: 0 }
      const stage = img.parentElement
      return { left: Math.round(stage.scrollLeft), top: Math.round(stage.scrollTop) }
    })
  const box = await stageBox()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(200)
  out.afterWheel = {
    zoom: await zoomLabel(),
    size: await img.evaluate((el) => ({ w: Math.round(el.width), h: Math.round(el.height) })),
    scroll: await scrollOf(),
  }
  await page.screenshot({ path: 'e2e/.shots/lightbox-zoomed.png' })

  // ---- 拖拽平移 ----
  const before = (await scrollOf()).left
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  out.afterDrag = {
    scrollLeftMoved: (await scrollOf()).left !== before,
    stillOpen: await overlay.count(),
  }

  // ---- 百分比下拉：点 100% 落到原始像素 ----
  await page.evaluate(() =>
    document.querySelector('[aria-label^="图片预览"] button[aria-label^="缩放比例"]').click(),
  )
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'e2e/.shots/lightbox-menu.png' })
  await page.getByRole('menuitem', { name: '100%', exact: true }).click()
  await page.waitForTimeout(250)
  out.atActualSize = {
    zoom: await zoomLabel(),
    size: await img.evaluate((el) => ({ w: Math.round(el.width), h: Math.round(el.height) })),
  }

  // ---- 关闭：先播反向动画再卸载 ----
  await page.evaluate(() =>
    document.querySelector('button[aria-label="关闭图片预览"]').click(),
  )
  await page.waitForTimeout(30)
  out.closing = {
    stillMounted: await overlay.count(),
    closingFlag: await overlay.evaluate((el) => el.dataset.closing),
  }
  await page.waitForTimeout(400)
  out.afterClose = await overlay.count()

  return JSON.stringify(out, null, 2)
}
