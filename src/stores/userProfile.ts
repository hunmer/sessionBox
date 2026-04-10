import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserProfile {
  name: string
  avatar: string // emoji 字符或 "img:filename" 格式
}

const STORAGE_KEY = 'sessionbox-user-profile'

const defaults: UserProfile = {
  name: '用户',
  avatar: '👤'
}

function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* 忽略解析错误 */ }
  return { ...defaults }
}

export const useUserProfileStore = defineStore('userProfile', () => {
  const profile = ref<UserProfile>(loadProfile())

  function updateProfile(patch: Partial<UserProfile>) {
    profile.value = { ...profile.value, ...patch }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile.value))
  }

  /** 头像显示地址，图片类型转为 account-icon:// 协议 */
  const avatarSrc = computed(() => {
    const a = profile.value.avatar
    return a.startsWith('img:') ? `account-icon://${a.slice(4)}` : ''
  })

  /** 是否为 emoji 头像 */
  const isEmojiAvatar = computed(() => !profile.value.avatar.startsWith('img:'))

  /** 头像 fallback 文字（取名称首字符） */
  const avatarFallback = computed(() => {
    const name = profile.value.name.trim()
    return name ? name[0].toUpperCase() : 'U'
  })

  return { profile, avatarSrc, isEmojiAvatar, avatarFallback, updateProfile }
})
