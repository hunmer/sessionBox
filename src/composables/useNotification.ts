import { toast } from 'vue-sonner'

// ===== 类型定义 =====

/** 通知操作按钮 */
export interface NotificationAction {
  label: string
  onClick: () => void
}

/** 通知选项（对象形式调用时使用） */
export interface NotificationOptions {
  /** 通知标题 */
  title: string
  /** 通知描述（可选副标题） */
  description?: string
  /** 自动关闭时长(ms)，设为 Infinity 则不自动关闭 */
  duration?: number
  /** 操作按钮 */
  action?: NotificationAction
  /** 取消按钮 */
  cancel?: NotificationAction
  /** 自定义唯一 ID，可用于后续 dismiss */
  id?: string | number
}

/** Promise 通知的文案配置 */
export interface PromiseNotificationMessages {
  loading: string
  success: string | ((data: any) => string)
  error: string | ((error: any) => string)
}

// ===== 通知中心 =====

/** 默认自动关闭时长 */
const DEFAULT_DURATION = 4000

/**
 * 通知中心 Composable
 *
 * 基于 vue-sonner 封装，提供语义化的通知方法。
 * 所有 Vue 组件均可通过此 composable 发送通知，无需直接依赖 vue-sonner。
 *
 * @example
 * ```ts
 * const notify = useNotification()
 *
 * // 简单调用
 * notify.success('保存成功')
 * notify.error('网络异常')
 *
 * // 带描述
 * notify.warning({ title: '空间不足', description: '磁盘使用率已达 95%' })
 *
 * // 带操作按钮
 * notify.info({
 *   title: '发现新版本',
 *   action: { label: '立即更新', onClick: () => doUpdate() }
 * })
 *
 * // 异步任务
 * notify.promise(saveData(), {
 *   loading: '保存中...',
 *   success: '保存成功',
 *   error: '保存失败'
 * })
 *
 * // 手动关闭
 * const id = notify.loading('处理中...')
 * notify.dismiss(id)
 * ```
 */
export function useNotification() {
  /** 构建 vue-sonner 所需的 options 对象 */
  function buildSonnerOptions(options?: NotificationOptions) {
    if (!options) return undefined
    const opts: Record<string, any> = {
      description: options.description,
      duration: options.duration ?? DEFAULT_DURATION,
    }
    if (options.id != null) opts.id = options.id
    if (options.action) {
      opts.action = {
        label: options.action.label,
        onClick: options.action.onClick,
      }
    }
    if (options.cancel) {
      opts.cancel = {
        label: options.cancel.label,
        onClick: options.cancel.onClick,
      }
    }
    return opts
  }

  /** 解析参数：支持 string 或 NotificationOptions */
  function resolveArgs(
    messageOrOptions: string | NotificationOptions
  ): [string, Record<string, any> | undefined] {
    if (typeof messageOrOptions === 'string') {
      return [messageOrOptions, { duration: DEFAULT_DURATION }]
    }
    const { title, ...rest } = messageOrOptions
    return [title, buildSonnerOptions(rest)]
  }

  return {
    /** 成功通知（绿色） */
    success(messageOrOptions: string | NotificationOptions) {
      const [msg, opts] = resolveArgs(messageOrOptions)
      return toast.success(msg, opts)
    },

    /** 错误通知（红色） */
    error(messageOrOptions: string | NotificationOptions) {
      const [msg, opts] = resolveArgs(messageOrOptions)
      return toast.error(msg, opts)
    },

    /** 警告通知（黄色） */
    warning(messageOrOptions: string | NotificationOptions) {
      const [msg, opts] = resolveArgs(messageOrOptions)
      return toast.warning(msg, opts)
    },

    /** 信息通知（蓝色） */
    info(messageOrOptions: string | NotificationOptions) {
      const [msg, opts] = resolveArgs(messageOrOptions)
      return toast.info(msg, opts)
    },

    /** 加载中通知（不自动关闭，需手动 dismiss） */
    loading(messageOrOptions: string | NotificationOptions) {
      if (typeof messageOrOptions === 'string') {
        return toast.loading(messageOrOptions, { duration: Infinity })
      }
      const { title, ...rest } = messageOrOptions
      rest.duration ??= Infinity
      return toast.loading(title, buildSonnerOptions(rest))
    },

    /**
     * Promise 通知 —— 自动跟踪异步任务状态
     *
     * @param promise 异步任务
     * @param messages 各阶段文案
     * @returns 原始 promise 的结果
     */
    promise<T>(promise: Promise<T>, messages: PromiseNotificationMessages) {
      return toast.promise(promise, {
        loading: messages.loading,
        success: messages.success,
        error: messages.error,
      })
    },

    /** 关闭指定通知（传 ID），或关闭全部（不传参） */
    dismiss(id?: string | number) {
      return toast.dismiss(id)
    },
  }
}
