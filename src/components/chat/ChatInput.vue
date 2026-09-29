<!--
  ChatInput 聊天输入框
  来源：React Compose 组件移植（framer-motion → motion-v，React hooks → Composition API）
  附加：图片上传、模型选择、工具开关；Skill 列表接入 / 命令菜单（行内可复制/编辑/删除）
  用法：
    <ChatInput
      :is-streaming="chat.isStreaming"
      :disabled="!model"
      :tools="tools"
      :enabled-tools="enabledTools"
      @send="(content, images) => {}"
      @stop="() => {}"
      @toggle-tool="(name) => {}"
    />
-->
<script lang="ts">
import type { Component } from 'vue'
import type { ToolDisplayItem } from '@/types'

export interface ComposeMention {
  id: string
  label: string
  sublabel?: string
  avatar?: string
}

export interface ComposeCommand {
  id: string
  label: string
  hint?: string
  icon?: Component
}

interface Trigger {
  type: '@' | '/'
  start: number
  query: string
}

const CARET_PROPS = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
  'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'wordWrap', 'wordBreak',
] as const

/** 镜像测量 textarea 中指定光标位置的坐标（用于定位 @ / / 弹出菜单） */
function caretCoords(el: HTMLTextAreaElement, pos: number) {
  const doc = document.createElement('div')
  const s = doc.style
  const cs = window.getComputedStyle(el)
  s.position = 'absolute'
  s.visibility = 'hidden'
  s.whiteSpace = 'pre-wrap'
  s.wordWrap = 'break-word'
  s.top = '0'
  s.left = '-9999px'
  for (const p of CARET_PROPS) {
    s[p] = cs[p]
  }
  s.height = 'auto'
  s.overflow = 'hidden'
  doc.textContent = el.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(pos) || '.'
  doc.appendChild(marker)
  document.body.appendChild(doc)
  const x = marker.offsetLeft
  const y = marker.offsetTop
  document.body.removeChild(doc)
  return { x, y, lineHeight: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 }
}

/** 从光标位置向左扫描，判断是否处于 @mention / /command 触发态 */
function detectTrigger(text: string, caret: number): Trigger | null {
  let i = caret - 1
  while (i >= 0) {
    const ch = text[i]
    if (ch === '@' || ch === '/') {
      const before = i === 0 ? ' ' : text[i - 1]
      if (i === 0 || /\s/.test(before)) {
        const query = text.slice(i + 1, caret)
        if (!/\s/.test(query)) return { type: ch, start: i, query }
      }
      return null
    }
    if (/\s/.test(ch)) return null
    i--
  }
  return null
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Seg {
  text: string
  kind: 'text' | 'mention' | 'command'
}

/** 将文本切分为普通文本 / mention / command 片段（背景层高亮用） */
function segment(text: string, mentionForms: string[], commandForms: string[]): Seg[] {
  const forms = [
    ...mentionForms.map((f) => ({ f, kind: 'mention' as const })),
    ...commandForms.map((f) => ({ f, kind: 'command' as const })),
  ].sort((a, b) => b.f.length - a.f.length)
  if (forms.length === 0) return [{ text, kind: 'text' }]

  const kindOf = new Map(forms.map((x) => [x.f, x.kind]))
  const re = new RegExp(
    `(${forms.map((x) => escapeRe(x.f)).join('|')})(?=$|[^\\w])`,
    'g',
  )
  const out: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const prev = m.index === 0 ? '' : text[m.index - 1]
    if (prev && /\w/.test(prev)) continue
    if (m.index > last) out.push({ text: text.slice(last, m.index), kind: 'text' })
    out.push({ text: m[0], kind: kindOf.get(m[0]) ?? 'mention' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: 'text' })
  return out.length ? out : [{ text, kind: 'text' }]
}
</script>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, useId, h, type FunctionalComponent } from 'vue'
import { Motion, AnimatePresence, useReducedMotion } from 'motion-v'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  ImagePlus, Square, Trash2, Wrench,
  Copy, Check, Pencil, Loader2,
} from 'lucide-vue-next'
import ModelSelector from './ModelSelector.vue'

interface SkillItem {
  name: string
  description: string
  created: string
  updated: string
}

interface SkillFull {
  name: string
  description: string
  content: string
  updated: string
}

/** 菜单行统一模型（mention / command / skill 归一化，简化模板） */
interface Row {
  id: string
  label: string
  sublabel?: string
  avatar?: string
  hint?: string
  icon?: Component
  /** 行来源为 Skill 时携带原对象（用于行内复制/编辑/删除） */
  skill?: SkillItem
}

const props = withDefaults(defineProps<{
  isStreaming: boolean
  disabled?: boolean
  tools?: ToolDisplayItem[]
  enabledTools?: Record<string, boolean>
  mentions?: ComposeMention[]
  commands?: ComposeCommand[]
  placeholder?: string
  submitLabel?: string
  ariaLabel?: string
  autoFocus?: boolean
}>(), {
  placeholder: '输入消息... (Enter 发送, Shift+Enter 换行)',
  submitLabel: '发送',
  ariaLabel: '消息输入框',
  autoFocus: false,
})

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
  toggleTool: [toolName: string]
  command: [command: ComposeCommand]
}>()

const uid = useId()
const reduce = useReducedMotion()
const taRef = ref<HTMLTextAreaElement | null>(null)
const backdropRef = ref<HTMLDivElement | null>(null)
let pendingCaret: number | null = null
let flashTimer: number | null = null

const inputText = ref('')
const images = ref<string[]>([])

// ===== @ / / 触发菜单 =====
const trigger = ref<Trigger | null>(null)
const menu = ref({ x: 0, top: 0, bottom: 0, flip: false })
const active = ref(0)
const flash = ref<string | null>(null)

const mentionForms = computed(() => (props.mentions ?? []).map((m) => '@' + m.label))
const commandForms = computed(() => (props.commands ?? []).map((c) => '/' + c.label))
const segs = computed(() => segment(inputText.value, mentionForms.value, commandForms.value))
const popIndex = computed(() => {
  if (!flash.value) return -1
  return segs.value.findIndex((s) => s.kind !== 'text' && s.text.trim() === flash.value)
})

const results = computed<Row[]>(() => {
  if (!trigger.value) return []
  const q = trigger.value.query.toLowerCase()
  if (trigger.value.type === '@') {
    return (props.mentions ?? [])
      .filter((m) => m.label.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({ id: m.id, label: m.label, sublabel: m.sublabel, avatar: m.avatar }))
  }
  // / 命令 = 外部 commands + Skill 列表（按 label 去重，外部优先）
  const cmds: Row[] = [
    ...(props.commands ?? []).map((c) => ({ id: c.id, label: c.label, hint: c.hint, icon: c.icon })),
    ...skills.value.map((s) => ({ id: `skill:${s.name}`, label: s.name, hint: s.description, skill: s })),
  ]
  const seen = new Set<string>()
  return cmds
    .filter((c) => {
      if (seen.has(c.label)) return false
      seen.add(c.label)
      return c.label.toLowerCase().includes(q)
    })
    .slice(0, 6)
})

const menuStyle = computed(() => {
  const style: { left: string; transformOrigin: string; top?: string; bottom?: string } = {
    left: `${Math.max(8, menu.value.x)}px`,
    transformOrigin: menu.value.flip ? 'bottom left' : 'top left',
  }
  if (menu.value.flip) style.bottom = `${menu.value.bottom}px`
  else style.top = `${menu.value.top}px`
  return style
})

function refreshTrigger() {
  const ta = taRef.value
  if (!ta) return
  const caret = ta.selectionStart ?? 0
  const t = detectTrigger(ta.value, caret)
  trigger.value = t
  if (t) {
    // / 命令菜单数据源为 Skill 列表，打开时按 TTL 刷新
    if (t.type === '/') loadSkills()
    const c = caretCoords(ta, caret)
    const caretLineTop = c.y - ta.scrollTop
    const rect = ta.getBoundingClientRect()
    const lineBottomVp = rect.top + caretLineTop + c.lineHeight
    const flip = window.innerHeight - lineBottomVp < 252 && caretLineTop > 120
    menu.value = {
      x: c.x - ta.scrollLeft,
      top: caretLineTop + c.lineHeight + 6,
      bottom: ta.offsetHeight - caretLineTop + 6,
      flip,
    }
    active.value = 0
  }
}

// 文本更新后恢复待定光标位置（flush post：等 textarea DOM 同步后再设置选区）
watch(inputText, () => {
  if (pendingCaret != null && taRef.value) {
    const pos = pendingCaret
    pendingCaret = null
    taRef.value.focus()
    taRef.value.setSelectionRange(pos, pos)
    refreshTrigger()
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  if (flashTimer) window.clearTimeout(flashTimer)
})

function insert(choice: Row) {
  const ta = taRef.value
  if (!ta || !trigger.value) return
  const isCommand = trigger.value.type === '/'
  const caret = ta.selectionStart ?? 0
  const token = (isCommand ? '/' : '@') + choice.label
  const next = ta.value.slice(0, trigger.value.start) + token + ' ' + ta.value.slice(caret)
  pendingCaret = trigger.value.start + token.length + 1
  inputText.value = next
  trigger.value = null
  flash.value = token
  if (flashTimer) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (flash.value = null), 480)
  if (isCommand) emit('command', choice)
}

function initialsOf(label: string) {
  const parts = label.trim().split(/\s+/)
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts.slice(0, 2).map((w) => w[0]).join('')).toUpperCase()
}

const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']

function onKeyUp(e: KeyboardEvent) {
  if (e.isComposing) return
  if (trigger.value && results.value.length && NAV_KEYS.includes(e.key)) return
  refreshTrigger()
}

function onKeyDown(e: KeyboardEvent) {
  // 输入法组词期间的按键（含 Enter 确认）不参与导航与发送
  if (e.isComposing) return
  if (trigger.value && results.value.length) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      active.value = (active.value + 1) % results.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      active.value = (active.value - 1 + results.value.length) % results.value.length
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insert(results.value[active.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      trigger.value = null
      return
    }
  }
  // Enter 发送，Shift+Enter 换行（沿用聊天页交互）
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function onBlur() {
  window.setTimeout(() => (trigger.value = null), 120)
}

function onScroll(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  if (backdropRef.value) {
    backdropRef.value.scrollTop = ta.scrollTop
    backdropRef.value.scrollLeft = ta.scrollLeft
  }
}

// ===== 发送 =====
function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.isStreaming) return
  emit('send', text, images.value)
  inputText.value = ''
  images.value = []
}

// ===== 图片上传 =====
function handleImageUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      const base64 = await fileToBase64(file)
      images.value.push(base64)
    }
  }
  input.click()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

// ===== 工具列表 =====
const toolList = computed(() => props.tools ?? [])

const groupedTools = computed(() => {
  const groups = new Map<string, ToolDisplayItem[]>()
  for (const tool of toolList.value) {
    const list = groups.get(tool.category) ?? []
    list.push(tool)
    groups.set(tool.category, list)
  }
  return Array.from(groups.entries())
})

const enabledCount = computed(() => {
  return toolList.value.filter((t) => props.enabledTools?.[t.name] !== false).length
})

// ===== Skill 列表（/ 命令菜单数据源） =====
const skills = ref<SkillItem[]>([])
const copiedName = ref<string | null>(null)
const SKILL_TTL = 30_000
let skillsLoadedAt = 0

async function loadSkills(force = false) {
  if (!force && skillsLoadedAt && Date.now() - skillsLoadedAt < SKILL_TTL) return
  try {
    skills.value = await window.api.skill.list()
    skillsLoadedAt = Date.now()
  } catch {
    skills.value = []
  }
}

onMounted(() => {
  loadSkills()
  if (props.autoFocus && taRef.value) {
    const end = taRef.value.value.length
    taRef.value.focus()
    taRef.value.setSelectionRange(end, end)
  }
})

async function copySkillName(name: string) {
  try {
    await navigator.clipboard.writeText(name)
    copiedName.value = name
    setTimeout(() => {
      copiedName.value = null
    }, 1500)
  } catch { /* ignore */ }
}

// ===== Skill 编辑 =====
const editDialogOpen = ref(false)
const editForm = ref({ name: '', description: '', content: '' })
const editSaving = ref(false)

async function openEditDialog(name: string) {
  try {
    const skill: SkillFull | null = await window.api.skill.read(name)
    if (!skill) return
    editForm.value = {
      name: skill.name,
      description: skill.description,
      content: skill.content,
    }
    editDialogOpen.value = true
  } catch { /* ignore */ }
}

async function saveEdit() {
  if (!editForm.value.name.trim() || !editForm.value.description.trim()) return
  editSaving.value = true
  try {
    await window.api.skill.write(
      editForm.value.name,
      editForm.value.description,
      editForm.value.content,
    )
    editDialogOpen.value = false
    await loadSkills(true)
  } catch { /* ignore */ }
  editSaving.value = false
}

// ===== Skill 删除 =====
const deleteTarget = ref<SkillItem | null>(null)
const deleteConfirmOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (v: boolean) => {
    if (!v) deleteTarget.value = null
  },
})

function requestDelete(skill: SkillItem) {
  deleteTarget.value = skill
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleteTarget.value = null
  try {
    await window.api.skill.delete(target.name)
    await loadSkills(true)
  } catch { /* ignore */ }
}

// ===== 小组件 =====
const Kbd: FunctionalComponent<{ tone?: 'invert' }> = (props, { slots }) =>
  h('kbd', {
    class: [
      'inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-sans text-[10px] leading-none',
      props.tone === 'invert'
        ? 'border-current/25'
        : 'border-border bg-muted text-muted-foreground',
    ],
  }, slots.default?.())
</script>

<template>
  <div class="p-3">
    <div class="compose-root relative isolate w-full">
      <div aria-hidden="true" class="compose-ring pointer-events-none absolute -inset-[2px] -z-10 rounded-[18px] blur-[2px]" />

      <div class="relative rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(24,24,27,0.04),0_16px_40px_-24px_rgba(24,24,27,0.22)]">
        <!-- 图片预览 -->
        <div
          v-if="images.length"
          class="flex flex-wrap gap-2 px-4 pt-3"
        >
          <div
            v-for="(img, i) in images"
            :key="i"
            class="group relative"
          >
            <img
              :src="`data:image/png;base64,${img}`"
              class="h-12 w-12 rounded border object-cover"
            >
            <button
              class="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
              @click="removeImage(i)"
            >
              ×
            </button>
          </div>
        </div>

        <div class="relative">
          <!-- 背景高亮层：镜像 textarea 文本，高亮 @mention / /command -->
          <div
            ref="backdropRef"
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-3.5 text-transparent text-[15px] leading-[1.6] font-normal tracking-normal"
          >
            <template v-for="(s, i) in segs" :key="i">
              <span v-if="s.kind === 'text'">{{ s.text }}</span>
              <span
                v-else
                class="box-decoration-clone rounded-[5px] py-[3px] bg-muted"
                :class="i === popIndex ? 'compose-pop' : ''"
              >{{ s.text }}</span>
            </template>
            {{ '\n' }}
          </div>

          <textarea
            ref="taRef"
            v-model="inputText"
            rows="3"
            :disabled="disabled"
            :placeholder="placeholder"
            :aria-label="ariaLabel"
            role="combobox"
            :aria-expanded="Boolean(trigger && results.length)"
            :aria-controls="`${uid}-list`"
            :aria-activedescendant="trigger && results.length ? `${uid}-opt-${active}` : undefined"
            spellcheck
            class="compose-scroll relative block max-h-64 min-h-[104px] w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-[1.6] font-normal tracking-normal text-foreground caret-foreground outline-none placeholder:text-muted-foreground"
            @keydown="onKeyDown"
            @keyup="onKeyUp"
            @click="refreshTrigger"
            @scroll="onScroll"
            @blur="onBlur"
          />

          <!-- @ / / 触发菜单 -->
          <AnimatePresence>
            <Motion
              v-if="trigger && results.length"
              key="picker"
              as="ul"
              :id="`${uid}-list`"
              role="listbox"
              :initial="reduce ? { opacity: 0 } : { opacity: 0, y: menu.flip ? 6 : -6, scale: 0.97 }"
              :animate="reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }"
              :exit="reduce ? { opacity: 0 } : { opacity: 0, y: menu.flip ? 4 : -4, scale: 0.98 }"
              :transition="reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 620, damping: 36, mass: 0.6 }"
              class="compose-scroll absolute z-30 max-h-[236px] w-[236px] overflow-auto rounded-xl border border-border bg-popover/95 p-1 shadow-[0_10px_36px_-10px_rgba(24,24,27,0.3)] backdrop-blur-xl"
              :style="menuStyle"
            >
              <li
                v-for="(r, i) in results"
                :key="r.id"
                role="option"
                :id="`${uid}-opt-${i}`"
                :aria-selected="i === active"
                class="relative"
              >
                <Motion
                  v-if="i === active"
                  :layout-id="`${uid}-hl`"
                  class="absolute inset-0 rounded-lg bg-muted"
                  :transition="reduce ? { duration: 0 } : { type: 'spring', stiffness: 650, damping: 40, mass: 0.5 }"
                />
                <div
                  class="relative z-10 flex w-full cursor-default items-center gap-2.5 rounded-lg px-2 py-1.5 text-left"
                  @mouseenter="active = i"
                  @mousedown.prevent="insert(r)"
                >
                  <template v-if="trigger?.type === '@'">
                    <img
                      v-if="r.avatar"
                      :src="r.avatar"
                      alt=""
                      aria-hidden="true"
                      class="h-6 w-6 flex-none rounded-full object-cover ring-1 ring-border/50"
                    >
                    <span
                      v-else
                      class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-border/50"
                    >{{ initialsOf(r.label) }}</span>
                    <span class="min-w-0 flex-1 leading-tight">
                      <span class="block truncate text-[13px] font-medium text-foreground">{{ r.label }}</span>
                      <span
                        v-if="r.sublabel"
                        class="block truncate text-[11px] text-muted-foreground"
                      >{{ r.sublabel }}</span>
                    </span>
                  </template>
                  <template v-else>
                    <span class="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] bg-linear-to-b from-muted to-muted/70 text-foreground shadow-sm ring-1 ring-inset ring-border/60 [&_svg]:size-4">
                      <component :is="r.icon" v-if="r.icon" />
                      <span v-else class="font-mono text-[13px] font-medium">/</span>
                    </span>
                    <span class="min-w-0 flex-1 leading-tight">
                      <span class="block truncate text-[13px] font-medium text-foreground">{{ r.label }}</span>
                      <span
                        v-if="r.hint"
                        class="block truncate text-[11px] text-muted-foreground"
                      >{{ r.hint }}</span>
                    </span>
                  </template>
                  <!-- skill 行：复制/编辑/删除；普通行：回车提示 -->
                  <span
                    v-if="r.skill"
                    class="flex flex-none items-center gap-0.5 transition-opacity"
                    :class="i === active ? 'opacity-100' : 'opacity-0'"
                  >
                    <button
                      class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                      title="复制名称"
                      @mousedown.stop.prevent
                      @click.stop="copySkillName(r.skill.name)"
                    >
                      <component
                        :is="copiedName === r.skill.name ? Check : Copy"
                        class="size-3"
                        :class="copiedName === r.skill.name && 'text-green-500'"
                      />
                    </button>
                    <button
                      class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                      title="编辑"
                      @mousedown.stop.prevent
                      @click.stop="openEditDialog(r.skill.name)"
                    >
                      <Pencil class="size-3" />
                    </button>
                    <button
                      class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-destructive"
                      title="删除"
                      @mousedown.stop.prevent
                      @click.stop="requestDelete(r.skill)"
                    >
                      <Trash2 class="size-3" />
                    </button>
                  </span>
                  <span
                    v-else
                    class="flex-none transition-opacity"
                    :class="i === active ? 'opacity-100' : 'opacity-0'"
                  >
                    <Kbd>↵</Kbd>
                  </span>
                </div>
              </li>
            </Motion>
          </AnimatePresence>
        </div>

        <!-- 底部工具栏 -->
        <div class="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          <div class="flex items-center gap-1">
            <!-- 模型选择 -->
            <ModelSelector />

            <!-- 图片上传 -->
            <button
              type="button"
              class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              :disabled="isStreaming"
              :aria-label="'上传图片'"
              @click="handleImageUpload"
            >
              <ImagePlus class="size-4" />
            </button>

            <!-- 工具选择 -->
            <DropdownMenu v-if="toolList.length">
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  :disabled="isStreaming"
                >
                  <Wrench class="size-4" />
                  <span
                    v-if="enabledCount < toolList.length"
                    class="absolute -top-0.5 -right-0.5 text-[10px] font-medium text-amber-500"
                  >{{ enabledCount }}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                class="w-64 max-h-80 overflow-y-auto"
              >
                <DropdownMenuLabel class="flex items-center justify-between">
                  <span>工具列表</span>
                  <span class="text-xs font-normal text-muted-foreground">
                    {{ enabledCount }}/{{ toolList.length }}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <template
                  v-for="([category, categoryTools], gi) in groupedTools"
                  :key="category"
                >
                  <DropdownMenuLabel
                    v-if="gi > 0"
                    class="pt-1 text-xs text-muted-foreground"
                  >
                    {{ category }}
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    v-for="tool in categoryTools"
                    :key="tool.name"
                    class="flex items-center justify-between gap-3"
                    @select.prevent
                  >
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <span class="font-mono text-xs">{{ tool.name }}</span>
                      <span class="text-[11px] leading-tight text-muted-foreground">{{ tool.description }}</span>
                    </div>
                    <Switch
                      :model-value="enabledTools?.[tool.name] !== false"
                      class="shrink-0"
                      @update:model-value="emit('toggleTool', tool.name)"
                    />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator v-if="gi < groupedTools.length - 1" />
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div class="flex items-center gap-3">
            <span class="text-[11px] tabular-nums text-muted-foreground">{{ inputText.length }}</span>

            <!-- 停止 / 发送 -->
            <button
              v-if="isStreaming"
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-destructive px-3.5 py-2 text-[13px] font-semibold text-destructive-foreground shadow-sm transition-all duration-150 hover:bg-destructive/90 active:scale-[0.97]"
              @click="emit('stop')"
            >
              <Square class="size-3.5" />
              停止
            </button>
            <button
              v-else
              type="button"
              :disabled="!inputText.trim() || disabled"
              class="group inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
              @click="handleSend"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                class="transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <path
                  d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {{ submitLabel }}
              <span class="ml-0.5 hidden items-center gap-0.5 opacity-60 sm:inline-flex">
                <Kbd tone="invert">↵</Kbd>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑 Skill</DialogTitle>
          <DialogDescription>修改 Skill 的描述和内容，保存后立即生效。</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">名称</label>
            <input
              v-model="editForm.name"
              class="w-full rounded-md border bg-transparent px-3 py-1.5 font-mono text-sm"
              disabled
            >
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">描述</label>
            <input
              v-model="editForm.description"
              class="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">内容 (Markdown)</label>
            <textarea
              v-model="editForm.content"
              class="min-h-[200px] w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="editDialogOpen = false"
          >
            取消
          </Button>
          <Button
            :disabled="editSaving"
            @click="saveEdit"
          >
            <Loader2
              v-if="editSaving"
              class="mr-1 size-4 animate-spin"
            />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认 -->
    <AlertDialog v-model:open="deleteConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 Skill「{{ deleteTarget?.name }}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style>
@property --compose-a { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
@keyframes compose-spin { to { --compose-a: 360deg; } }
@keyframes compose-pop {
  0%   { box-shadow: 0 0 0 3px rgba(113,113,122,.16); }
  100% { box-shadow: 0 0 0 0 rgba(113,113,122,0); }
}
.compose-ring {
  opacity: 0;
  transition: opacity .5s ease;
  background: conic-gradient(from var(--compose-a),
    rgba(161,161,170,0)   0deg,
    rgba(161,161,170,.42)  60deg,
    rgba(212,212,216,.62) 108deg,
    rgba(161,161,170,0)   168deg,
    rgba(161,161,170,0)   360deg);
  /* 仅保留边缘环带：壁纸模式会把 --card 透明化，卡片背景不可靠遮挡光环 */
  padding: 3px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
.compose-root:focus-within .compose-ring {
  opacity: 1;
  animation: compose-spin 5s linear infinite;
}
.compose-pop { animation: compose-pop .5s ease-out; }
.compose-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(161,161,170,.28) transparent;
}
.compose-scroll:hover, .compose-scroll:focus {
  scrollbar-color: rgba(113,113,122,.5) transparent;
}
.compose-scroll::-webkit-scrollbar { width: 11px; height: 11px; }
.compose-scroll::-webkit-scrollbar-track { background: transparent; }
.compose-scroll::-webkit-scrollbar-thumb {
  background: rgba(161,161,170,.28);
  border: 4px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
  transition: background-color .2s ease;
}
.compose-scroll:hover::-webkit-scrollbar-thumb,
.compose-scroll:focus::-webkit-scrollbar-thumb {
  background: rgba(113,113,122,.5);
  background-clip: padding-box;
}
.compose-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(82,82,91,.65);
  background-clip: padding-box;
}
.dark .compose-scroll {
  scrollbar-color: rgba(228,228,231,.2) transparent;
}
.dark .compose-scroll:hover, .dark .compose-scroll:focus {
  scrollbar-color: rgba(228,228,231,.34) transparent;
}
.dark .compose-scroll::-webkit-scrollbar-thumb {
  background: rgba(228,228,231,.2);
  background-clip: padding-box;
}
.dark .compose-scroll:hover::-webkit-scrollbar-thumb,
.dark .compose-scroll:focus::-webkit-scrollbar-thumb {
  background: rgba(228,228,231,.34);
  background-clip: padding-box;
}
.dark .compose-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(244,244,245,.5);
  background-clip: padding-box;
}
@media (prefers-reduced-motion: reduce) {
  .compose-root:focus-within .compose-ring { animation: none; }
  .compose-pop { animation: none; }
}
</style>
