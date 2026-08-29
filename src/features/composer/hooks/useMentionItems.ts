import { useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { CommandsData, PiCommand } from '@/rpc/types'
import { searchProjectFiles, type FileHit } from '@/shared/api/files'
import { useProjectsStore } from '@/store/projects.store'
import { useChatStore } from '@/store/chat'
import type { ProjectGroup } from '@/shared/api/sessions'

/** 提及候选项。三类来源共用一种形状，列表渲染才不必分支 */
export interface MentionItem {
  id: string
  kind: 'file' | 'skill' | 'session'
  label: string
  /** 右侧灰色说明：文件的目录、技能的描述、会话所属项目 */
  hint?: string
  /** 选中后插入输入框的文本 */
  insert: string
}

function commandToItem(command: PiCommand): MentionItem {
  return {
    id: `cmd:${command.name}`,
    kind: 'skill',
    label: `/${command.name}`,
    hint: command.description,
    insert: `/${command.name}`,
  }
}

function fileToItem(hit: FileHit): MentionItem {
  return {
    id: `file:${hit.path}`,
    kind: 'file',
    label: hit.name,
    hint: hit.dir,
    insert: hit.path,
  }
}

/** 技能与提示词按名称或描述过滤 */
function filterSkills(commands: PiCommand[], keyword: string): MentionItem[] {
  const match = (text: string) => text.toLowerCase().includes(keyword)
  return commands
    .filter((c) => !keyword || match(c.name) || match(c.description ?? ''))
    .slice(0, 8)
    .map(commandToItem)
}

/** 会话只在有关键词时参与，否则会把面板占满 */
function filterSessions(projects: ProjectGroup[], keyword: string): MentionItem[] {
  if (!keyword) return []
  return projects
    .flatMap((project) =>
      project.sessions.map((session) => ({
        id: `session:${session.path}`,
        kind: 'session' as const,
        label: session.title,
        hint: project.name,
        insert: session.title,
      })),
    )
    .filter((item) => item.label.toLowerCase().includes(keyword))
    .slice(0, 5)
}

/**
 * 提及候选。
 *
 * 文件随关键词实时向 Rust 侧查询；技能与会话量小，一次取回后在前端过滤——
 * 每敲一个字都往返一次 RPC 并不值得。
 */
export function useMentionItems(cwd: string | null, query: string) {
  const [files, setFiles] = useState<FileHit[]>([])
  const [commands, setCommands] = useState<PiCommand[]>([])
  const projects = useProjectsStore((s) => s.projects)
  // 会话就绪才去问 pi 要命令列表，否则命令发不出去、白等一次超时
  const sessionId = useChatStore((s) => s.session?.sessionId ?? null)

  useEffect(() => {
    let cancelled = false
    const task = cwd ? searchProjectFiles(cwd, query) : Promise.resolve([])
    task
      .then((hits) => {
        if (!cancelled) setFiles(hits)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [cwd, query])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    rpcClient
      .send<CommandsData>({ type: 'get_commands' })
      .then((data) => {
        if (!cancelled) setCommands(data.commands ?? [])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const keyword = query.trim().toLowerCase()

  return {
    files: files.map(fileToItem),
    skills: filterSkills(commands, keyword),
    sessions: filterSessions(projects, keyword),
  }
}
