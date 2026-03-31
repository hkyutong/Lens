<script setup lang="ts">
import { fetchOrderBuyAPI, fetchOrderQueryAPI } from '@/api/order'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStore } from '@/store'
import { message } from '@/utils/message'
import { formatCurrency } from '@/utils/memberPricing'
import { ArrowLeft } from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ResData } from '@/api/types'
import alipay from '@/assets/alipay.png'
import wxpay from '@/assets/wxpay.png'
import QRCode from '@/components/common/QRCode/index.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['back-to-main', 'payment-success'])

const { isMobile } = useBasicLayout()
const authStore = useAuthStore()
const useGlobal = useGlobalStore()
const POLL_INTERVAL = 1000
const ms = message()
const active = ref(true)
const payType = ref('alipay')

/* 是否是微信环境 */
/* 是否是微信移动端环境 */
const isWxEnv = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()

  // 判断是否为微信环境
  const isWxBrowser =
    ua.match(/MicroMessenger/i) && ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger'

  // 判断是否为非PC端（即移动端）
  const isMobile = !ua.includes('windows') && !ua.includes('macintosh')

  // 返回是否是微信的移动端环境
  return isWxBrowser && isMobile
})

/* 开启的支付平台 */
const payPlatform = computed(() => {
  const {
    payHupiStatus,
    payEpayStatus,
    payMpayStatus,
    payWechatStatus,
    payLtzfStatus,
    payDuluPayStatus,
  } = authStore.globalConfig
  if (Number(payWechatStatus) === 1) return 'wechat'

  if (Number(payEpayStatus) === 1) return 'epay'

  if (Number(payMpayStatus) === 1) return 'mpay'

  if (Number(payHupiStatus) === 1) return 'hupi'

  if (Number(payLtzfStatus) === 1) return 'ltzf'

  if (Number(payDuluPayStatus) === 1) return 'dulu'

  return null
})

/* 支付平台开启的支付渠道 */
const payChannel = computed(() => {
  const { payEpayChannel, payMpayChannel, payDuluPayChannel } = authStore.globalConfig
  if (payPlatform.value === 'mpay') return payMpayChannel ? JSON.parse(payMpayChannel) : []

  if (payPlatform.value === 'epay') return payEpayChannel ? JSON.parse(payEpayChannel) : []

  if (payPlatform.value === 'wechat') return ['wxpay']

  if (payPlatform.value === 'hupi') return ['wxpay']

  if (payPlatform.value === 'ltzf') return ['wxpay']

  if (payPlatform.value === 'dulu') return payDuluPayChannel ? JSON.parse(payDuluPayChannel) : []

  return []
})

const plat = computed(() => {
  return payType.value === 'wxpay' ? t('pay.wechat') : t('pay.alipay')
})
const countdownRef = ref<ReturnType<typeof setInterval> | null>(null)
const remainingTime = ref(60)

const isRedirectPay = computed(() => {
  const { payEpayApiPayUrl, payDuluPayRedirect } = authStore.globalConfig
  return (
    (payPlatform.value === 'epay' && payEpayApiPayUrl.includes('submit')) ||
    payPlatform.value === 'mpay' ||
    (payPlatform.value === 'dulu' && payDuluPayRedirect === '1')
  )
})

// 倒计时函数
function startCountdown() {
  remainingTime.value = 300 // 5分钟倒计时
  if (!countdownRef.value) {
    countdownRef.value = setInterval(() => {
      remainingTime.value--
      if (remainingTime.value <= 0) {
        handleFinish()
      }
    }, 1000)
  }
}

// 倒计时结束处理
function handleFinish() {
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
  active.value = false
  ms.warning(t('pay.paymentTimeExpired'))
  backToMainView()
}

watch(payType, () => {
  if (!props.visible) return
  getQrCode()
  // 重新开始倒计时
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }
  startCountdown()
})

const orderId = ref('')
let timer: any
const payTypes = computed(() => {
  return [
    {
      label: t('pay.wechatPay'),
      value: 'wxpay',
      icon: wxpay,
      payChannel: 'wxpay',
    },
    {
      label: t('pay.alipayPay'),
      value: 'alipay',
      icon: alipay,
      payChannel: 'alipay',
    },
  ].filter(item => payChannel.value.includes(item.payChannel))
})

function getPreferredPayType() {
  if (payTypes.value.some(item => item.value === 'alipay')) return 'alipay'
  if (payTypes.value.some(item => item.value === 'wxpay')) return 'wxpay'
  return payTypes.value[0]?.value || 'alipay'
}

function syncPreferredPayType() {
  const preferred = getPreferredPayType()
  const changed = payType.value !== preferred
  payType.value = preferred
  return changed
}

const queryOrderStatus = async () => {
  if (!orderId.value) return
  const result: ResData = await fetchOrderQueryAPI({ orderId: orderId.value })
  const { success, data } = result
  if (success) {
    const { status } = data
    if (status === 1) {
      stopPolling()
      ms.success(t('pay.paymentSuccess'))
      active.value = false
      authStore.getUserInfo()

      // 支付成功后通知父组件
      emit('payment-success')
    }
  }
}

const orderInfo = computed(() => useGlobal?.orderInfo)
const billingInfo = computed(() => orderInfo.value?.billing)
const url_qrcode = ref('')
const qrCodeloading = ref(true)
const redirectloading = ref(true)
const redirectUrl = ref('')

// 返回主视图
function backToMainView() {
  cleanupResources()
  emit('back-to-main')
}

/* 请求二维码 */
async function getQrCode() {
  !isRedirectPay.value && (qrCodeloading.value = true)
  isRedirectPay.value && (redirectloading.value = true)
  let qsPayType = null
  qsPayType = payType.value
  if (payPlatform.value === 'wechat') qsPayType = isWxEnv.value ? 'jsapi' : 'native'

  try {
    const res: ResData = await fetchOrderBuyAPI({
      goodsId: orderInfo.value.pkgInfo.id,
      payType: qsPayType,
      billingCycle: orderInfo.value.billingCycle,
    })
    const { data, success } = res
    if (!success) {
      return
    }

    const { url_qrcode: code, orderId: id, redirectUrl: url } = data
    redirectUrl.value = url
    orderId.value = id
    url_qrcode.value = code
    qrCodeloading.value = false
    redirectloading.value = false
  } catch (error) {
    backToMainView()
    qrCodeloading.value = false
    redirectloading.value = false
  }
}

/* 跳转支付 */
function handleRedPay() {
  window.open(redirectUrl.value)
}

// 清理所有资源
function cleanupResources() {
  // 停止轮询
  stopPolling()

  // 清理倒计时
  if (countdownRef.value) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }

  // 清理其他资源
  url_qrcode.value = ''
  orderId.value = ''
  active.value = false
}

async function handleOpenPayment() {
  const payTypeChanged = syncPreferredPayType()
  if (payTypeChanged) return

  await getQrCode()
  if (!timer) {
    // 检查定时器是否已存在
    timer = setInterval(() => {
      queryOrderStatus()
    }, POLL_INTERVAL)
  }

  // 启动倒计时
  startCountdown()
}

// 清除定时器的函数
function stopPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null // 清除定时器后将变量设置为 null
  }
}

// 监听visible变化，处理资源
watch(
  () => props.visible,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      // 变为可见时
      active.value = true
      handleOpenPayment()
    } else if (!newVal && oldVal) {
      // 变为不可见时
      cleanupResources()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    handleOpenPayment()
  }
})

onBeforeUnmount(() => {
  cleanupResources()
})
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-2" :class="{ 'max-h-[70vh]': !isMobile }">
    <div
      class="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4"
    >
      <!-- 卡片标题 -->
      <div class="flex items-center mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <button @click="backToMainView" class="btn-icon btn-md mr-2">
          <ArrowLeft size="18" />
        </button>
        <div class="text-base font-semibold text-gray-900 dark:text-gray-100">
          {{ t('pay.productPayment') }}
        </div>
      </div>

      <div class="p-2">
        <div
          class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div class="text-sm font-medium text-gray-500 dark:text-gray-400">
                {{ t('pay.amountDue') }}
              </div>
              <div class="mt-1 flex items-baseline gap-2">
                <span class="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  ￥{{ formatCurrency(billingInfo?.price || 0) }}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {{ orderInfo.billingCycle === 'annual' ? '/年' : '/月' }}
                </span>
              </div>
            </div>
            <div
              class="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {{ orderInfo.billingCycle === 'annual' ? '按年支付' : '按月支付' }}
            </div>
          </div>

          <div class="mt-4 grid gap-2 text-sm text-gray-600 dark:text-gray-300">
            <div class="flex justify-between gap-4">
              <span class="font-medium">套餐</span>
              <span>{{ orderInfo.pkgInfo?.name }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="font-medium">计费</span>
              <span>{{ orderInfo.billingCycle === 'annual' ? '一年' : '一个月' }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="font-medium">有效期</span>
              <span>{{ billingInfo?.days > 0 ? `${billingInfo.days} 天` : '长期权益' }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="font-medium">折合每月</span>
              <span>￥{{ formatCurrency(billingInfo?.monthlyEquivalentPrice || 0) }}/月</span>
            </div>
            <div v-if="orderInfo.billingCycle === 'annual'" class="flex justify-between gap-4">
              <span class="font-medium">按月购买</span>
              <span class="text-gray-400 line-through dark:text-gray-500">
                ￥{{ formatCurrency(billingInfo?.originalTotal || 0) }}/年
              </span>
            </div>
            <div v-if="orderInfo.billingCycle === 'annual'" class="flex justify-between gap-4">
              <span class="font-medium">节省</span>
              <span class="font-semibold text-emerald-600 dark:text-emerald-300">
                ￥{{ formatCurrency(billingInfo?.saveAmount || 0) }}
              </span>
            </div>
          </div>
        </div>

        <div
          class="flex justify-center"
          :class="[isMobile ? 'flex-col' : 'flex-row', isRedirectPay ? 'flex-row-reverse' : '']"
        >
          <div>
            <div class="flex items-center justify-center my-3 relative">
              <!-- 微信登录风格的加载动画 -->
              <div
                v-if="qrCodeloading && !isRedirectPay"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
              <div
                v-if="qrCodeloading"
                class="w-[240px] h-[240px] rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <!-- epay -->
              <QRCode
                v-if="
                  payPlatform === 'epay' && !qrCodeloading && !redirectloading && !isRedirectPay
                "
                :value="url_qrcode"
                :size="240"
              />
              <QRCode
                v-if="
                  payPlatform === 'dulu' && !qrCodeloading && !redirectloading && !isRedirectPay
                "
                :value="url_qrcode"
                :size="240"
              />
              <img
                v-if="payType === 'wxpay' && !qrCodeloading && !isRedirectPay"
                :src="wxpay"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 bg-[#fff]"
              />
              <img
                v-if="payType === 'alipay' && !qrCodeloading && !isRedirectPay"
                :src="alipay"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 bg-[#fff]"
              />

              <!-- wechat -->
              <QRCode
                v-if="payPlatform === 'wechat' && !qrCodeloading"
                :value="url_qrcode"
                :size="240"
              />

              <div
                v-if="isRedirectPay"
                class="flex flex-col"
                :class="[isRedirectPay && isMobile ? 'ml-0' : 'ml-20']"
              >
                <span class="mb-10 mt-5 text-base">{{ t('pay.siteAdminEnabledRedirect') }}</span>

                <!-- mapy 跳转支付 -->
                <button
                  v-if="isRedirectPay"
                  type="button"
                  class="inline-flex h-12 items-center justify-center rounded-[999px] bg-[#080808] px-8 text-[15px] font-medium text-white shadow-[0_8px_20px_rgba(8,8,8,0.12)] transition hover:bg-[#1b1b1b] disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="redirectloading"
                  @click="handleRedPay"
                >
                  {{ t('pay.clickToPay') }}
                </button>
              </div>

              <!-- dulu -->
              <!-- <iframe
                v-if="payPlatform === 'dulu' && !redirectloading"
                class="w-[280px] h-[280px] scale-90"
                :src="url_qrcode"
                frameborder="0"
              /> -->

              <!-- hupi -->
              <iframe
                v-if="payPlatform === 'hupi' && !redirectloading"
                class="w-[280px] h-[280px] scale-90"
                :src="url_qrcode"
                frameborder="0"
              />

              <!-- ltzf -->
              <img
                v-if="payPlatform === 'ltzf' && !redirectloading"
                :src="url_qrcode"
                class="w-[280px] h-[280px] scale-90"
                alt="QRCode"
              />
            </div>
            <span v-if="!isRedirectPay" class="flex items-center justify-center text-lg">
              {{ t('pay.open') }} {{ plat }} {{ t('pay.scanToPay') }}
            </span>
          </div>
          <div class="flex flex-col" :class="[isMobile ? 'w-full ' : ' ml-10 w-[200] ']">
            <div
              class="flex items-center justify-center mt-6 w-full font-bold text-sm"
              :class="[isMobile ? 'mb-2' : 'mb-10']"
              style="white-space: nowrap"
            >
              <span>{{ t('pay.completePaymentWithin') }}</span>
              <span class="inline-block w-16 text-primary-500 text-center">
                {{ remainingTime }}秒
              </span>
              <span>{{ t('pay.timeToCompletePayment') }}</span>
            </div>
            <!-- 支付方式选择区域 -->
            <div class="mt-6 space-y-6">
              <div
                v-if="payTypes.length === 1"
                class="flex items-center rounded-[18px] border border-[var(--paper-border)] bg-[var(--surface-panel)] px-4 py-3"
              >
                <img class="mr-2 inline-block h-4 object-contain" :src="payTypes[0].icon" alt="" />
                <span class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300">
                  {{ payTypes[0].label }}
                </span>
              </div>
              <div v-else v-for="pay in payTypes" :key="pay.value" class="flex items-center">
                <input
                  type="radio"
                  :id="pay.value"
                  name="payment-method"
                  :value="pay.value"
                  v-model="payType"
                  class="h-4 w-4 border-gray-300 text-[#080808] focus:ring-black/20"
                />
                <label
                  :for="pay.value"
                  class="ml-3 block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300"
                >
                  <img class="mr-2 inline-block h-4 object-contain" :src="pay.icon" alt="" />
                  {{ pay.label }}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}
</style>
