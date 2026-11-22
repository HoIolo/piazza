/*
 * 正文里的文件链接：渲染形态 + 右键菜单。
 *
 * ChatGPT 那条消息的原文是标准 markdown 链接 [Piazza.app](/Applications/Piazza.app)，
 * 不是靠纯文本自动识别。Codex 对「href 是本地路径」的链接做三件事：
 *   1. 蓝色文字 + 前置文件图标（我们已有）
 *   2. 右键菜单：打开文件 / 用…打开 / 复制路径 / 复制文件内容 / 在访达中显示
 *   3. 目录与文件区分（目录不该给「复制文件内容」）
 * 这个探针盯的就是后两件。
 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    window.__EVT__ = (frame) =>
      listeners['pi://message']?.({
        event: 'pi://message',
        payload: { slotId: 'default', payload: frame },
        id: 0,
      })
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
          setTimeout(
            () =>
              window.__EVT__({
                id: p.id,
                type: 'response',
                command: p.type,
                success: true,
                data: { sessionName: '链接', messages: [] },
              }),
            10,
          )
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
        if (cmd === 'path_kind') return { kind: args.path.endsWith('.app') ? 'dir' : 'file' }
        if (cmd === 'read_any_file') return '// 文件内容示例\n'
        if (cmd === 'list_external_apps')
          return [
            { name: '访达', path: '', icon: null },
            { name: 'Visual Studio Code', path: '/Applications/Visual Studio Code.app', icon: null },
          ]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        return null
      },
    }
  }

  await page.addInitScript(installBridge)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(600)
  }

  const input = page.locator('textarea').first()
  await input.fill('装好了吗')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)

  const TEXT = [
    '新版已安装到 [Piazza.app](/Applications/Piazza.app)，签名校验通过。',
    '',
    '[旧版备份](/Users/haha/Library/Caches/piazza-previous.t0ZNkm/Piazza.app)',
    '',
    '相对路径 [index.vue](src/pages/index/index.vue) 和 [router.ts](src/router.ts:12)。',
  ].join('\n')

  await page.evaluate((text) => {
    const asst = {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'anthropic-messages',
      provider: 'p',
      model: 'm',
      timestamp: 2,
      stopReason: 'stop',
    }
    window.__EVT__({ type: 'agent_start' })
    window.__EVT__({
      type: 'message_start',
      message: { role: 'user', content: '装好了吗', timestamp: 1 },
    })
    window.__EVT__({ type: 'message_end', message: { role: 'user', content: '装好了吗', timestamp: 1 } })
    window.__EVT__({ type: 'message_start', message: { ...asst, content: [] } })
    window.__EVT__({ type: 'message_end', message: asst })
    window.__EVT__({ type: 'agent_settled' })
  }, TEXT)
  await page.waitForTimeout(900)

  const links = await page.evaluate(() =>
    [...document.querySelectorAll('main a')].map((a) => ({
      文本: a.textContent,
      href: a.getAttribute('href'),
      有图标: Boolean(a.querySelector('svg')),
      颜色: getComputedStyle(a).color,
    })),
  )
  await page.screenshot({ path: 'e2e/.shots/file-link.png' })

  // 左键：项目内相对路径应当进应用内预览
  const relLink = page.getByRole('link', { name: /index\.vue/ }).first()
  await relLink.click()
  await page.waitForTimeout(500)
  const afterLeftClick = await page.evaluate(() => ({
    面板标签: [...document.querySelectorAll('header button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 6),
    预览路径: document.querySelector('[title*="index.vue"]')?.getAttribute('title') ?? null,
  }))
  await page.screenshot({ path: 'e2e/.shots/file-link-leftclick.png' })

  // 右键第一个文件链接
  const first = page.locator('main a').first()
  await first.click({ button: 'right' })
  await page.waitForTimeout(500)
  const menu = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('[role="menu"]')]
    return panels.map((p) => ({
      类名: p.className,
      位置: (() => {
        const r = p.getBoundingClientRect()
        return `${Math.round(r.left)},${Math.round(r.top)}`
      })(),
      项: [...p.querySelectorAll('[role="menuitem"]')].map((el) => el.innerText.trim()),
    }))
  })
  await page.screenshot({ path: 'e2e/.shots/file-link-menu.png' })

  // 文件（非目录）的菜单应当多出「复制文件内容」
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.getByRole('link', { name: /router\.ts/ }).first().click({ button: 'right' })
  await page.waitForTimeout(400)
  const fileMenu = await page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"]')]
      .map((p) => [...p.querySelectorAll('[role="menuitem"]')].map((el) => el.innerText.trim()))
      .at(-1),
  )
  await page.screenshot({ path: 'e2e/.shots/file-link-menu-file.png' })

  return JSON.stringify({ 链接: links, 左键: afterLeftClick, 目录菜单: menu, 文件菜单: fileMenu }, null, 2)
}
