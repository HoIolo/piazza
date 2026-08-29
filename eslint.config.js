import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'src-tauri/target'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 计划中的硬性约定，交给 lint 强制执行而非靠自觉
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'max-lines': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 分层约束：primitives 属于最底层，不允许反向依赖业务层
              group: ['@/features/*', '@/store/*'],
              importNames: ['*'],
              message: 'design/primitives 不得依赖 features 或 store（见计划的分层约定）',
            },
          ],
        },
      ],
    },
  },
  {
    // features 之间不得互相依赖：要共享就上提到 shared/ 或 store/。
    // 横向依赖会让「改一个 feature 波及另一个」，是分层失效的第一步。
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*/*', '../../*/'],
              message: 'features 之间不得互相 import，请把共用逻辑上提到 shared/ 或 store/',
            },
          ],
        },
      ],
    },
  },
  {
    // app 层只做组装，允许跨 feature 引用
    files: ['src/app/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // JSX 是声明式结构，行数不反映复杂度：一个字段一行的设置表单天然就有几十行，
    // 按 50 行硬拆只会产出无意义的碎片组件。文件级的 max-lines 150 仍然生效，
    // 它才是真正的拆分约束；逻辑代码（.ts）继续按 50 行要求。
    files: ['**/*.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
)
