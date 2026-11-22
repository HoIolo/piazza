import { FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { SkillRecord } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import styles from '../sections/CapabilityList.module.css'

export interface SkillRowProps {
  skill: SkillRecord
  onEdit: () => void
  onDelete: () => void
}

export function SkillRow({ skill, onEdit, onDelete }: SkillRowProps) {
  return (
    <div className={styles.item}>
      <div className={styles.itemMain}>
        <div className={styles.itemHead}>
          <span className={styles.itemName}>{skill.name}</span>
          <span
            className={`${styles.badge} ${skill.scope === 'project' ? styles.badgeAccent : ''}`}
          >
            {skill.scope === 'global' ? '全局' : '项目'}
          </span>
          {skill.isSymlink && <span className={styles.badge}>软链接</span>}
        </div>
        {skill.description && <p className={styles.itemDesc}>{skill.description}</p>}
        <span className={styles.itemPath}>{skill.filePath}</span>
      </div>
      <div className={styles.itemActions}>
        <button
          type="button"
          className={styles.iconBtn}
          title="编辑 SKILL.md"
          aria-label="编辑"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="在访达中打开目录"
          aria-label="在访达中打开目录"
          onClick={() => void openPathWith('', skill.dirPath)}
        >
          <FolderOpen size={14} />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          title="删除技能"
          aria-label="删除"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
