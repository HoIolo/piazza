/*
 * 添加项目探针。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩。前提：vite dev 跑在 1420。
 * 跑法：playwright-cli run-code --filename=e2e/add-project-probe.js
 *
 * 盯的是：
 *   入口     —— 「项目」标题行右端有「+」，悬停才浮出来，没有会话时也还在
 *   添加     —— 选完目录就切过去，且目录记进 localStorage，重扫后不消失
 *   移除     —— 「从列表移除」要把手动添加的那条记忆一并清掉
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    const now = Date.now()
    let sessions = [
      {
        id: 's1',
        path: '/tmp/sessions/s1.jsonl',
        title: '一条会话',
        timestamp: '',
        modifiedMs: now - 60_000,
      },
    ]
    window.__E2E__ = { invoked: [], picked: ['/tmp/新项目/'] }
    const emit = (payload) => listeners['pi://message']?.({ event: 'pi://message', payload, id: 0 })

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
        if (cmd === 'plugin:dialog|open') return window.__E2E__.picked
        if (cmd === 'rpc_send') {
          const p = args.payload
          const data = { sessionName: '测试会话', sessionId: 'e2e', messages: [] }
          setTimeout(
            () => emit({ id: p.id, type: 'response', command: p.type, success: true, data }),
            10,
          )
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: now, sessions }]
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
  await page.evaluate(() => localStorage.removeItem('piazza.projectPrefs'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  const aside = page.locator('aside').first()
  const addButton = aside.getByLabel('添加项目')
  const projectNames = () =>
    aside.locator('[title^="/"]').evaluateAll((els) => els.map((el) => el.getAttribute('title')))
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('piazza.projectPrefs') ?? '{}'))
  const out = {}

  // ---- 入口存在，且默认不可见 ----
  out.entry = {
    count: await addButton.count(),
    opacityBeforeHover: await addButton.evaluate((el) => getComputedStyle(el).opacity),
  }
  await aside.getByText('项目', { exact: true }).hover()
  await page.waitForTimeout(200)
  out.entry.opacityAfterHover = await addButton.evaluate((el) => getComputedStyle(el).opacity)
  out.entry.projectsBefore = await projectNames()

  // ---- 点「+」：目录带尾斜杠也要归一化，选完直接切过去 ----
  await addButton.click()
  await page.waitForTimeout(500)
  out.afterAdd = {
    projects: await projectNames(),
    prefs: await prefs(),
    composerLabel: await page.locator('button', { hasText: '新项目' }).count(),
  }

  // ---- 重扫一次：手动添加的目录不该被扫描结果盖掉 ----
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  out.afterReload = await projectNames()

  // ---- ⌘O 也能触发选择器 ----
  const before = await page.evaluate(() => window.__E2E__.invoked.length)
  await page.keyboard.press('Meta+o')
  await page.waitForTimeout(400)
  out.hotkey = {
    dialogOpened: await page.evaluate(
      (n) => window.__E2E__.invoked.slice(n).includes('plugin:dialog|open'),
      before,
    ),
  }

  // ---- 从列表移除：记忆一并清掉 ----
  const row = aside.locator('[title="/tmp/新项目"]')
  await row.hover()
  await row.getByLabel('项目菜单').click()
  await page.getByRole('menuitem', { name: '从列表移除' }).click()
  await page.waitForTimeout(300)
  out.afterRemove = { projects: await projectNames(), prefs: await prefs() }

  await page.screenshot({ path: 'e2e/.shots/add-project.png' })
  return JSON.stringify(out, null, 2)
}
