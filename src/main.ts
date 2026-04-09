import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/globals.css'

const pinia = createPinia()
const app = createApp(App).use(pinia)

// 在首次渲染前应用主题，避免闪烁
import { useThemeStore } from './stores/theme'
useThemeStore()

app.mount('#app')
