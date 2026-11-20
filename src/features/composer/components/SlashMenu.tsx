import { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import type { useSlashMenu } from '../hooks/useSlashMenu'
import styles from './SlashMenu.module.css'

export function SlashMenu({ id, items, index, pick }: ReturnType<typeof useSlashMenu>) {
  const selected = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selected.current?.scrollIntoView({ block: 'nearest' })
  }, [index])

  return (
    <div id={id} role="listbox" aria-label="斜杠命令" className={styles.list}>
      {items.length === 0 && <p className={styles.empty}>没有匹配的命令</p>}
      {items.map((item, i) => (
        <button
          id={`${id}-${i}`}
          key={item.name}
          ref={i === index ? selected : null}
          role="option"
          aria-selected={i === index}
          type="button"
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(item)}
        >
          <Terminal size={15} aria-hidden="true" />
          <strong>/{item.name}</strong>
          {item.description && <span>{item.description}</span>}
        </button>
      ))}
    </div>
  )
}
