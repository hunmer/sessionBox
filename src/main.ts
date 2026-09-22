import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/globals.css'
// Toaster 的 position: fixed 等定位样式在包内 CSS 中，缺失会导致 toast 进入文档流撑高页面
import 'vue-sonner/style.css'

const pinia = createPinia()
const app = createApp(App).use(pinia)

// 在首次渲染前应用主题，避免闪烁
import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
