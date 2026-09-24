import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import ProfileSelector from './components/ProfileSelector.vue'
import './styles/globals.css'
// Toaster 的 position: fixed 等定位样式在包内 CSS 中，缺失会导致 toast 进入文档流撑高页面
import 'vue-sonner/style.css'

const pinia = createPinia()
// Profiles 选择页进程（--profile-selector）：挂载轻量选择页而不是完整浏览器 UI
const isProfileSelector = new URLSearchParams(window.location.search).get('view') === 'profile-selector'
const app = createApp(isProfileSelector ? ProfileSelector : App).use(pinia)

// 在首次渲染前应用主题，避免闪烁
import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
