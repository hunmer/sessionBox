<script setup lang="ts">
import { Camera } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { useUserProfileStore } from '@/stores/userProfile'

const userStore = useUserProfileStore()

/** 上传自定义头像，复用账号图标上传接口 */
async function handleUploadAvatar() {
  const result = await window.api.account.uploadIcon()
  if (result) {
    userStore.updateProfile({ avatar: result })
  }
}

function handleNameChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  userStore.updateProfile({ name: val })
}
</script>

<template>
  <h3 class="text-sm font-medium mb-4">用户信息</h3>

  <!-- 头像 -->
  <div class="flex items-center gap-4 mb-6">
    <div class="relative group cursor-pointer" @click="handleUploadAvatar">
      <Avatar class="h-16 w-16 rounded-full">
        <AvatarImage v-if="userStore.avatarSrc" :src="userStore.avatarSrc" />
        <AvatarFallback class="rounded-full text-xl">
          {{ userStore.isEmojiAvatar ? userStore.profile.avatar : userStore.avatarFallback }}
        </AvatarFallback>
      </Avatar>
      <div
        class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Camera class="w-5 h-5 text-white" />
      </div>
    </div>
    <div class="text-xs text-muted-foreground">点击头像上传自定义图片</div>
  </div>

  <!-- 名称 -->
  <div>
    <label class="text-xs text-muted-foreground mb-1 block">用户名称</label>
    <Input
      :model-value="userStore.profile.name"
      placeholder="输入用户名称"
      @change="handleNameChange"
    />
  </div>
</template>
