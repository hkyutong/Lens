import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import LensWorkbench from '@/views/workbench/index.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'LensWorkbench',
    component: LensWorkbench,
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
