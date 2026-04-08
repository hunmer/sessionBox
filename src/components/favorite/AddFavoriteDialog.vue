<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAccountStore } from '@/stores/account'
import { useFavoriteSiteStore } from '@/stores/favoriteSite'

const props = defineProps<{
  open: boolean
  /** 编辑模式：传入已有的站点数据 */
  editSite?: { id: string; title: string; url: string; accountId?: string } | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const accountStore = useAccountStore()
const favoriteSiteStore = useFavoriteSiteStore()

const title = ref('')
const url = ref('')
const accountId = ref<string>('__none__')

const isEdit = computed(() => !!props.editSite)
const dialogTitle = computed(() => isEdit.value ? '编辑快捷网站' : '添加快捷网站')

/** 所有账号列表（按分组归类，扁平化） */
const allAccounts = computed(() =>
  [...accountStore.accounts].sort((a, b) => a.order - b.order)
)

/** 监听编辑数据变化 */
function onOpenChange(open: boolean) {
  if (open && props.editSite) {
    title.value = props.editSite.title
    url.value = props.editSite.url
    accountId.value = props.editSite.accountId || '__none__'
  } else if (open) {
    title.value = ''
    url.value = ''
    accountId.value = '__none__'
  }
  emit('update:open', open)
}

async function handleSubmit() {
  const finalUrl = url.value.trim()
  if (!finalUrl) return

  const normalizedUrl = finalUrl.match(/^https?:\/\//) ? finalUrl : `https://${finalUrl}`
  const finalAccountId = accountId.value === '__none__' ? undefined : accountId.value
  const finalTitle = title.value.trim() || normalizedUrl

  if (isEdit.value && props.editSite) {
    await favoriteSiteStore.updateSite(props.editSite.id, {
      title: finalTitle,
      url: normalizedUrl,
      accountId: finalAccountId
    })
  } else {
    await favoriteSiteStore.createSite({
      title: finalTitle,
      url: normalizedUrl,
      accountId: finalAccountId
    })
  }

  emit('update:open', false)
}

function isValid() {
  return url.value.trim().length > 0
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-3 py-2">
        <!-- 标题 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">标题（可选）</label>
          <Input v-model="title" placeholder="网站名称" class="h-8 text-sm" />
        </div>

        <!-- 网址 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">网址</label>
          <Input v-model="url" placeholder="https://example.com" class="h-8 text-sm" />
        </div>

        <!-- 选择账号 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">关联账号（可选，用于独立会话）</label>
          <Select v-model="accountId">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="不关联账号（默认会话）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不关联账号（默认会话）</SelectItem>
              <SelectItem
                v-for="account in allAccounts"
                :key="account.id"
                :value="account.id"
              >
                {{ account.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="!isValid()" @click="handleSubmit">
          {{ isEdit ? '保存' : '添加' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
