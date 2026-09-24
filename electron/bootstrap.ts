import { app } from 'electron'
import { join } from 'path'

/**
 * 启动参数解析与 userData 重定向。
 * 必须作为 main.ts 的第一个 import：所有服务模块（含 Store 实例化）都以
 * app.getPath('userData') 为存储根，重定向要在它们执行前生效。
 *
 *   --profile=<id>      以指定 profile 的独立数据目录启动（全新数据环境）
 *   --profile-selector  以 Profiles 选择页模式启动（同样重定向，避免与默认环境抢单实例锁）
 */

// 原始 userData 目录：profile 注册表与各 profile 数据目录都挂在它下面
export const DEFAULT_USER_DATA = app.getPath('userData')

export const DEFAULT_PROFILE_ID = 'default'

export const PROFILE_DATA_DIR = join(DEFAULT_USER_DATA, 'profiles-data')

const PROFILE_ARG_PREFIX = '--profile='
const PROFILE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function readProfileArg(): string | null {
  const arg = process.argv.find((item) => item.startsWith(PROFILE_ARG_PREFIX))
  if (!arg) return null
  const id = arg.slice(PROFILE_ARG_PREFIX.length)
  return PROFILE_ID_PATTERN.test(id) ? id : null
}

export const PROFILE_ID = readProfileArg() ?? DEFAULT_PROFILE_ID
export const IS_PROFILE_SELECTOR = process.argv.includes('--profile-selector')

// 单实例锁以 userData 为作用域，重定向后各 profile 进程互不互斥；
// 默认 profile 保持原目录不动，老用户数据原地可用。
if (PROFILE_ID !== DEFAULT_PROFILE_ID || IS_PROFILE_SELECTOR) {
  const scope = IS_PROFILE_SELECTOR ? '__selector__' : PROFILE_ID
  app.setPath('userData', join(PROFILE_DATA_DIR, scope))
}

/** 直启指定 profile 的完整命令行参数（dev 下需附带应用路径） */
export function getProfileLaunchArgs(profileId: string): string[] {
  return app.isPackaged ? [`--profile=${profileId}`] : [app.getAppPath(), `--profile=${profileId}`]
}
