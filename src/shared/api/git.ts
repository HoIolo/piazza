import { invoke } from '@tauri-apps/api/core'

/** 读取当前分支名。非 git 目录返回 null */
export function readGitBranch(cwd: string): Promise<string | null> {
  return invoke<string | null>('read_git_branch', { cwd })
}

/** 与 src-tauri/src/git.rs 的 GitBranch 对应 */
export interface GitBranch {
  name: string
  remote: boolean
}

/** 列出本地与远程跟踪分支：本地在前（当前分支置顶），远程在后 */
export function listGitBranches(cwd: string): Promise<GitBranch[]> {
  return invoke<GitBranch[]>('list_git_branches', { cwd })
}

/** 拉取远程分支最新引用（非交互） */
export function fetchGitRemotes(cwd: string): Promise<void> {
  return invoke<void>('fetch_git_remotes', { cwd })
}

/** 切换分支；create 为真时新建并检出，remote 为真时检出远程跟踪分支 */
export function checkoutGitBranch(
  cwd: string,
  branch: string,
  create = false,
  remote = false,
): Promise<void> {
  return invoke<void>('checkout_git_branch', { cwd, branch, create, remote })
}

/** 工作区增删行数，[新增, 删除]。非 git 目录返回 null */
export function readGitDiffStat(cwd: string): Promise<[number, number] | null> {
  return invoke<[number, number] | null>('read_git_diff_stat', { cwd })
}

/** 工作区完整 diff 文本。非 git 目录或 git 报错时 reject */
export function readGitDiff(cwd: string, path?: string): Promise<string> {
  return invoke<string>('read_git_diff', { cwd, path })
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
