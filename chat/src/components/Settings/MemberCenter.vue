<script setup lang="ts">
import { fetchGetPackageAPI, fetchUseCramiAPI } from '@/api/crami'
import { fetchOrderBuyAPI } from '@/api/order'
import { fetchSignInAPI, fetchSignLogAPI } from '@/api/signin'
import { fetchGetJsapiTicketAPI } from '@/api/user'
import { t } from '@/locales'
import type { ResData } from '@/api/types'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { message } from '@/utils/message'
import { formatCurrency, hydrateBillingOptions } from '@/utils/memberPricing'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { BillingCycle, BillingOption } from '@/types/billing'
import MemberPayment from './MemberPayment.vue'

const props = defineProps<Props>()

declare let WeixinJSBridge: any
declare let wx: any

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const loading = ref(true)
const packageList = ref<Pkg[]>([])
const ms = message()
const dialogLoading = ref(false)
const model3Name = computed(() => authStore.globalConfig.model3Name || t('goods.basicModelQuota'))
const model4Name = computed(
  () => authStore.globalConfig.model4Name || t('goods.advancedModelQuota')
)
const drawMjName = computed(() => authStore.globalConfig.drawMjName || t('goods.drawingQuota'))
const isHideModel3Point = computed(() => Number(authStore.globalConfig.isHideModel3Point) === 1)
const isHideModel4Point = computed(() => Number(authStore.globalConfig.isHideModel4Point) === 1)
const isHideDrawMjPoint = computed(() => Number(authStore.globalConfig.isHideDrawMjPoint) === 1)
const isWxEnv = computed(() => {
  const ua = window.navigator.userAgent.toLowerCase()
  return ua.match(/MicroMessenger/i) && ua?.match(/MicroMessenger/i)?.[0] === 'micromessenger'
})
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

  if (Number(payMpayStatus) === 1) return 'mpay'

  if (Number(payHupiStatus) === 1) return 'hupi'

  if (Number(payEpayStatus) === 1) return 'epay'

  if (Number(payLtzfStatus) === 1) return 'ltzf'

  if (Number(payDuluPayStatus) === 1) return 'dulu'

  return null
})

const payChannel = computed(() => {
  const { payEpayChannel, payMpayChannel } = authStore.globalConfig
  if (payPlatform.value === 'mpay') return payMpayChannel ? JSON.parse(payMpayChannel) : []

  if (payPlatform.value === 'epay') return payEpayChannel ? JSON.parse(payEpayChannel) : []

  if (payPlatform.value === 'wechat') return ['wxpay']

  if (payPlatform.value === 'hupi') return ['hupi']

  if (payPlatform.value === 'dulu') return ['dulu']

  if (payPlatform.value === 'ltzf') return ['wxpay']

  return []
})

interface Props {
  visible: boolean
}

interface PlanPreset {
  planKey: 'plus' | 'pro' | 'max'
  displayName: string
  monthlyUsd: number
}

const OFFICIAL_PLAN_ALIASES: Record<PlanPreset['planKey'], string[]> = {
  plus: ['plus', '轻用版', 'go'],
  pro: ['pro', '专业版'],
  max: ['max', '旗舰版'],
}

type PlanFeatureKey =
  | 'basicModels'
  | 'advancedModelsLite'
  | 'advancedModels'
  | 'allModels'
  | 'paperSummary'
  | 'englishPolish'
  | 'pdfDeepRead'
  | 'latexTranslation'
  | 'bibtex'
  | 'fullResearchTools'
  | 'complexReasoning'
  | 'specialModels'

interface Pkg {
  id: number
  name: string
  coverImg: string
  des: string
  price: number
  model3Count: number
  model4Count: number
  drawMjCount: number
  extraReward: number
  extraPaintCount: number
  days: number
  createdAt: Date
  annualDiscountRate?: number
  recommendedBillingCycle?: BillingCycle
  billingOptions: Record<BillingCycle, BillingOption>
}

const billingCycle = ref<BillingCycle>('monthly')

function normalizePlanName(name?: string) {
  return (name || '').trim().toLowerCase()
}

function resolvePlanKeyByName(name?: string): PlanPreset['planKey'] | null {
  const normalized = normalizePlanName(name)
  if (!normalized) return null

  for (const [planKey, aliases] of Object.entries(OFFICIAL_PLAN_ALIASES) as Array<
    [PlanPreset['planKey'], string[]]
  >) {
    if (aliases.some(alias => normalizePlanName(alias) === normalized)) return planKey
  }

  return null
}

function getPlusPreset(): PlanPreset {
  return {
    planKey: 'plus',
    displayName: t('lens.member.plus'),
    monthlyUsd: 6,
  }
}

function getProfessionalPreset(): PlanPreset {
  return {
    planKey: 'pro',
    displayName: t('lens.member.pro'),
    monthlyUsd: 20,
  }
}

function getMaxPreset(): PlanPreset {
  return {
    planKey: 'max',
    displayName: t('lens.member.max'),
    monthlyUsd: 30,
  }
}

function roundDisplayPrice(value: number) {
  return Math.round(value * 100) / 100
}

const sortedPackages = computed(() =>
  [...packageList.value]
    .sort((a, b) => {
      const aPrice = Number(a.billingOptions?.monthly?.price ?? a.price ?? 0)
      const bPrice = Number(b.billingOptions?.monthly?.price ?? b.price ?? 0)
      return aPrice - bPrice
    })
)

const displayPackages = computed(() => {
  const officialKeys = new Set<PlanPreset['planKey']>()
  const official: Pkg[] = []
  const custom: Pkg[] = []

  for (const item of sortedPackages.value) {
    const planKey = resolvePlanKeyByName(item.name)
    if (planKey && !officialKeys.has(planKey)) {
      official.push(item)
      officialKeys.add(planKey)
      continue
    }
    custom.push(item)
  }

  return [...official, ...custom]
})

function getPlanPreset(pkg: Pkg): PlanPreset | null {
  const namedPlan = resolvePlanKeyByName(pkg.name)
  if (namedPlan === 'plus') return getPlusPreset()
  if (namedPlan === 'pro') return getProfessionalPreset()
  if (namedPlan === 'max') return getMaxPreset()
  return null
}

function getBillingOption(pkg: Pkg) {
  return pkg.billingOptions?.[billingCycle.value] ?? pkg.billingOptions.monthly
}

function getDisplayBilling(pkg: Pkg) {
  return getBillingOption(pkg)
}

function buildOrderInfo(pkg: Pkg) {
  const billing = getDisplayBilling(pkg)
  const preset = getPlanPreset(pkg)
  return {
    pkgInfo: {
      ...pkg,
      name: preset?.displayName || pkg.name,
    },
    billingCycle: billing.billingCycle,
    billing,
  }
}

function formatQuota(value: number) {
  return value > 99999 ? '无限额度' : value
}

function getDisplayPlanName(pkg: Pkg) {
  return getPlanPreset(pkg)?.displayName || pkg.name
}

function getPlanSummary(pkg: Pkg) {
  const preset = getPlanPreset(pkg)
  if (!preset) return pkg.des || ''
  return t(`lens.member.${preset.planKey}Summary`)
}

function getPlanFeatureKeys(pkg: Pkg): PlanFeatureKey[] {
  const preset = getPlanPreset(pkg)
  if (!preset) return []

  if (preset.planKey === 'plus') {
    return ['basicModels', 'advancedModelsLite', 'specialModels', 'paperSummary', 'englishPolish']
  }

  if (preset.planKey === 'pro') {
    return ['basicModels', 'advancedModels', 'specialModels', 'pdfDeepRead', 'latexTranslation', 'bibtex']
  }

  return ['allModels', 'specialModels', 'fullResearchTools', 'complexReasoning']
}

function getPlanFeatureLabels(pkg: Pkg) {
  return getPlanFeatureKeys(pkg).map(key => t(`lens.member.features.${key}`))
}

function getDisplayPriceValue(pkg: Pkg) {
  const preset = getPlanPreset(pkg)
  if (!preset) return formatCurrency(getDisplayBilling(pkg).price)

  if (billingCycle.value === 'annual') {
    const annualDiscountRate = Number(getDisplayBilling(pkg).discountRate || 0)
    return formatCurrency(
      roundDisplayPrice(preset.monthlyUsd * 12 * (1 - annualDiscountRate / 100))
    )
  }

  return formatCurrency(preset.monthlyUsd)
}

function getDisplayPricePrefix(pkg: Pkg) {
  return getPlanPreset(pkg) ? '$' : '¥'
}

function getDisplayPriceCurrencyLabel(pkg: Pkg) {
  return getPlanPreset(pkg) ? 'USD /' : 'CNY /'
}

function getDisplayPricePeriodLabel() {
  return (billingCycle.value === 'annual'
    ? t('lens.member.pricePerYear')
    : t('lens.member.pricePerMonth')
  ).replace(/^\//, '')
}

onMounted(() => {
  if (props.visible) {
    // 组件挂载时检查登录状态
    if (checkLoginStatus()) {
      openDrawerAfter()
      if (isWxEnv.value) jsapiInitConfig()
    }
  }
})

// 二级页面控制
const activeView = ref('main') // 'main'或'payment'
const selectedPackage = ref<Pkg | null>(null)

// 切换到支付页面
function showPaymentView(pkg: Pkg) {
  selectedPackage.value = pkg
  useGlobalStore.updateOrderInfo(buildOrderInfo(pkg))
  activeView.value = 'payment'
}

// 返回主视图
function backToMainView() {
  activeView.value = 'main'
  selectedPackage.value = null
}

// 处理支付成功
function handlePaymentSuccess() {
  ms.success(t('goods.purchaseSuccess'))
  activeView.value = 'main'
  selectedPackage.value = null

  // 刷新用户信息
  authStore.getUserInfo()

  // 关闭设置对话框
  setTimeout(() => {
    useGlobalStore.updateSettingsDialog(false)
  }, 2000)
}

onBeforeUnmount(() => {
  packageList.value = []
  loading.value = true

  // 确保返回主视图，清理资源
  activeView.value = 'main'
  selectedPackage.value = null
})

/* 微信环境jsapi注册 */
async function jsapiInitConfig() {
  const url = window.location.href.replace(/#.*$/, '')
  const res = (await fetchGetJsapiTicketAPI({ url })) as ResData
  const { appId, nonceStr, timestamp, signature } = res.data
  if (!appId) return

  wx.config({
    debug: false,
    appId,
    timestamp,
    nonceStr,
    signature,
    jsApiList: ['chooseWXPay'],
  })
  wx.ready(() => {})
  wx.error(() => {})
}

function onBridgeReady(data: {
  appId: string
  timeStamp: string
  nonceStr: string
  package: string
  signType: string
  paySign: string
}) {
  const { appId, timeStamp, nonceStr, package: pkg, signType, paySign } = data
  WeixinJSBridge.invoke(
    'getBrandWCPayRequest',
    {
      appId,
      timeStamp,
      nonceStr,
      package: pkg,
      signType,
      paySign,
    },
    (res: any) => {
      if (res.err_msg === 'get_brand_wxpay_request:ok') {
        ms.success(t('goods.purchaseSuccess'))
        setTimeout(() => {
          authStore.getUserInfo()
        }, 500)
      } else {
        ms.success(t('goods.paymentNotSuccessful'))
      }
    }
  )
}

async function handleBuyGoods(pkg: Pkg) {
  if (dialogLoading.value) return
  const orderInfo = buildOrderInfo(pkg)
  useGlobalStore.updateOrderInfo(orderInfo)

  // 判断是否是微信移动端环境
  function isWxMobileEnv() {
    const ua = window.navigator.userAgent.toLowerCase()
    // 微信环境
    const isWxEnv = ua.indexOf('micromessenger') !== -1
    // 非PC端
    const isMobile = ua.indexOf('windows') === -1 && ua.indexOf('macintosh') === -1
    return isWxEnv && isMobile
  }

  // 如果是微信环境判断有没有开启微信支付，开启了则直接调用jsapi支付即可
  if (
    isWxMobileEnv() &&
    payPlatform.value === 'wechat' &&
    Number(authStore.globalConfig.payWechatStatus) === 1
  ) {
    if (typeof WeixinJSBridge == 'undefined') {
      // 使用事件监听器而不是直接传递回调函数
      const bridgeReadyHandler = () => {
        // 在回调中使用onBridgeReady函数处理支付
        const handlePayment = async () => {
          const res: ResData = await fetchOrderBuyAPI({
            goodsId: pkg.id,
            payType: 'jsapi',
            billingCycle: orderInfo.billingCycle,
          })
          const { success, data } = res
          if (success) onBridgeReady(data)
        }
        handlePayment()
      }

      if (document.addEventListener) {
        document.addEventListener('WeixinJSBridgeReady', bridgeReadyHandler as EventListener, false)
      }
    } else {
      const res: ResData = await fetchOrderBuyAPI({
        goodsId: pkg.id,
        payType: 'jsapi',
        billingCycle: orderInfo.billingCycle,
      })
      const { success, data } = res
      success && onBridgeReady(data)
    }
    return
  }

  /* 其他场景打开支付窗口 */
  useGlobalStore.updateOrderInfo(orderInfo)
}

async function openDrawerAfter() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  loading.value = true
  try {
    // 清空当前套餐列表，避免显示旧数据
    packageList.value = []
    // 获取用户最新余额信息
    await authStore.getUserInfo()
    // 获取套餐列表
    const res: ResData = await fetchGetPackageAPI({ status: 1, type: 1, size: 30 })
    packageList.value = (res.data.rows || []).map((item: Pkg) => hydrateBillingOptions(item))
    if (!selectName.value && displayPackages.value.length) {
      selectName.value = displayPackages.value[0].name
    }
    // 获取签到记录
    await getSigninLog()
    loading.value = false
  } catch (error) {
    loading.value = false
    console.error('加载升级套餐数据失败:', error)
  }
}

const selectName = ref('')
const handleSelect = (item: { name: string }) => {
  selectName.value = item.name
  cramiSelect.value = false
}

function handleSuccess(pkg: Pkg) {
  // 检查支付渠道是否启用
  if (!payChannel.value.length) {
    ms.warning(t('goods.paymentNotEnabled'))
    return
  }

  // 微信移动端环境需要特殊处理
  if (
    isWxEnv.value &&
    payPlatform.value === 'wechat' &&
    Number(authStore.globalConfig.payWechatStatus) === 1
  ) {
    // 直接处理JSAPI支付
    handleBuyGoods(pkg)
    return
  }

  // 其他情况切换到支付视图
  showPaymentView(pkg)
}

const code = ref('')
const cramiSelect = ref(false)
async function useCrami() {
  if (!code.value.trim()) {
    ms.info(t('usercenter.pleaseEnterCardDetails'))
    return
  }

  try {
    loading.value = true
    await fetchUseCramiAPI({ code: code.value })
    ms.success(t('usercenter.cardRedeemSuccess'))
    authStore.getUserInfo()
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  } catch (error: any) {
    loading.value = false
    // 清空卡密输入框
    code.value = ''
  }
}

// 由于globalConfig可能没有showCrami属性，这里默认为true显示卡密兑换
const showCrami = ref(true)

// 签到相关状态和方法
const signInData = ref<{ signInDate: string; isSigned: boolean }[]>([])
const signInLoading = ref(false)
const today = new Date().toISOString().split('T')[0]

const days = computed(() => {
  return signInData.value.map(item => ({
    ...item,
    day: item.signInDate.split('-').pop()?.replace(/^0/, ''),
    isToday: item.signInDate === today,
  }))
})

const consecutiveDays = computed(() => authStore.userInfo.consecutiveDays || 0)
const signInModel3Count = computed(() => Number(authStore.globalConfig?.signInModel3Count) || 0)
const signInModel4Count = computed(() => Number(authStore.globalConfig?.signInModel4Count) || 0)
const signInMjDrawToken = computed(() => Number(authStore.globalConfig?.signInMjDrawToken) || 0)

const hasSignedInToday = computed(() => {
  return signInData.value.some(item => item.signInDate === today && item.isSigned)
})

async function getSigninLog() {
  try {
    const res: ResData = await fetchSignLogAPI()
    if (res.success) {
      signInData.value = res.data || []
    }
  } catch (error) {
    console.error('加载签到数据失败:', error)
  }
}

async function handleSignIn() {
  try {
    signInLoading.value = true
    const res: ResData = await fetchSignInAPI()
    if (res.success) {
      ms.success('签到成功！')
      await getSigninLog()
      authStore.getUserInfo()
    }
    signInLoading.value = false
  } catch (error) {
    signInLoading.value = false
    console.error('签到失败:', error)
  }
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

// 获取用户信息和余额
const userBalance = computed(() => authStore.userBalance)
const isMember = computed(() => userBalance.value.isMember || false)

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 登录检测函数
function checkLoginStatus() {
  console.log('升级套餐 - 检查登录状态:', isLogin.value)
  if (!isLogin.value) {
    console.log('用户未登录，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('请先登录后使用升级套餐')
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

// 监听登录状态变化
watch(isLogin, newLoginStatus => {
  console.log('升级套餐 - 登录状态变化:', newLoginStatus)
  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {
    console.log('用户已登出，关闭设置弹窗并打开登录弹窗')
    // 显示消息提醒
    ms.warning('账户已登出，请重新登录后查看')
    useGlobalStore.updateSettingsDialog(false)
    authStore.setLoginDialog(true)
  }
})

// 添加对visible属性的监听，确保组件可见时重新加载数据
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        openDrawerAfter()
        if (isWxEnv.value) jsapiInitConfig()
      }
    }
  }
)
</script>

<template>
  <div class="h-full overflow-y-auto custom-scrollbar p-1">
    <!-- 主视图 -->
    <div v-if="activeView === 'main'">
      <!-- 套餐列表卡片 -->
      <div
        class="mb-5 flex flex-col space-y-6 rounded-[28px] border border-[var(--paper-border)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-panel)]"
      >
        <div
          class="mb-1 flex flex-col gap-3 border-b border-[var(--paper-border)] pb-4 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <div class="text-[18px] font-semibold text-[var(--text-main)]">
              {{ t('lens.member.planList') }}
            </div>
            <div class="mt-1 text-sm text-[var(--text-sub)]">
              {{ t('lens.member.planSubtitle') }}
            </div>
          </div>

          <div
            class="inline-flex items-center self-start rounded-full border border-[var(--paper-border)] bg-[var(--surface-panel)] p-1.5"
          >
            <button
              type="button"
              :class="[
                billingCycle === 'monthly'
                  ? 'bg-[var(--surface-card)] text-[var(--text-main)] shadow-[var(--shadow-soft)]'
                  : 'text-[var(--text-sub)]',
                'rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
              ]"
              @click="billingCycle = 'monthly'"
            >
              {{ t('lens.member.monthly') }}
            </button>
            <button
              type="button"
              :class="[
                billingCycle === 'annual'
                  ? 'bg-[var(--surface-card)] text-[var(--text-main)] shadow-[var(--shadow-soft)]'
                  : 'text-[var(--text-sub)]',
                'rounded-full px-5 py-2.5 text-sm font-medium transition-colors',
              ]"
              @click="billingCycle = 'annual'"
            >
              <span>{{ t('lens.member.annual') }}</span>
              <span
                class="ml-2 inline-flex rounded-full bg-[var(--text-main)] px-2.5 py-1 text-[10px] font-semibold leading-none text-[var(--bg-body)]"
              >
                {{ t('lens.member.annualBetter') }}
              </span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          <div
            v-for="(item, index) in displayPackages"
            :key="index"
            :class="[
              item.name == selectName
                ? 'border-[var(--text-main)] shadow-[var(--shadow-panel)]'
                : 'border-[var(--paper-border)] shadow-[var(--shadow-soft)]',
              'flex h-full min-h-[520px] flex-col rounded-[28px] border bg-[var(--surface-card)] p-7 transition-all hover:shadow-[var(--shadow-panel)]',
            ]"
            @click="handleSelect(item)"
          >
            <div class="relative">
              <b class="text-[25px] font-medium leading-[1.08] text-[var(--text-main)]">
                {{ getDisplayPlanName(item) }}
              </b>
            </div>

            <div class="mt-6">
              <div class="flex items-end gap-1">
                <span class="mb-[10px] text-[16px] font-normal leading-none text-[var(--text-sub)]">
                  {{ getDisplayPricePrefix(item) }}
                </span>
                <span class="text-[46px] font-medium leading-none tracking-[-0.045em] text-[var(--text-main)]">
                  {{ getDisplayPriceValue(item) }}
                </span>
                <span class="mb-[7px] ml-1 flex flex-col text-[12px] font-normal leading-[1.1] text-[var(--text-sub)]">
                  <span>{{ getDisplayPriceCurrencyLabel(item) }}</span>
                  <span>{{ getDisplayPricePeriodLabel() }}</span>
                </span>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span v-if="billingCycle === 'annual'" class="font-medium text-[var(--text-sub)]">
                  {{ t('lens.member.annualSave', { value: getDisplayBilling(item).discountRate }) }}
                </span>
              </div>
            </div>

            <p class="mt-5 min-h-[84px] max-w-[34ch] text-[15px] leading-7 text-[var(--text-sub)]">
              {{ getPlanSummary(item) }}
            </p>

            <div class="mt-7">
              <button
                @click.stop="handleSuccess(item)"
                class="inline-flex w-full items-center justify-center rounded-[999px] bg-[var(--btn-bg-primary)] px-6 py-3 text-[15px] font-medium text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
              >
                {{ t('lens.member.openNow') }}
              </button>
            </div>

            <div class="mt-8 space-y-4 border-t border-[var(--paper-border)] pt-6">
              <div
                v-for="feature in getPlanFeatureLabels(item)"
                :key="feature"
                class="flex items-start gap-3"
              >
                <span
                  class="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--paper-border)] bg-[var(--surface-panel)] text-[11px] font-semibold text-[var(--text-main)]"
                >
                  ✦
                </span>
                <span class="text-[15px] leading-7 text-[var(--text-main)]">{{ feature }}</span>
              </div>
            </div>

            <div class="mt-auto space-y-3 border-t border-[var(--paper-border)] pt-6">
              <div v-if="!isHideModel3Point" class="flex items-end justify-between gap-4">
                <span class="text-sm font-medium text-[var(--text-sub)]">{{ model3Name }}</span>
                <span class="text-base font-semibold text-[var(--text-main)]">
                  {{ formatQuota(getDisplayBilling(item).model3Count) }}
                </span>
              </div>

              <div v-if="!isHideModel4Point" class="flex items-end justify-between gap-4">
                <span class="text-sm font-medium text-[var(--text-sub)]">{{ model4Name }}</span>
                <span class="text-base font-semibold text-[var(--text-main)]">
                  {{ formatQuota(getDisplayBilling(item).model4Count) }}
                </span>
              </div>

              <div v-if="!isHideDrawMjPoint" class="flex items-end justify-between gap-4">
                <span class="text-sm font-medium text-[var(--text-sub)]">{{ drawMjName }}</span>
                <span class="text-base font-semibold text-[var(--text-main)]">
                  {{ formatQuota(getDisplayBilling(item).drawMjCount) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- 签到和余额并排显示区域 -->
      <div class="mb-4 grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <!-- 签到日历卡片 - 左侧 -->
        <div
          class="flex h-full flex-col space-y-5 rounded-[28px] border border-[var(--paper-border)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-soft)]"
        >
          <!-- 卡片标题 -->
          <div
            class="mb-1 border-b border-[var(--paper-border)] pb-4 text-[18px] font-semibold text-[var(--text-main)]"
          >
            签到奖励
          </div>

          <!-- 签到信息 -->
          <div
            class="mb-2 rounded-[20px] border border-[var(--paper-border)] bg-[var(--surface-card)] p-4 text-sm leading-7 text-[var(--text-sub)]"
          >
            <span>签到赠送：</span>
            <span v-if="signInModel3Count > 0 && !isHideModel3Point"
              ><b class="mx-2 text-[var(--text-main)]">{{ signInModel3Count }}</b
              ><span>{{ model3Name }}</span></span
            >
            <span v-if="signInModel4Count > 0 && !isHideModel4Point"
              ><b class="mx-2 text-[var(--text-main)]">{{ signInModel4Count }}</b
              ><span>{{ model4Name }}</span></span
            >
            <span v-if="signInMjDrawToken > 0 && !isHideDrawMjPoint"
              ><b class="mx-2 text-[var(--text-main)]">{{ signInMjDrawToken }}</b
              ><span>{{ drawMjName }}</span></span
            >
            <span
              >（已连续签到<b class="mx-1 text-[var(--text-main)]">{{ consecutiveDays }}</b
              >天）</span
            >
          </div>

          <!-- 签到日历 -->
          <div class="flex-grow">
            <div
              class="grid grid-cols-7 text-center text-xs leading-6 text-[var(--text-sub)]"
            >
              <div>日</div>
              <div>一</div>
              <div>二</div>
              <div>三</div>
              <div>四</div>
              <div>五</div>
              <div>六</div>
            </div>
            <div class="mt-2 grid grid-cols-7 text-sm">
              <div
                v-for="n in getFirstDayOfMonth(new Date().getFullYear(), new Date().getMonth())"
                :key="'empty-' + n"
                class="py-2"
              ></div>
              <div v-for="day in days" :key="day.signInDate" class="py-2">
                <button
                  type="button"
                  :class="[
                    day.isToday
                      ? 'bg-[var(--btn-bg-primary)] text-[var(--btn-text-primary)]'
                      : day.isSigned
                        ? 'text-[var(--text-main)]'
                        : 'text-[var(--text-sub)]',
                    'mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-panel)]',
                  ]"
                >
                  <time :datetime="day.signInDate">{{ day.day }}</time>
                </button>
              </div>
            </div>
          </div>

          <!-- 签到按钮 -->
          <div class="mt-4 border-t border-[var(--paper-border)] pt-4">
            <button
              @click="handleSignIn"
              :disabled="hasSignedInToday || signInLoading"
              class="inline-flex w-full items-center justify-center rounded-[999px] bg-[var(--btn-bg-primary)] px-6 py-3 text-[15px] font-medium text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span v-if="signInLoading">签到中...</span>
              <span v-else-if="hasSignedInToday">已签到</span>
              <span v-else>签到</span>
            </button>
          </div>
        </div>

        <!-- 钱包余额卡片 - 右侧 -->
        <div
          class="flex h-full flex-col space-y-5 rounded-[28px] border border-[var(--paper-border)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-soft)]"
        >
          <!-- 卡片标题 -->
          <div
            class="mb-1 border-b border-[var(--paper-border)] pb-4 text-[18px] font-semibold text-[var(--text-main)]"
          >
            额度信息
          </div>

          <!-- 余额信息 -->
          <div class="space-y-3">
            <!-- 普通积分 -->
            <div
              v-if="!isHideModel3Point"
              class="flex items-center rounded-[18px] border border-[var(--paper-border)] bg-[var(--surface-card)] px-4 py-3"
            >
              <div class="w-28 text-[var(--text-sub)]">{{ model3Name }}</div>
              <div class="text-lg font-bold text-[var(--text-main)]">
                {{
                  userBalance.sumModel3Count > 999999
                    ? '无限额度'
                    : (userBalance.sumModel3Count ?? 0)
                }}
                <span
                  v-if="userBalance.sumModel3Count <= 999999"
                  class="ml-1 text-sm text-[var(--text-sub)]"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 高级模型积分 -->
            <div
              v-if="!isHideModel4Point"
              class="flex items-center rounded-[18px] border border-[var(--paper-border)] bg-[var(--surface-card)] px-4 py-3"
            >
              <div class="w-28 text-[var(--text-sub)]">{{ model4Name }}</div>
              <div class="text-lg font-bold text-[var(--text-main)]">
                {{
                  userBalance.sumModel4Count > 99999
                    ? '无限额度'
                    : (userBalance.sumModel4Count ?? 0)
                }}
                <span
                  v-if="userBalance.sumModel4Count <= 99999"
                  class="ml-1 text-sm text-[var(--text-sub)]"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 顶级模型额度 -->
            <div
              v-if="!isHideDrawMjPoint"
              class="flex items-center rounded-[18px] border border-[var(--paper-border)] bg-[var(--surface-card)] px-4 py-3"
            >
              <div class="w-28 text-[var(--text-sub)]">{{ drawMjName }}</div>
              <div class="text-lg font-bold text-[var(--text-main)]">
                {{
                  userBalance.sumDrawMjCount > 99999
                    ? '无限额度'
                    : (userBalance.sumDrawMjCount ?? 0)
                }}
                <span
                  v-if="userBalance.sumDrawMjCount <= 99999"
                  class="ml-1 text-sm text-[var(--text-sub)]"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 会员到期时间 -->
            <div
              class="flex items-center rounded-[18px] border border-[var(--paper-border)] bg-[var(--surface-card)] px-4 py-3"
            >
              <div class="w-28 text-[var(--text-sub)]">会员状态</div>
              <div
                class="text-lg font-bold"
                :class="isMember ? 'text-[var(--text-main)]' : 'text-[var(--text-sub)]'"
              >
                {{ userBalance.expirationTime ? `${userBalance.expirationTime} 到期` : '非会员' }}
              </div>
            </div>
          </div>

          <!-- 卡密兑换部分移至此处 -->
          <div
            v-if="showCrami"
            class="mt-4 flex-grow border-t border-[var(--paper-border)] pt-4"
          >
            <div class="mb-3 text-base font-medium text-[var(--text-main)]">卡密兑换</div>
            <div class="flex items-center space-x-2">
              <input
                v-model="code"
                :placeholder="t('usercenter.enterCardDetails')"
                class="h-12 w-full rounded-[16px] border border-[var(--paper-border)] bg-[var(--surface-panel)] px-4 text-[var(--text-main)] outline-none transition focus:border-[var(--text-main)]"
                type="text"
              />
              <button
                :disabled="loading || !code"
                @click="useCrami"
                class="inline-flex w-[116px] items-center justify-center rounded-[999px] bg-[var(--btn-bg-primary)] px-5 py-3 text-[15px] font-medium text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                兑换
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 支付视图 -->
    <MemberPayment
      v-else-if="activeView === 'payment'"
      :visible="activeView === 'payment'"
      @back-to-main="backToMainView"
      @payment-success="handlePaymentSuccess"
    />
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
