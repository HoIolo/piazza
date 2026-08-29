/*
 * 扫光动画探针：让界面停在「流式进行中」，直接量 shimmer 的计算样式。
 *
 * 只截到 turn_start + message_start 就不再推帧，agent_settled 不发，
 * 于是 isStreaming 保持为真、ShimmerText 处于 active。
 */

async (page) => {
  const USER = { role: 'user', content: [{ type: 'text', text: '在跑' }], timestamp: 1787212028225 }
  const ASSISTANT = {
    role: 'assistant',
    content: [],
    api: 'anthropic-messages',
    provider: 'hub',
    model: 'm',
    timestamp: 1787212028260,
  }

  await page.addInitScript(
    ({ FRAMES }) => {
      const listeners = {}
      let seq = 1
      const emit = (event, payload) => listeners[event]?.({ event, payload, id: 0 })

      window.__TAURI_INTERNALS__ = {
        transformCallback(fn) {
          const id = seq++
          window[`_${id}`] = fn
          return id
        },
        async invoke(cmd, args) {
          if (cmd === 'plugin:event|listen') {
            listeners[args.event] = window[`_${args.handler}`]
            return seq++
          }
          if (cmd === 'rpc_send') {
            const p = args.payload
            if (p.type !== 'prompt') {
              setTimeout(
                () =>
                  emit('pi://message', {
                    id: p.id,
                    type: 'response',
                    command: p.type,
                    success: true,
                    data: { sessionName: '会话', messages: [] },
                  }),
                10,
              )
              return null
            }
            setTimeout(() => FRAMES.forEach((f) => emit('pi://message', f)), 30)
            return null
          }
          if (cmd === 'rpc_is_running') return true
          if (cmd === 'scan_sessions')
            return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
          if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
          if (cmd === 'read_models_config') return { providers: [] }
          if (cmd === 'read_app_settings') return {}
          if (cmd === 'read_git_diff' || cmd === 'read_git_diff_stat') return ''
          return null
        },
      }
    },
    {
      FRAMES: [
        { type: 'agent_start' },
        { type: 'turn_start' },
        { type: 'message_start', message: USER },
        { type: 'message_end', message: USER },
        { type: 'message_start', message: ASSISTANT },
      ],
    },
  )

  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(700)
  }
  const input = page.locator('textarea').first()
  await input.click()
  await input.fill('在跑')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)

  const probe = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-loading-anim="shimmer"]')
      if (!el) return { 找到: false, 页面: document.querySelector('main')?.innerText.slice(0, 120) }
      const s = getComputedStyle(el)
      return {
        找到: true,
        文字: el.textContent,
        动画名: s.animationName,
        周期: s.animationDuration,
        次数: s.animationIterationCount,
        播放状态: s.animationPlayState,
        背景位置: s.backgroundPosition,
        背景尺寸: s.backgroundSize,
        背景图: s.backgroundImage.slice(0, 40),
        减弱动效: matchMedia('(prefers-reduced-motion: reduce)').matches,
      }
    })

  const a = await probe()
  await page.waitForTimeout(600)
  const b = await probe()

  return { 第一次: a, 六百毫秒后的背景位置: b.背景位置, 位置是否变化: a.背景位置 !== b.背景位置 }
}
