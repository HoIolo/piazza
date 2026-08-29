import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { filterItems, usePaletteItems, type PaletteItem } from './usePaletteItems'
import styles from './CommandPalette.module.css'

export interface PaletteContentProps {
  builtins: PaletteItem[]
  onClose: () => void
}

/**
 * 面板内容。由外层在打开时才挂载，因此查询词与光标位置每次都是全新的，
 * 无需在 effect 里重置状态。
 */
export function PaletteContent({ builtins, onClose }: PaletteContentProps) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const ime = useImeGuard()

  const items = filterItems(usePaletteItems(builtins, true), query)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runAt = (index: number) => {
    items[index]?.run()
    onClose()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    // 组合期的回车属于输入法选词，不能当成「执行这一项」
    if (e.key === 'Enter') return ime.isComposing(e) ? undefined : runAt(cursor)
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const delta = e.key === 'ArrowDown' ? 1 : -1
    setCursor((c) => (items.length === 0 ? 0 : (c + delta + items.length) % items.length))
  }

  return (
    <div className={styles.palette} onMouseDown={(e) => e.stopPropagation()}>
      <div className={styles.searchRow}>
        <Search size={17} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="搜索命令…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={handleKeyDown}
          {...ime.bind}
        />
      </div>

      <ul className={styles.results}>
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className={styles.item}
              data-active={index === cursor}
              onMouseEnter={() => setCursor(index)}
              onClick={() => runAt(index)}
            >
              <span className={styles.label}>{item.label}</span>
              {item.hint && <span className={styles.hint}>{item.hint}</span>}
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className={styles.empty}>没有匹配的命令</li>}
      </ul>
    </div>
  )
}
