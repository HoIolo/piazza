import type { ProviderMap } from '../hooks/providerOps'
import type { ModelsConfigApi } from '../hooks/useModelsConfig'
import { ModelDialog } from './ModelDialog'
import { ProviderDialog } from './ProviderDialog'

/** 当前打开的对话框。key 为 null 是新建 provider；index 为 null 是新建模型 */
export type Editor =
  { kind: 'provider'; key: string | null } | { kind: 'model'; key: string; index: number | null }

export interface ModelsEditorProps {
  editor: Editor
  providers: ProviderMap
  onClose: () => void
  onCommit: ModelsConfigApi['commit']
}

/** 按 editor 的类型挑一个对话框渲染 */
export function ModelsEditor({ editor, providers, onClose, onCommit }: ModelsEditorProps) {
  if (editor.kind === 'provider') {
    return (
      <ProviderDialog
        providers={providers}
        providerKey={editor.key}
        onClose={onClose}
        onCommit={onCommit}
      />
    )
  }
  return (
    <ModelDialog
      providerKey={editor.key}
      models={providers[editor.key]?.models ?? []}
      index={editor.index}
      onClose={onClose}
      onCommit={onCommit}
    />
  )
}
