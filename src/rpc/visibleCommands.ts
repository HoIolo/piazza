import { rpcClient } from './client'
import type { CommandsData } from './types'

export const RESUME_COMMAND = 'piazza-resume-session'
export const SYNC_CONTEXT_WINDOW_COMMAND = 'piazza-sync-context-window'

const HIDDEN_COMMANDS = new Set([RESUME_COMMAND, SYNC_CONTEXT_WINDOW_COMMAND])

export async function getVisibleCommands(): Promise<CommandsData> {
  const data = await rpcClient.send<CommandsData>({ type: 'get_commands' })
  return {
    commands: (data?.commands ?? []).filter((command) => !HIDDEN_COMMANDS.has(command.name)),
  }
}
