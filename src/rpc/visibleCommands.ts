import { rpcClient } from './client'
import type { CommandsData } from './types'

export const RESUME_COMMAND = 'piazza-resume-session'

export async function getVisibleCommands(): Promise<CommandsData> {
  const data = await rpcClient.send<CommandsData>({ type: 'get_commands' })
  return { commands: (data?.commands ?? []).filter((command) => command.name !== RESUME_COMMAND) }
}
