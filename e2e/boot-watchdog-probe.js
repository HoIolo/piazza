/*
 * 启动看门狗探针：让 rpc_start 永不返回，模拟「pi 起不来又不报错」。
 *
 * 这正是应用卡在骨架屏的形态：Promise 不落地，catch 和 finally 都不会执行。
 * 期望看门狗在 BOOT_TIMEOUT_MS 后把界面放出来，并给出原因与重连入口。
 *
 * 为了不真等 20 秒，这里改用 Playwright 的假时钟。
 */

async (page) => {
  await page.clock.install()

  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
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
        // 核心：永不落地
        if (cmd === 'rpc_start') return new Promise(() => {})
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
  })

  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.clock.runFor(2000)

  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.clock.runFor(500)
  }

  const state = () =>
    page.evaluate(() => {
      const main = document.querySelector('main')
      return {
        骨架屏: Boolean(main?.querySelector('[class*="skeleton" i]')),
        文案: main?.innerText.replace(/\n/g, ' / ').slice(0, 140),
      }
    })

  const 超时前 = await state()
  await page.clock.runFor(21_000)
  const 超时后 = await state()

  return { 超时前, 超时后 }
}
