import { useEffect, useState } from 'react'
import type { PiCommand } from '@/rpc/types'
import { searchProjectFiles, type FileHit } from '@/shared/api/files'
import { useProjectsStore } from '@/store/projects.store'
import { usePiCommands } from './usePiCommands'
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

/** 输入停顿多久才真的去搜文件 */
const SEARCH_DEBOUNCE_MS = 120

/**
 * 提及候选。
 *
 * 文件随关键词向 Rust 侧查询；技能与会话量小，一次取回后在前端过滤——
 * 每敲一个字都往返一次 RPC 并不值得。
 *
 * 查询要防抖：Rust 侧是一次全项目遍历（3 万条上限），实测本项目里
 * 空查询 28ms、带关键词 5ms，听起来不多，但它是**同步命令**，
 * 每敲一个字都排一次队，连着打字就会明显顿。120ms 停顿足够覆盖正常输入节奏。
 *
 * 面板关着时一律不查：`query` 那时是空串，查了也没人看，
 * 却会在每次编辑时白白跑一次全项目扫描。
 */
export function useMentionItems(cwd: string | null, query: string, enabled: boolean) {
  const [files, setFiles] = useState<FileHit[]>([])
  const commands = usePiCommands()
  const projects = useProjectsStore((s) => s.projects)

  useEffect(() => {
    if (!enabled || !cwd) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchProjectFiles(cwd, query)
        .then((hits) => {
          if (!cancelled) setFiles(hits)
        })
        .catch(() => undefined)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cwd, query, enabled])

  const keyword = query.trim().toLowerCase()
  // 面板关着时不展示旧结果：下次打开应当从当前关键词重新搜，而不是先闪一屏上次的
  const visible = enabled ? files : []

  return {
    files: visible.map(fileToItem),
    commands,
    skills: filterSkills(commands, keyword),
    sessions: filterSessions(projects, keyword),
  }
}
