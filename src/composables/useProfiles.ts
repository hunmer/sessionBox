import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

export interface ProfileItem {
  id: string
  name: string
  createdAt: number
  lastUsedAt?: number
}

// 模块级单例：NavUser popover 与 Profiles 选择页共享同一份列表
const profiles = ref<ProfileItem[]>([])
const currentProfile = ref<{ id: string; name: string } | null>(null)
let loaded = false

export function useProfiles() {
  async function refresh(): Promise<void> {
    try {
      const [list, current] = await Promise.all([window.api.profile.list(), window.api.profile.current()])
      profiles.value = list
      currentProfile.value = current
      loaded = true
    } catch (error) {
      console.error('[useProfiles] 读取 Profiles 失败', error)
      toast.error('读取 Profiles 失败')
    }
  }

  if (!loaded) void refresh()

  // 最近使用的排前面
  const sortedProfiles = computed(() =>
    [...profiles.value].sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt))
  )

  async function create(name: string): Promise<ProfileItem> {
    const profile = await window.api.profile.create(name)
    await refresh()
    return profile as ProfileItem
  }

  async function launch(profileId: string): Promise<void> {
    const target = profiles.value.find((item) => item.id === profileId)
    const result = await window.api.profile.launch(profileId)
    toast.success(result.launched ? `已启动 Profile「${target?.name ?? profileId}」` : '当前环境已在运行')
  }

  async function openSelector(): Promise<void> {
    await window.api.profile.openSelector()
  }

  return { profiles: sortedProfiles, currentProfile, refresh, create, launch, openSelector }
}
