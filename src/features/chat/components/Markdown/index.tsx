import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText } from 'lucide-react'
import { openLink } from '@/shared/utils/openLink'
import styles from './Markdown.module.css'

export interface MarkdownProps {
  children: string
  /** 是否在正文末尾显示流式光标 */
  caret?: boolean
  /** 当前项目目录，用于把相对路径链接补全成绝对路径 */
  cwd?: string | null
}

/** 看起来像文件路径的链接会带上文件图标，与截图中的 src/pages/index/index.vue 一致 */
function looksLikeFilePath(href: string | undefined): boolean {
  if (!href) return false
  return !/^[a-z]+:\/\//i.test(href) && /\.[a-z0-9]{1,8}$/i.test(href)
}

const components: Components = {
  code({ className, children, ...props }) {
    // react-markdown v10 里没有 inline 标记，用是否带语言类名区分块级与行内
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className={styles.codeBlock} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={styles.inlineCode} {...props}>
        {children}
      </code>
    )
  },

  pre({ children }) {
    return <pre className={styles.pre}>{children}</pre>
  },

  a({ href, children, ...props }) {
    const isFile = looksLikeFilePath(href)
    return (
      <a href={href} className={isFile ? styles.fileLink : styles.link} {...props}>
        {isFile && <FileText size={14} className={styles.fileIcon} />}
        {children}
      </a>
    )
  },

  ul({ children }) {
    return <ul className={styles.list}>{children}</ul>
  },

  ol({ children }) {
    return <ol className={styles.orderedList}>{children}</ol>
  },

  p({ children }) {
    return <p className={styles.paragraph}>{children}</p>
  },

  h1: ({ children }) => <h3 className={styles.heading}>{children}</h3>,
  h2: ({ children }) => <h3 className={styles.heading}>{children}</h3>,
  h3: ({ children }) => <h3 className={styles.heading}>{children}</h3>,

  table({ children }) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>{children}</table>
      </div>
    )
  },
}

/** 助手消息正文渲染 */
export function Markdown({ children, caret = false, cwd = null }: MarkdownProps) {
  /*
   * 在容器上统一代理链接点击，而不是给每个 <a> 挂 onClick：
   * components 是模块级常量，挂上去就得让它随 cwd 重建，每条消息一份。
   * 冒泡上来的都能接住，代理一次就够。
   */
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    const href = (e.target as HTMLElement).closest('a')?.getAttribute('href')
    if (!href) return
    e.preventDefault()
    void openLink(href, cwd)
  }

  return (
    <div className={`${styles.root} selectable`} data-caret={caret} onClick={onClick}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
