import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import LensWorkbench from '@/views/workbench/index.vue'
import PricingPage from '@/views/PricingPage.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    name: 'LensWorkbench',
    component: LensWorkbench,
  },
  {
    path: '/pricing',
    name: 'LensPricing',
    component: PricingPage,
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
