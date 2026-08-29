import { Skeleton } from '@/design/primitives/Skeleton'
import styles from './ProjectTreeSkeleton.module.css'

/** 会话扫描期间的占位。刻意贴合真实项目树的行高与缩进，避免数据到位时布局跳动 */
export function ProjectTreeSkeleton() {
  return (
    <div className={styles.tree} aria-busy="true" aria-label="正在加载会话">
      <div className={styles.groupTitle}>
        <Skeleton width="28px" height="12px" />
      </div>

      {[0, 1].map((group) => (
        <div key={group} className={styles.project}>
          <div className={styles.projectRow}>
            <Skeleton width="16px" height="16px" />
            <Skeleton width={group === 0 ? '52%' : '38%'} height="13px" />
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className={styles.sessionRow}>
              <Skeleton width={`${72 - row * 14}%`} height="13px" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
