import type { CSSProperties } from 'react'
import type { ThinkingLevel } from '@/rpc/types'
import { thinkingLabel } from '@/shared/utils/format'
import styles from './LevelSlider.module.css'

export interface LevelSliderProps {
  levels: ThinkingLevel[]
  current: ThinkingLevel | undefined
  onChange: (level: ThinkingLevel) => void
}

/**
 * 推理强度滑杆：每个刻度一档，对应 Codex 的 Power 滑杆。
 *
 * 用原生 range 而不是自己画——左右方向键、Home/End、读屏播报都是现成的，
 * 自己实现一遍只会更差。外观靠伪元素重画，刻度点是叠在上面的装饰。
 */
export function LevelSlider({ levels, current, onChange }: LevelSliderProps) {
  const last = levels.length - 1
  const index = Math.max(0, current ? levels.indexOf(current) : 0)

  return (
    <div className={styles.slider} style={{ '--ratio': index / last } as CSSProperties}>
      <input
        type="range"
        className={styles.range}
        min={0}
        max={last}
        step={1}
        value={index}
        aria-label="推理强度"
        aria-valuetext={thinkingLabel(levels[index])}
        onChange={(e) => onChange(levels[Number(e.target.value)])}
      />
      <div className={styles.ticks} aria-hidden="true">
        {levels.map((level, i) => (
          <span
            key={level}
            className={styles.tick}
            /* 滑块正压着的那一档不画点，否则白色滑块中间会透出一个灰点 */
            hidden={i === index}
            data-on={i < index}
            style={{ '--at': i / last } as CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
