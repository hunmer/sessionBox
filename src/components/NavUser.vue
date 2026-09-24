<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Check, Keyboard, LayoutGrid, Loader2, MoreVertical, Plus, Settings } from 'lucide-vue-next'
import { useProfiles } from '@/composables/useProfiles'

const props = defineProps<{
  user: {
    name: string
    email: string
    avatar: string
    emoji?: string
  }
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openSettings: [tab?: string]
}>()

const { profiles, currentProfile, refresh, create, launch, openSelector } = useProfiles()

const popoverOpen = ref(false)
const creating = ref(false)
const newName = ref('')
const submitting = ref(false)

function onPopoverChange(open: boolean): void {
  popoverOpen.value = open
  if (open) {
    creating.value = false
    newName.value = ''
    // 其他 profile 进程可能新建了环境，打开时重新拉取列表
    void refresh()
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
    popoverOpen.value = false
    await launch(profile.id)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '创建 Profile 失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <SidebarMenu :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem :class="collapsed ? 'flex justify-center' : ''">
      <Popover :open="popoverOpen" @update:open="onPopoverChange">
        <PopoverTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="rounded-lg border border-sidebar-border"
            :class="['data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground', collapsed ? '!w-full justify-center' : '']"
          >
            <Avatar class="h-8 w-8 rounded-lg">
              <AvatarImage
                v-if="user.avatar"
                :src="user.avatar"
                :alt="user.name"
              />
              <AvatarFallback class="rounded-lg">
                {{ user.emoji || user.name?.[0]?.toUpperCase() || 'U' }}
              </AvatarFallback>
            </Avatar>
            <template v-if="!collapsed">
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">{{ user.name }}</span>
                <span class="truncate text-xs">{{ currentProfile?.name ?? user.email }}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  as-child
                  @click.stop
                >
                  <button
                    class="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    @click.stop
                  >
                    <MoreVertical class="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  class="w-48"
                >
                  <DropdownMenuItem @click="emit('openSettings', 'general')">
                    <Settings class="mr-2 h-4 w-4" />
                    设置
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="emit('openSettings', 'shortcuts')">
                    <Keyboard class="mr-2 h-4 w-4" />
                    快捷键设置
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </template>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          class="w-64 p-2"
        >
          <div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Profiles
          </div>

          <div class="max-h-64 overflow-y-auto">
            <button
              v-for="profile in profiles"
              :key="profile.id"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="popoverOpen = false; launch(profile.id)"
            >
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {{ profile.name?.[0]?.toUpperCase() || '?' }}
              </span>
              <span class="min-w-0 flex-1 truncate text-left">{{ profile.name }}</span>
              <Check
                v-if="currentProfile?.id === profile.id"
                class="h-4 w-4 shrink-0 text-primary"
              />
            </button>
          </div>

          <template v-if="!creating">
            <button
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="creating = true"
            >
              <Plus class="h-4 w-4" />
              新建 Profile
            </button>
          </template>
          <div
            v-else
            class="flex items-center gap-1.5 px-1 py-1"
          >
            <Input
              v-model="newName"
              placeholder="Profile 名称"
              class="h-8"
              maxlength="30"
              autofocus
              @keydown.enter="submitCreate"
              @keydown.esc="creating = false"
            />
            <Button
              size="icon"
              class="h-8 w-8 shrink-0"
              :disabled="submitting || !newName.trim()"
              @click="submitCreate"
            >
              <Loader2
                v-if="submitting"
                class="h-4 w-4 animate-spin"
              />
              <Plus
                v-else
                class="h-4 w-4"
              />
            </Button>
          </div>

          <Separator class="my-1.5" />

          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            @click="popoverOpen = false; openSelector()"
          >
            <LayoutGrid class="h-4 w-4" />
            打开 Profiles 选择页
          </button>

          <Separator class="my-1.5" />

          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            @click="popoverOpen = false; emit('openSettings', 'general')"
          >
            <Settings class="h-4 w-4" />
            设置
          </button>
          <button
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            @click="popoverOpen = false; emit('openSettings', 'shortcuts')"
          >
            <Keyboard class="h-4 w-4" />
            快捷键设置
          </button>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
