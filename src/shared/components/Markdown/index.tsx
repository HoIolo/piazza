import { isValidElement, memo, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText } from 'lucide-react'
import { openLink } from '@/shared/utils/openLink'
import { MarkdownImage } from './MarkdownImage'
import { CodeBlock } from './CodeBlock'
import styles from './Markdown.module.css'

const REMARK_PLUGINS = [remarkGfm]

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
  // 行内与围栏共用这一个渲染：围栏里的由 CodeBlock 的样式把行内那套外观撤掉
  code({ className, children, ...props }) {
    return (
      <code
        className={className ? `${styles.inlineCode} ${className}` : styles.inlineCode}
        {...props}
      >
        {children}
      </code>
    )
  },

  pre({ children }) {
    // 语言名挂在里层 <code> 的 language-xxx 类名上
    const inner = isValidElement<{ className?: string }>(children) ? children.props : null
    const language = /language-([\w+#-]+)/.exec(inner?.className ?? '')?.[1] ?? ''
    return <CodeBlock language={language}>{children}</CodeBlock>
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

  /*
   * 标题降两级输出（# → h3），聊天正文不该往页面大纲里塞 h1；
   * 视觉层级靠 data-level 区分，三级字号对应 Codex 的 1.5 / 1.25 / 1.125 倍。
   */
  h1: ({ children }) => (
    <h3 className={styles.heading} data-level="1">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className={styles.heading} data-level="2">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className={styles.heading} data-level="3">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className={styles.heading} data-level="4">
      {children}
    </h6>
  ),

  blockquote: ({ children }) => <blockquote className={styles.quote}>{children}</blockquote>,

  hr: () => <hr className={styles.rule} />,

  table({ children }) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>{children}</table>
      </div>
    )
  },
}

/** 助手消息正文渲染 */
export const Markdown = memo(function Markdown({
  children,
  caret = false,
  cwd = null,
}: MarkdownProps) {
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

  const renderers = useMemo<Components>(
    () => ({
      ...components,
      img: ({ src, alt }: { src?: string | Blob; alt?: string }) =>
        typeof src === 'string' ? <MarkdownImage key={src} src={src} alt={alt} cwd={cwd} /> : null,
    }),
    [cwd],
  )

  return (
    <div className={`${styles.root} selectable`} data-caret={caret} onClick={onClick}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={renderers}>
        {children}
      </ReactMarkdown>
    </div>
  )
})
