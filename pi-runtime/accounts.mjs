import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'

export async function runAccounts(models, settings) {
  const output = (frame) => process.stdout.write(JSON.stringify(frame) + '\n')
  let active

  async function list() {
    const stored = new Map((await models.listCredentials()).map((entry) => [entry.providerId, entry.type]))
    return models.getProviders().flatMap(({ id, name, auth }) => {
      const methods = []
      if (auth.oauth) methods.push({
        type: 'oauth', label: auth.oauth.loginLabel ?? auth.oauth.name, subscription: !!auth.oauth.isSubscription,
      })
      if (auth.apiKey?.login) methods.push({ type: 'api_key', label: auth.apiKey.name ?? 'API Key' })
      return methods.length ? [{ id, name, methods, stored: stored.get(id) }] : []
    })
  }

  async function login({ provider, method }) {
    if (active) throw new Error('已有授权正在进行')
    const auth = models.getProvider(provider)?.auth
    if (!(method === 'oauth' && auth?.oauth) && !(method === 'api_key' && auth?.apiKey?.login)) {
      throw new Error('此服务商不支持所选授权方式')
    }

    const controller = new AbortController()
    const flow = { controller, prompt: null }
    active = flow
    try {
      await models.login(provider, method, {
        signal: controller.signal,
        notify: (notice) => output({ type: 'account_notice', notice }),
        prompt: ({ signal = controller.signal, ...prompt }) => new Promise((resolve, reject) => {
          const id = randomUUID()
          const cancel = () => finish(() => reject(signal.reason))
          const finish = (settle) => {
            signal.removeEventListener('abort', cancel)
            flow.prompt = null
            output({ type: 'account_prompt_closed', id })
            settle()
          }
          if (signal.aborted) return reject(signal.reason)
          flow.prompt = { id, answer: (value) => finish(() => resolve(value)) }
          signal.addEventListener('abort', cancel, { once: true })
          output({ type: 'account_prompt', id, prompt })
        }),
      }, { getDeviceId: () => settings.getOrCreateDeviceId(), agentName: 'Piazza' })
      return list()
    } finally {
      controller.abort()
      active = undefined
    }
  }

  async function dispatch(command) {
    const { id, type } = command
    try {
      let data
      if (type === 'list_accounts') data = await list()
      else if (type === 'account_login') data = await login(command)
      else if (type === 'account_answer') {
        if (active?.prompt?.id === id && typeof command.value === 'string') active.prompt.answer(command.value)
        return
      } else if (type === 'account_cancel') {
        active?.controller.abort()
        return
      } else if (type === 'account_logout') {
        if (active) throw new Error('已有授权正在进行')
        await models.logout(command.provider)
        data = await list()
      } else throw new Error('未知的账号命令')
      output({ type: 'response', id, command: type, success: true, data })
    } catch (error) {
      output({ type: 'response', id, command: type, success: false, error: error.message })
    }
  }

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of lines) {
    try {
      void dispatch(JSON.parse(line))
    } catch {
      // Malformed input is not an account request.
    }
  }
  active?.controller.abort()
}
