<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { useProfiles } from '@/composables/useProfiles'
import { Check, Link2, Loader2, Plus, UserRound, X } from 'lucide-vue-next'

const { profiles, currentProfile, create, launch } = useProfiles()

const creating = ref(false)
const newName = ref('')
const submitting = ref(false)
const shortcutBusy = ref<string | null>(null)

async function createShortcut(profileId: string, event: Event): Promise<void> {
  // 阻止触发卡片自身的 launch
  event.stopPropagation()
  if (shortcutBusy.value) return
  shortcutBusy.value = profileId
  try {
    await window.api.profile.createDesktopShortcut(profileId)
    toast.success('已创建桌面快捷方式')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '创建桌面快捷方式失败')
  } finally {
    shortcutBusy.value = null
  }
}

async function submitCreate(): Promise<void> {
  const name = newName.value.trim()
  if (!name || submitting.value) return
  submitting.value = true
  try {
    const profile = await create(name)
    newName.value = ''
    creating.value = false
    await launch(profile.id)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '创建 Profile 失败')
  } finally {
    submitting.value = false
  }
}

function close(): void {
  window.api.window.close()
}
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-foreground shadow-2xl dark:shadow-black/50">
    <header
      class="flex h-11 shrink-0 items-center justify-between border-b border-border px-3"
      style="-webkit-app-region: drag"
    >
      <span class="text-sm font-medium">SessionBox Profiles</span>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
        style="-webkit-app-region: no-drag"
        @click="close"
      >
        <X class="h-4 w-4" />
      </Button>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto grid max-w-2xl grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          role="button"
          tabindex="0"
          class="group relative flex cursor-pointer flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          @click="launch(profile.id)"
          @keydown.enter="launch(profile.id)"
        >
          <Button
            variant="ghost"
            size="icon"
            class="absolute right-1.5 top-1.5 h-7 w-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            :title="`创建「${profile.name}」桌面快捷方式`"
            :disabled="shortcutBusy === profile.id"
            @click="createShortcut(profile.id, $event)"
          >
            <Loader2
              v-if="shortcutBusy === profile.id"
              class="h-4 w-4 animate-spin"
            />
            <Link2
              v-else
              class="h-4 w-4"
            />
          </Button>
          <div
            class="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-xl font-medium"
          >
            {{ profile.name?.[0]?.toUpperCase() || '?' }}
          </div>
          <div class="flex items-center gap-1.5">
            <UserRound class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="max-w-36 truncate text-sm font-medium">{{ profile.name }}</span>
          </div>
          <Badge
            v-if="currentProfile?.id === profile.id"
            variant="secondary"
            class="gap-1"
          >
            <Check class="h-3 w-3" />
            当前环境
          </Badge>
          <span
            v-else-if="profile.lastUsedAt"
            class="text-xs text-muted-foreground"
          >最近使用</span>
        </div>

        <button
          class="flex min-h-[148px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          @click="creating = true"
        >
          <Plus class="h-6 w-6" />
          <span class="text-sm">新建 Profile</span>
        </button>
      </div>

      <div
        v-if="creating"
        class="mx-auto mt-4 flex max-w-2xl items-center gap-2"
      >
        <Input
          v-model="newName"
          placeholder="Profile 名称"
          maxlength="30"
          autofocus
          @keydown.enter="submitCreate"
          @keydown.esc="creating = false"
        />
        <Button
          size="sm"
          :disabled="submitting || !newName.trim()"
          @click="submitCreate"
        >
          <Loader2
            v-if="submitting"
            class="mr-1 h-4 w-4 animate-spin"
          />
          创建并启动
        </Button>
        <Button
          size="sm"
          variant="ghost"
          :disabled="submitting"
          @click="creating = false"
        >
          取消
        </Button>
      </div>
    </div>

    <Toaster />
  </div>
</template>
