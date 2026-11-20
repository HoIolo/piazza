/*
 * 侧栏与顶栏探针。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩。前提：vite dev 跑在 1420。
 * 跑法：Playwright run_code 指向本文件。
 *
 * 盯的是：
 *   会话行操作 —— 悬停出「…」，置顶后排到最前，删除要点两次才调 trash_session
 *   侧栏开合   —— ⌘B 收起后顶栏出现展开按钮，再点能回来
 *   外壳分层   —— 侧栏本身透明，主区铺实色
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    const now = Date.now()
    const session = (n, title, agoMin) => ({
      id: `s${n}`,
      path: `/tmp/sessions/s${n}.jsonl`,
      title,
      timestamp: '',
      modifiedMs: now - agoMin * 60_000,
    })
    let sessions = [
      session(1, '修复登录页的表单校验', 3),
      session(2, '给订单列表加分页和筛选条件，顺便把接口改成游标', 200),
      session(3, '梳理构建脚本', 60 * 24 * 9),
    ]
    window.__E2E__ = { invoked: [] }
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
        if (cmd === 'rpc_send') {
          const p = args.payload
          const data = { sessionName: '测试会话', sessionId: 'e2e', messages: [] }
          setTimeout(() => emit({ id: p.id, type: 'response', command: p.type, success: true, data }), 10)
          return null
        }
        if (cmd === 'trash_session') {
          sessions = sessions.filter((s) => s.path !== args.path)
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
  const rows = aside.locator('[data-session-path]')
  const titles = () => rows.evaluateAll((els) => els.map((el) => el.getAttribute('title')))
  const trashCalls = () =>
    page.evaluate(() => window.__E2E__.invoked.filter((c) => c === 'trash_session').length)
  const bg = (locator) => locator.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const out = {}

  out.layers = { sidebar: await bg(aside), main: await bg(page.locator('main').locator('..')) }
  out.sidebarWidth = await aside.evaluate((el) => el.getBoundingClientRect().width)
  out.titlebarHeight = await page.locator('main header').evaluate((el) => el.getBoundingClientRect().height)
  out.initialOrder = await titles()
  out.rowStyle = await rows.first().evaluate((el) => ({
    height: el.getBoundingClientRect().height,
    fontSize: getComputedStyle(el).fontSize,
    selectedEdge: getComputedStyle(el).boxShadow,
  }))

  // ---- 置顶第三条 ----
  await rows.nth(2).hover()
  await page.screenshot({ path: 'e2e/.shots/sidebar-hover.png' })
  await rows.nth(2).getByLabel('会话菜单').click()
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'e2e/.shots/sidebar-menu.png' })
  await page.getByRole('menuitem', { name: '置顶对话' }).click()
  await page.waitForTimeout(200)
  out.orderAfterPin = await titles()

  // ---- 删除第二条：第一次只确认 ----
  await rows.nth(1).hover()
  await rows.nth(1).getByLabel('会话菜单').click()
  await page.getByRole('menuitem', { name: '删除对话' }).click()
  await page.waitForTimeout(150)
  out.afterFirstDeleteClick = { trash: await trashCalls(), rows: await rows.count() }
  await page.getByRole('menuitem', { name: /确认删除/ }).click()
  await page.waitForTimeout(500)
  out.afterConfirm = { trash: await trashCalls(), rows: await rows.count() }

  // ---- 侧栏开合 ----
  await page.mouse.move(700, 400)
  await page.keyboard.press('Meta+b')
  await page.waitForTimeout(500)
  out.collapsed = {
    asideRight: await aside.evaluate((el) => Math.round(el.getBoundingClientRect().right)),
    expandButton: await page.getByLabel('展开侧栏').count(),
  }
  await page.screenshot({ path: 'e2e/.shots/sidebar-collapsed.png' })
  await page.getByLabel('展开侧栏').click()
  await page.waitForTimeout(500)
  out.expandedAgain = await aside.evaluate((el) => Math.round(el.getBoundingClientRect().right))

  return JSON.stringify(out, null, 2)
}
