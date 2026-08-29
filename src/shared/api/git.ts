import { invoke } from '@tauri-apps/api/core'

/** 读取当前分支名。非 git 目录返回 null */
export function readGitBranch(cwd: string): Promise<string | null> {
  return invoke<string | null>('read_git_branch', { cwd })
}

/** 列出本地分支，当前分支在首位 */
export function listGitBranches(cwd: string): Promise<string[]> {
  return invoke<string[]>('list_git_branches', { cwd })
}

/** 切换分支；create 为真时新建并检出 */
export function checkoutGitBranch(cwd: string, branch: string, create = false): Promise<void> {
  return invoke<void>('checkout_git_branch', { cwd, branch, create })
}

/** 工作区增删行数，[新增, 删除]。非 git 目录返回 null */
export function readGitDiffStat(cwd: string): Promise<[number, number] | null> {
  return invoke<[number, number] | null>('read_git_diff_stat', { cwd })
}

/** 工作区完整 diff 文本。非 git 目录或 git 报错时 reject */
export function readGitDiff(cwd: string): Promise<string> {
  return invoke<string>('read_git_diff', { cwd })
}

/** 与 src-tauri/src/git.rs 的 Worktree 对应 */
export interface Worktree {
  path: string
  branch: string
  isMain: boolean
}

export function listGitWorktrees(cwd: string): Promise<Worktree[]> {
  return invoke<Worktree[]>('list_git_worktrees', { cwd })
}

/** 新建 worktree，返回新目录路径 */
export function addGitWorktree(cwd: string, branch: string): Promise<string> {
  return invoke<string>('add_git_worktree', { cwd, branch })
}
