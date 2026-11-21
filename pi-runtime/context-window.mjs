export const SYNC_CONTEXT_WINDOW_COMMAND = 'piazza-sync-context-window'

function readSavedContextWindow(settingsManager, model) {
  if (!model) return undefined
  const map = settingsManager.getSettings()?.modelContextWindows
  if (typeof map !== 'object' || map === null) return undefined
  const saved = map[`${model.provider}/${model.id}`]
  return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : undefined
}

/** Apply the per-model context window saved in settings.json to the live session model. */
export function applySavedContextWindow(session, settingsManager) {
  const model = session?.model
  const saved = readSavedContextWindow(settingsManager, model)
  if (!saved || model.contextWindow === saved) return
  session.agent.state.model = { ...model, contextWindow: saved }
}

/**
 * Keep the live Pi session's model contextWindow and compaction thresholds in sync with
 * Piazza's settings.json without restarting the worker process.
 */
export function createContextWindowExtension({ getSession, settingsManager }) {
  const sync = async () => {
    await settingsManager.reload()
    applySavedContextWindow(getSession(), settingsManager)
  }

  return function contextWindowExtension(pi) {
    pi.registerCommand(SYNC_CONTEXT_WINDOW_COMMAND, {
      description: 'Sync saved context window and compaction settings',
      handler: async () => {
        await sync()
      },
    })

    pi.on('model_select', () => {
      applySavedContextWindow(getSession(), settingsManager)
    })

    pi.on('input', async () => {
      try {
        await sync()
      } catch {
        // Disk reload errors should never block user prompt submission.
      }
      return { action: 'continue' }
    })
  }
}
