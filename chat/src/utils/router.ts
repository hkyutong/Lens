import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import ChatView from '@/views/chat/chat.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'Chat',
    component: ChatView,
  },
  {
    path: '/:catchAll(.*)',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
