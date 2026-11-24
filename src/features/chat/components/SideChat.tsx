import { useEffect, useMemo, useRef, useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { useElapsed } from '@/shared/hooks/useElapsed'
import { useAppStore } from '@/store/app.store'
import type { ChatSnapshot } from '@/store/chat/types'
import { DialogCard } from './DialogCard'
import { ExchangeGroup } from './ExchangeGroup'
import { SideComposer } from './SideComposer'
import { groupIntoExchanges } from './exchange'
import { useSideChatSession } from './useSideChatSession'
import styles from './SideChat.module.css'

/**
 * 侧边聊天的消息区。
 *
 * 刻意和主会话走同一条渲染链路（`groupIntoExchanges` → `ExchangeGroup`），
 * 而不是直接铺 `AssistantMessage`：那个组件只画消息正文，状态行
 * （「正在思考」/「处理中 12s」）、过程区、工具分组、文件改动都在
 * `ExchangeGroup` 里。自己拼一遍就会像另一个产品。
 */
function SideTranscript({ cwd, snapshot }: { cwd: string; snapshot: ChatSnapshot }) {
  const { messages, streaming, tools, isStreaming, isCompacting, paused, turnStartedAt } = snapshot
  const feed = useRef<HTMLDivElement>(null)
  const follow = useRef(true)

  const exchanges = useMemo(
    () => groupIntoExchanges(streaming ? [...messages, streaming] : messages),
    [messages, streaming],
  )
  const elapsedMs = useElapsed(isStreaming || isCompacting ? turnStartedAt : null)

  useEffect(() => {
    const el = feed.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [messages, streaming, tools])

  const empty = messages.length === 0 && !streaming

  return (
    <div
      className={styles.feed}
      data-empty={empty}
      ref={feed}
      onScroll={(event) => {
        const el = event.currentTarget
        if (el.clientHeight) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      }}
    >
      {empty && (
        <div className={styles.welcome}>
          <MessagesSquare size={24} className={styles.welcomeIcon} />
          <h2>侧边聊天</h2>
          <p>可以在这里追问，消息会保留在这个标签里。</p>
        </div>
      )}
      {exchanges.map((exchange, index) => {
        const isLast = index === exchanges.length - 1
        return (
          <ExchangeGroup
            key={index}
            exchange={exchange}
            tools={tools}
            cwd={cwd}
            active={isStreaming && isLast}
            compacting={isCompacting && isLast}
            paused={paused && isLast}
            /* 侧边聊天的消息不属于主会话，不能在这里编辑或分叉出去 */
            disabled
            forkable={false}
            elapsedMs={isLast ? elapsedMs : null}
            finishedMs={
              !isStreaming && !isCompacting && isLast ? snapshot.lastTurnDurationMs : null
            }
          />
        )
      })}
    </div>
  )
}

function SideSession({ cwd, tabId, retry }: { cwd: string; tabId?: string; retry: () => void }) {
  const slotId = tabId ?? 'default'
  const { snapshot, session, status, error, send, sendPrompt, answer, modelController } =
    useSideChatSession(cwd, slotId, retry)
  const { pendingDialog, isStreaming } = snapshot
  const setTabContent = useAppStore((s) => s.setPanelTabContent)
  const hasContent = snapshot.messages.length > 0 || snapshot.streaming !== null

  // 上报「这个标签关掉会丢东西」，面板据此决定关标签前要不要确认
  useEffect(() => {
    if (tabId) setTabContent(tabId, hasContent)
  }, [tabId, hasContent, setTabContent])

  return (
    <div className={styles.chat}>
      {/*
       * 不画标题条：面板顶部已有「侧边聊天」标签，再挂一行项目名只是重复。
       * Codex 的侧边聊天也是从标签直接进消息区。
       */}
      <SideTranscript cwd={cwd} snapshot={snapshot} />
      <div className={styles.controls}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {status === 'disconnected' && (
          <button type="button" className={styles.retry} onClick={retry}>
            重新连接
          </button>
        )}
        {status === 'ready' && pendingDialog && (
          <DialogCard
            key={pendingDialog.id}
            dialog={pendingDialog}
            onAnswer={(payload) => void answer(pendingDialog.id, payload)}
          />
        )}
        <SideComposer
          blocked={status !== 'ready' || !!pendingDialog}
          running={status === 'ready' && isStreaming}
          session={session}
          modelController={modelController}
          onSend={(message, images, behavior) => sendPrompt(message, images, behavior)}
          onStop={() => send({ type: 'abort' })}
        />
      </div>
    </div>
  )
}

export function SideChat({ tabId }: { tabId?: string }) {
  const cwd = useAppStore((s) => s.currentCwd)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((n) => n + 1)

  if (!cwd) return <p className={styles.empty}>请选择项目后开始侧边聊天。</p>
  return (
    <div className={styles.root}>
      <SideSession key={`${cwd}\0${attempt}`} cwd={cwd} tabId={tabId} retry={retry} />
    </div>
  )
}
