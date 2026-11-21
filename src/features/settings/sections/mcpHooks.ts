import { useEffect } from 'react'
import { getAgentDir, readMcpConfig, type McpServerEntry } from '@/shared/api/agentResources'
import { errorMessage } from '@/shared/utils/error'

/** 读 mcp.json 与 agent 目录。抽出来只是为了让组件本体短一截 */
export function useMcpLoad(
  setServers: (v: Record<string, McpServerEntry>) => void,
  setError: (v: string | null) => void,
  setLoading: (v: boolean) => void,
) {
  useEffect(() => {
    let cancelled = false
    readMcpConfig()
      .then((cfg) => {
        if (!cancelled) setServers(cfg.mcpServers ?? {})
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [setServers, setError, setLoading])
}

export function useAgentDirInto(setAgentDir: (v: string) => void) {
  useEffect(() => {
    let cancelled = false
    void getAgentDir()
      .then((dir) => {
        if (!cancelled) setAgentDir(dir)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [setAgentDir])
}
