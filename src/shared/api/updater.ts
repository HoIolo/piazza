import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type { Update }

/** 下载进度。总长为空表示服务端没给 Content-Length */
export interface DownloadProgress {
  downloaded: number
  total: number | null
}

/**
 * 检查更新。没有新版本时返回 null。
 *
 * 端点与公钥写在 tauri.conf.json 的 plugins.updater 里，
 * 更新包本身也带签名，公钥对不上的包会被 updater 拒掉。
 */
export async function checkForUpdate(): Promise<Update | null> {
  return check()
}

/** 下载并安装。macOS 是就地替换 .app，Windows 会拉起 NSIS 安装程序 */
export async function installUpdate(
  update: Update,
  onProgress: (progress: DownloadProgress) => void,
): Promise<void> {
  let downloaded = 0
  let total: number | null = null
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null
      downloaded = 0
      onProgress({ downloaded, total })
      return
    }
    if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onProgress({ downloaded, total })
    }
  })
}

/** 装完重启自己。Windows 上安装程序会接手，通常走不到这里 */
export async function relaunchApp(): Promise<void> {
  await relaunch()
}
