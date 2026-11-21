import { join } from 'node:path'
import { resumeExtension } from './resume.mjs'
import { nameNewSession } from './title.mjs'
import { runAccounts } from './accounts.mjs'
import { parseArgs } from 'node:util'
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  ModelRuntime,
  runRpcMode,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'

// These helpers are shared with Pi's host. The bundled SDK version is locked.
const sdk = import.meta.resolve('@earendil-works/pi-coding-agent')
const { writeRawStdout } = await import(new URL('./core/output-guard.js', sdk))
const { builtInExtensions } = await import(new URL('./extensions/index.js', sdk))
const { applyHttpProxySettings, configureHttpDispatcher } = await import(new URL('./core/http-dispatcher.js', sdk))
const { resolveProjectTrusted } = await import(new URL('./core/project-trust.js', sdk))
const { createProjectTrustContext } = await import(new URL('./cli/project-trust.js', sdk))

const { values } = parseArgs({
  options: {
    accounts: { type: 'boolean' },
    provider: { type: 'string' },
    model: { type: 'string' },
    session: { type: 'string' },
    'no-session': { type: 'boolean' },
    extension: { type: 'string' },
    'auto-title': { type: 'boolean' },
  },
})

const cwd = process.cwd()
const agentDir = getAgentDir()
const trustStore = new ProjectTrustStore(agentDir)
const trustByCwd = new Map()
const bootstrapSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: false })
applyHttpProxySettings(bootstrapSettings.getGlobalSettings().httpProxy)
configureHttpDispatcher(bootstrapSettings.getHttpIdleTimeoutMs())

if (values.accounts) {
  const models = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    signal: AbortSignal.timeout(15_000),
  })
  await runAccounts(models, bootstrapSettings)
} else {
  await runSession()
}

async function runSession() {
  const sessionManager = values['no-session']
    ? SessionManager.inMemory(cwd)
    : values.session ? SessionManager.open(values.session) : SessionManager.create(cwd)

  const runtime = await createAgentSessionRuntime(async (input) => {
    const { cwd, sessionManager, sessionStartEvent, projectTrustContext } = input
    const hasProjectResources = hasTrustRequiringProjectResources(cwd)
    const rememberedTrust = trustByCwd.get(cwd)
    const settingsManager = SettingsManager.create(cwd, agentDir, {
      projectTrusted: rememberedTrust ?? (!hasProjectResources && (trustStore.get(cwd) ?? true)),
    })
    const diagnostics = []
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      settingsManager,
      modelRuntimeSignal: AbortSignal.timeout(15_000),
      resourceLoaderOptions: {
        packageCommandOutput: 'capture',
        extensionFactories: values['auto-title'] ? [...builtInExtensions, resumeExtension] : builtInExtensions,
        additionalExtensionPaths: values.extension ? [values.extension] : [],
      },
      resourceLoaderReloadOptions: hasProjectResources && rememberedTrust === undefined ? {
        resolveProjectTrust: async ({ extensionsResult }) => {
          const trusted = await resolveProjectTrusted({
            cwd,
            trustStore,
            defaultProjectTrust: bootstrapSettings.getDefaultProjectTrust(),
            extensionsResult,
            projectTrustContext: projectTrustContext ?? createProjectTrustContext({
              cwd, mode: 'rpc', hasUI: false, settingsManager: bootstrapSettings,
            }),
            onExtensionError: (message) => diagnostics.push({ type: 'warning', message }),
          })
          trustByCwd.set(cwd, trusted)
          return trusted
        },
      } : undefined,
    })
    const { modelRuntime, resourceLoader } = services
    const model = values.model
      ? values.provider
        ? modelRuntime.getModel(values.provider, values.model)
        : modelRuntime.getModels().find((model) => model.id === values.model)
      : undefined
    const created = await createAgentSessionFromServices({
      services, sessionManager, sessionStartEvent, model,
    })
    if (values['auto-title']) {
      nameNewSession(created.session, modelRuntime, () => runtime.session === created.session, (pending) => {
        writeRawStdout(JSON.stringify({ type: 'piazza_title_pending', pending }) + '\n')
      })
    }
    for (const { path, error } of resourceLoader.getExtensions().errors) {
      diagnostics.push({ type: 'error', message: `扩展加载失败 (${path}): ${error}` })
    }
    return { ...created, services, diagnostics: [...services.diagnostics, ...diagnostics] }
  }, { cwd: sessionManager.getCwd(), agentDir, sessionManager })

  for (const { message } of runtime.takeUnreportedDiagnostics()) console.error(message)
  await runRpcMode(runtime)
}
