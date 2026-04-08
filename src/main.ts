import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/globals.css'

createApp(App).use(createPinia()).mount('#app')
