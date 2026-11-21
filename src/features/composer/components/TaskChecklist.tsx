import { useMemo, useRef, useState } from 'react'
import { Circle, CircleCheck, LoaderCircle } from 'lucide-react'
import { useScrollEdges } from '@/shared/hooks/useScrollEdges'
import { useChatStore, type ChatMessage } from '@/store/chat'
import styles from './TaskChecklist.module.css'

function latestChecklist(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (
      message.role !== 'toolResult' ||
      message.isError ||
      !['todo', 'piazza_update_plan'].includes(message.toolName)
    )
      continue

    const todos = message.details?.todos
    if (!Array.isArray(todos)) continue
    return todos.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string') {
        return []
      }
      const status = 'status' in item ? item.status : undefined
      return [
        {
          text: item.text,
          done: status === 'completed' || ('done' in item && item.done === true),
          active: status === 'in_progress',
        },
      ]
    })
  }
  return []
}

/*
 * 三个状态都是小圆圈（对齐 Codex 的 todo 块）：空心圆＝待办，
 * 转圈＝进行中，圆里打勾＝已完成。不用裸的对勾，
 * 它和旁边的圆圈重量不一致，看着像两种东西。
 */
const MARKS = { done: CircleCheck, active: LoaderCircle, pending: Circle }

const RING_RADIUS = 5.5
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/** 左边那枚环形进度：走完一圈即全部完成，做完转绿 */
function ProgressRing({ ratio, complete }: { ratio: number; complete: boolean }) {
  return (
    <svg className={styles.ring} viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle className={styles.ringTrack} cx="7" cy="7" r={RING_RADIUS} />
      <circle
        className={styles.ringFill}
        data-complete={complete}
        cx="7"
        cy="7"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
      />
    </svg>
  )
}

/**
 * 待办清单。占位只有居中的一行「环 + 已完成 3 个任务，共 5 个」，
 * 鼠标扫过（或键盘聚焦）才浮出明细。
 *
 * 明细限高滚动：它挂在输入框正上方，铺开会把聊天区和打字区一起顶走。
 */
export function TaskChecklist() {
  const messages = useChatStore((s) => s.messages)
  const todos = useMemo(() => latestChecklist(messages), [messages])
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(listRef, open)

  if (!todos.length) return null

  const done = todos.filter((todo) => todo.done).length
  const total = todos.length
  const summary =
    done === 0 ? `已创建包含 ${total} 个任务的待办清单` : `已完成 ${done} 个任务，共 ${total} 个`

  return (
    <div className={styles.checklist}>
      <div
        className={styles.wrap}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          // 焦点在浮层内换行不算离开，否则一点清单就收起来
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <button
          type="button"
          className={styles.summary}
          aria-expanded={open}
          aria-label={`${summary}，悬停查看明细`}
          onClick={() => setOpen((value) => !value)}
        >
          <ProgressRing ratio={done / total} complete={done === total} />
          <span className={styles.summaryText}>{summary}</span>
        </button>

        {open && (
          <div className={styles.panel}>
            <div className={styles.panelBody}>
              <div
                className={styles.list}
                ref={listRef}
                tabIndex={0}
                data-edge-top={edges.top}
                data-edge-bottom={edges.bottom}
              >
                {todos.map(({ text, done: finished, active }, index) => {
                  const status = finished ? 'done' : active ? 'active' : 'pending'
                  const Mark = MARKS[status]
                  return (
                    <div key={index} className={styles.item} data-done={finished}>
                      <Mark
                        size={12}
                        strokeWidth={1.75}
                        className={styles.mark}
                        data-status={status}
                        aria-label={finished ? '已完成' : active ? '进行中' : '待处理'}
                      />
                      <span className={styles.index}>{index + 1}.</span>
                      <span className={styles.text}>{text}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
