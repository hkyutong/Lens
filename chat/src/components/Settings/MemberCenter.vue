<script setup lang="ts">
import { getPackageUploadFeatures } from '@/utils/packageUploadFeatures';
import { fetchGetPackageAPI, fetchUseCramiAPI } from '@/api/crami'
import { fetchOrderBuyAPI } from '@/api/order'
import { fetchSignInAPI, fetchSignLogAPI } from '@/api/signin'
import { fetchGetJsapiTicketAPI } from '@/api/user'
import { t } from '@/locales'
import type { ResData } from '@/api/types'
import { useAuthStore, useGlobalStoreWithOut , useAppStore } from '@/store'
import { message } from '@/utils/message'
import { formatCurrency, hydrateBillingOptions , getMemberDisplayBilling } from '@/utils/memberPricing'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { BillingCycle, BillingOption } from '@/types/billing'
import MemberPayment from './MemberPayment.vue'

const appStore = useAppStore();

const props = defineProps<Props>()

declare let WeixinJSBridge: any
declare let wx: any

const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const loading = ref(true)
const packageList = ref<Pkg[]>([])
const packageLoadFailed = ref(false)
const ms = message()
const dialogLoading = ref(false)
const model3Name = computed(() => t('goods.basicModelQuota'))
const model4Name = computed(() => t('goods.advancedModelQuota'))
const drawMjName = computed(() => t('goods.drawingQuota'))
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
  mode?: 'full' | 'pricing'
}

interface PlanPreset {
  planKey: 'plus' | 'pro' | 'max'
  displayName: string
}

const OFFICIAL_PLAN_ALIASES: Record<PlanPreset['planKey'], string[]> = {
  plus: ['plus', '轻用版', '学生版', '學生版', 'go'],
  pro: ['pro', '专业版', '專業版', '教授版'],
  max: ['max', '旗舰版', '旗艦版', '至尊版'],
}

type PlanFeatureKey =
  'basicModels' | 'advancedModels' | 'allModels' | 'paperSummary' | 'englishPolish' | 'pdfDeepRead' | 'latexTranslation' | 'bibtex' | 'fullResearchTools' | 'complexReasoning'

interface Pkg {
  id: number
  name: string
  coverImg: string
  des: string
  price: number
  usdPrice?: number
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
  }
}

function getProfessionalPreset(): PlanPreset {
  return {
    planKey: 'pro',
    displayName: t('lens.member.pro'),
  }
}

function getMaxPreset(): PlanPreset {
  return {
    planKey: 'max',
    displayName: t('lens.member.max'),
  }
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
  return value
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
    return ["basicModels", "paperSummary", "englishPolish"]
  }

  if (preset.planKey === 'pro') {
    return ["basicModels", "advancedModels", "pdfDeepRead", "latexTranslation", "bibtex"]
  }

  return ["allModels", "fullResearchTools", "complexReasoning"]
}

function getPlanFeatureLabels(pkg: Pkg) {
  return getPlanFeatureKeys(pkg).map(key => t(`lens.member.features.${key}`))
}

function getDisplayPriceValue(pkg: Pkg) {
  return formatCurrency(getMemberDisplayBilling(getDisplayBilling(pkg), appStore.language).price);
}

function getDisplayPriceMeta(pkg: Pkg) {
  return getMemberDisplayBilling(getDisplayBilling(pkg), appStore.language);
}

function getDisplayPricePrefix(pkg: Pkg) {
  return getDisplayPriceMeta(pkg).symbol
}

function getDisplayPriceCurrencyLabel(pkg: Pkg) {
  return `${getDisplayPriceMeta(pkg).currency} /`
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
    if (isLogin.value || props.mode === 'pricing') {
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


  loading.value = true
  packageLoadFailed.value = false
  if (isLogin.value && props.mode !== 'pricing')
    void refreshMemberAccount();
  try {
    // 清空当前套餐列表，避免显示旧数据
    packageList.value = []
    // 获取用户最新余额信息

    // 获取套餐列表
    const res: ResData = await fetchGetPackageAPI({ status: 1, type: 1, size: 30 })
    packageList.value = (res.data.rows || []).map((item: Pkg) => hydrateBillingOptions(item))
    if (!selectName.value && displayPackages.value.length) {
      selectName.value = displayPackages.value[0].name
    }
    // 获取签到记录

    loading.value = false
  } catch (error) {
    loading.value = false
    packageLoadFailed.value = true
  }
}

const selectName = ref('')
const handleSelect = (item: { name: string }) => {
  selectName.value = item.name
  cramiSelect.value = false
}

function handleSuccess(pkg: Pkg) {
  if (!checkLoginStatus())
    return;

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
type SignInRecord = { signInDate: string; isSigned: boolean }

function normalizeSignInRecords(value: unknown): SignInRecord[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []

    const record = item as Record<string, unknown>
    const signInDate = typeof record.signInDate === 'string' ? record.signInDate : ''
    if (!signInDate) return []

    return [{
      signInDate,
      isSigned: record.isSigned === true,
    }]
  })
}

const signInData = ref<SignInRecord[]>([])
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
      signInData.value = normalizeSignInRecords(res.data)
    }
  } catch (error) {
  }
}

async function handleSignIn() {
  try {
    signInLoading.value = true
    const res: ResData = await fetchSignInAPI()
    if (res.success) {
      ms.success(t('lens.member.signInSuccess'))
      await getSigninLog()
      authStore.getUserInfo()
    }
    signInLoading.value = false
  } catch (error) {
    signInLoading.value = false
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
  if (!isLogin.value) {
    // 显示消息提醒
    ms.warning(t('lens.member.loginRequired'))
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

// An independently mounted purchase page must refresh after login.
watch(isLogin, newLoginStatus => {
  if (!props.visible) return
  if (newLoginStatus) {
    void openDrawerAfter()
    if (isWxEnv.value) void jsapiInitConfig()
    return
  }
  packageList.value = []
  activeView.value = 'main'
  selectedPackage.value = null
  loading.value = false
  if (props.mode !== 'pricing') checkLoginStatus()
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

async function refreshMemberAccount() {
  try {
    await authStore.getUserInfo();
  }
  catch {
    return;
  }
  try {
    if (props.mode !== 'pricing') await getSigninLog()
  }
  catch {
    // Account details are optional when browsing public plans.
  }
}
</script>

<template>
  <div class="research-member" :class="{ 'research-member--pricing': props.mode === 'pricing' }">
    <!-- 主视图 -->
    <div v-if="activeView === 'main'">
      <!-- 套餐列表卡片 -->
      <div
        class="research-member__section"
      >
        <div
          class="research-member__header"
        >
          <div v-if="props.mode !== 'pricing'">
            <div class="research-member__heading">
              {{ t('lens.member.planList') }}
            </div>
            <div class="mt-1 text-sm text-[var(--text-sub)]">
              {{ t('lens.member.planSubtitle') }}
            </div>
          </div>

          <div
            class="research-member__billing"
            role="group"
            :aria-label="t('lens.member.planList')"
          >
            <button
              type="button"
              :class="[
                billingCycle === 'monthly'
                  ? 'bg-[var(--surface-card)] text-[var(--text-main)] '
                  : 'text-[var(--text-sub)]',
                'min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition-colors',
              ]"
              :aria-pressed="billingCycle === 'monthly'"
              @click="billingCycle = 'monthly'"
            >
              {{ t('lens.member.monthly') }}
            </button>
            <button
              type="button"
              :class="[
                billingCycle === 'annual'
                  ? 'bg-[var(--surface-card)] text-[var(--text-main)] '
                  : 'text-[var(--text-sub)]',
                'min-h-[44px] rounded-full px-3 py-2 text-sm font-medium transition-colors',
              ]"
              :aria-pressed="billingCycle === 'annual'"
              @click="billingCycle = 'annual'"
            >
              <span>{{ t('lens.member.annual') }}</span>
              <span
                class="ml-2 inline-flex rounded-full bg-[var(--text-main)] px-2.5 py-1 text-[12px] font-semibold leading-none text-[var(--bg-body)]"
              >
                {{ t('lens.member.annualBetter') }}
              </span>
            </button>
          </div>
        </div>

        <div
          v-if="!isLogin && props.mode !== 'pricing'"
          class="member-plan-state"
          :aria-label="t('lens.member.loggedOut')"
        >
          <p>{{ t('lens.member.loginRequired') }}</p>
          <button type="button" class="research-member__purchase" @click="authStore.setLoginDialog(true)">
            {{ t('lens.sidebar.login') }}
          </button>
        </div>
        <div v-if="loading && !displayPackages.length" class="research-member__plans" :aria-label="t('lens.member.loadingPlans')" aria-busy="true">
          <div v-for="index in 3" :key="index" class="research-member__plan research-member__skeleton" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
          </div>
        </div>
        <div v-else-if="!displayPackages.length" class="member-plan-state" role="status" :aria-busy="loading">
          <span>{{ loading ? t('lens.member.loadingPlans') : packageLoadFailed ? t('lens.member.loadPlansFailed') : t('lens.member.noPlans') }}</span>
          <button v-if="packageLoadFailed && !loading" type="button" class="btn btn-secondary btn-md" @click="openDrawerAfter">
            {{ t('lens.workspace.retry') }}
          </button>
        </div>
        <div v-else class="research-member__plans">
          <div
            v-for="item in displayPackages"
            :key="item.id"
            :class="[
              item.name == selectName
                ? 'border-[var(--text-main)] '
                : 'border-[var(--paper-border)] ',
              'flex h-full flex-col rounded-[var(--radius-panel)] border bg-[var(--surface-card)] p-5 transition-colors',
            ]"
            @click="handleSelect(item)"
            class="research-member__plan">
            <div class="research-member__plan-heading">
              <b class="text-[22px] font-medium leading-[1.08] text-[var(--text-main)]">
                {{ getDisplayPlanName(item) }}
              </b>
            </div>

            <div class="research-member__price">
              <div class="research-member__price-line">
                <span class="research-member__currency">
                  {{ getDisplayPricePrefix(item) }}
                </span>
                <span class="research-member__price-number">
                  {{ getDisplayPriceValue(item) }}
                </span>
                <span class="research-member__price-unit">
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

            <p class="research-member__description">
              {{ getPlanSummary(item) }}
            </p>

            <div class="research-member__action">
              <button
                type="button"
                @click.stop="handleSuccess(item)"
                class="research-member__purchase"
              >
                {{ t('lens.member.openNow') }}
              </button>
            </div>

            <ul class="research-member__features">
              <li v-for="feature in [...getPlanFeatureLabels(item), ...getPackageUploadFeatures(packageList.find(packageItem => packageItem.id === item.id), t)]" :key="feature">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <span>{{ feature }}</span>
              </li>
            </ul>

            <div class="research-member__allowance">
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
      <div v-if="props.mode !== 'pricing'" class="research-member__extras">
        <!-- 签到日历卡片 - 左侧 -->
        <div
          class="research-member__section"
        >
          <!-- 卡片标题 -->
          <div
            class="research-member__heading"
          >
            {{ t('lens.member.signInReward') }}
          </div>

          <!-- 签到信息 -->
          <div
            class="mb-2 rounded-[var(--radius-control)] border border-[var(--paper-border)] bg-[var(--surface-card)] p-4 text-sm leading-7 text-[var(--text-sub)]"
          >
            <span>{{ t('lens.member.signInGift') }}</span>
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
            <span>{{ t('lens.member.consecutiveDays', { days: consecutiveDays }) }}</span>
          </div>

          <!-- 签到日历 -->
          <div class="flex-grow">
            <div
              class="grid grid-cols-7 text-center text-xs leading-6 text-[var(--text-sub)]"
            >
              <div>{{ t('lens.member.weekdaySun') }}</div>
              <div>{{ t('lens.member.weekdayMon') }}</div>
              <div>{{ t('lens.member.weekdayTue') }}</div>
              <div>{{ t('lens.member.weekdayWed') }}</div>
              <div>{{ t('lens.member.weekdayThu') }}</div>
              <div>{{ t('lens.member.weekdayFri') }}</div>
              <div>{{ t('lens.member.weekdaySat') }}</div>
            </div>
            <div class="mt-2 grid grid-cols-7 text-sm">
              <div
                v-for="n in getFirstDayOfMonth(new Date().getFullYear(), new Date().getMonth())"
                :key="'empty-' + n"
                class="py-2"
              ></div>
              <div v-for="day in days" :key="day.signInDate" class="py-2">
                <span
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
                </span>
              </div>
            </div>
          </div>

          <!-- 签到按钮 -->
          <div class="research-member__action">
            <button
              @click="handleSignIn"
              :disabled="hasSignedInToday || signInLoading"
              class="research-member__purchase"
            >
              <span v-if="signInLoading">{{ t('lens.member.signingIn') }}</span>
              <span v-else-if="hasSignedInToday">{{ t('lens.member.signedIn') }}</span>
              <span v-else>{{ t('lens.member.signIn') }}</span>
            </button>
          </div>
        </div>

        <!-- 钱包余额卡片 - 右侧 -->
        <div
          class="research-member__section"
        >
          <!-- 卡片标题 -->
          <div
            class="research-member__heading"
          >
            {{ t('lens.member.quotaInfo') }}
          </div>

          <!-- 余额信息 -->
          <div class="space-y-4">
            <!-- 普通积分 -->
            <div
              v-if="!isHideModel3Point"
              class="flex items-center justify-between gap-4 py-1.5"
            >
              <div class="min-w-0 text-[var(--text-sub)]">{{ model3Name }}</div>
              <div class="flex items-baseline whitespace-nowrap text-lg font-bold text-[var(--text-main)]">
                {{
                  (userBalance.sumModel3Count ?? 0)
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
              class="flex items-center justify-between gap-4 py-1.5"
            >
              <div class="min-w-0 text-[var(--text-sub)]">{{ model4Name }}</div>
              <div class="flex items-baseline whitespace-nowrap text-lg font-bold text-[var(--text-main)]">
                {{
                  (userBalance.sumModel4Count ?? 0)
                }}
                <span
                  v-if="userBalance.sumModel4Count <= 99999"
                  class="ml-1 text-sm text-[var(--text-sub)]"
                  >{{ t('usercenter.points') }}</span
                >
              </div>
            </div>

            <!-- 顶级积分 -->
            <div
              v-if="!isHideDrawMjPoint"
              class="flex items-center justify-between gap-4 py-1.5"
            >
              <div class="min-w-0 text-[var(--text-sub)]">{{ drawMjName }}</div>
              <div class="flex items-baseline whitespace-nowrap text-lg font-bold text-[var(--text-main)]">
                {{
                  (userBalance.sumDrawMjCount ?? 0)
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
              class="flex items-center justify-between gap-4 py-1.5"
            >
              <div class="min-w-0 text-[var(--text-sub)]">
                {{ t('lens.member.memberStatus') }}
              </div>
              <div
                class="min-w-0 text-right text-sm font-semibold"
                :class="isMember ? 'text-[var(--text-main)]' : 'text-[var(--text-sub)]'"
              >
                {{
                  userBalance.expirationTime
                    ? `${userBalance.expirationTime} ${t('lens.member.expires')}`
                    : t('lens.member.nonMember')
                }}
              </div>
            </div>
          </div>

          <!-- 卡密兑换部分移至此处 -->
          <div
            v-if="showCrami"
            class="research-member__redeem"
          >
            <div class="mb-3 text-base font-medium text-[var(--text-main)]">
              {{ t('lens.member.cardRedeem') }}
            </div>
            <div class="flex items-center space-x-2">
              <input
                v-model="code"
                :aria-label="t('usercenter.enterCardDetails')"
                :placeholder="t('usercenter.enterCardDetails')"
                class="h-12 min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--paper-border)] bg-[var(--surface-panel)] px-4 text-[var(--text-main)] transition focus:border-[var(--text-main)]"
                type="text"
              />
              <button
                :disabled="loading || !code"
                @click="useCrami"
                class="inline-flex w-[116px] items-center justify-center rounded-[999px] bg-[var(--btn-bg-primary)] px-5 py-3 text-[15px] font-medium text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ t('lens.member.redeem') }}
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
.research-member {
  color: inherit;
}

.research-member .research-member__section {
  padding: 0;
  border: 0;
}

.research-member .research-member__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.research-member .research-member__heading {
  min-width: 0;
}

.research-member .research-member__heading :is(h2,h3,h4) {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.research-member .research-member__heading p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-member .research-member__billing {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 3px;
  border: 0;
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--academic-blue) 9%, var(--paper-bg));
}

.research-member .research-member__billing button {
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: calc(var(--radius-control) - 3px);
  font-size: 13px;
  line-height: 1.4;
  box-shadow: none;
}

.research-member .research-member__plans {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  align-items: stretch;
}

.research-member .research-member__plan {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 14px;
  padding: 18px 16px;
  border: 1px solid var(--paper-border);
  border-radius: 18px;
  background: var(--paper-bg);
  box-shadow: none;
}

.research-member .research-member__plan-heading {
  min-height: 0;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: inherit;
}

.research-member .research-member__plan-heading :is(h2,h3,h4,p) {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.research-member .research-member__price {
  min-height: 0;
  margin: 0;
  padding: 0;
}

.research-member .research-member__price-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 0;
  height: auto;
}

.research-member .research-member__currency {
  font-size: 12px;
  font-weight: 400;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-member .research-member__price-number {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}

.research-member .research-member__price-unit {
  font-size: 12px;
  font-weight: 400;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-member .research-member__description {
  min-height: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-member .research-member__action {
  margin: 0;
  padding: 0;
}

.research-member .research-member__purchase {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 44px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--radius-control);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  box-shadow: none;
  border: 0;
  background: var(--academic-blue);
  color: var(--btn-text-primary);
}

.research-member .research-member__features {
  display: flex; flex-direction: column; gap: 6px; min-height: 0; margin: 0; padding: 0; border: 0; font-size: 13px; line-height: 1.6;
}

.research-member .research-member__features > * {
  display: flex; align-items: flex-start; gap: 10px; margin: 0; font-size: 13px; line-height: 1.6;
}

.research-member .research-member__allowance {
  display: grid; grid-template-columns: minmax(0,1fr); gap: 10px; min-width: 0; margin: 0; font-size: 13px; line-height: 1.6;
}

.research-member .research-member__allowance :last-child {
  font-size: 13px; font-weight: 400;
}

.research-member .research-member__redeem {
  padding: 0;
  border: 0;
  background: transparent;
}

.research-member .research-member__extras {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  align-items: start;
  gap: 24px;
  margin-top: 28px;
  padding: 0;
  border: 0;
}

.research-member .research-member__extras > * {
  min-width: 0;
  padding: 0;
  border: 0;
}

.research-member .research-member__extras :is(h2,h3,h4) {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

@media (max-width: 1099px) {
  .research-member .research-member__plans {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
}

@media (max-width: 720px) {
  .research-member .research-member__header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }

  .research-member .research-member__plans {
    grid-template-columns: minmax(0,1fr);
    gap: 12px;
  }

  .research-member .research-member__plan {
    padding: 18px;
    gap: 12px;
  }

  .research-member .research-member__description {
    min-height: 0;
  }

  .research-member .research-member__extras {
    grid-template-columns: minmax(0,1fr);
    gap: 24px;
    margin-top: 24px;
  }
}

.research-member .research-member__heading > :first-child {
  display: none;
}

.research-member .research-member__heading > :last-child {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-member .research-member__plan-heading > * {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.research-member .research-member__purchase:hover:not(:disabled) {
  background: color-mix(in srgb, var(--academic-blue) 88%, var(--paper-bg));
}

.research-member .research-member__purchase:focus-visible {
  outline: 2px solid var(--academic-blue);
  outline-offset: 3px;
}

.research-member .research-member__purchase:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.research-member .research-member__allowance > * { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; min-width: 0; margin: 0; }
.research-member .research-member__allowance > * > :first-child { font-size: 13px; font-weight: 400; white-space: nowrap; color: color-mix(in srgb, currentColor 65%, transparent); }
.research-member .research-member__allowance > * > :last-child { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.research-member .research-member__features:empty { display: none; }

.research-member__features svg {
  width: 18px;
  height: 18px;
  flex: none;
  margin-top: 2px;
  color: var(--academic-accent);
}

.member-plan-state {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 20px;
  color: var(--text-sub);
  text-align: center;
}

.member-plan-state .research-member__purchase { width: auto; min-width: 128px; }
.research-member__skeleton span {
  display: block;
  height: 16px;
  border-radius: var(--radius-small);
  background: var(--surface-muted);
}
.research-member__skeleton span:first-child { width: 40%; height: 24px; }
.research-member__skeleton span:nth-child(2) { width: 65%; height: 38px; margin-top: 16px; }
.research-member__skeleton span:last-child { height: 44px; margin-top: 32px; }

.research-member--pricing .research-member__header {
  justify-content: center;
  margin-bottom: 32px;
}
.research-member--pricing .research-member__billing {
  border-radius: 999px;
  background: var(--surface-panel);
}
.research-member--pricing .research-member__billing button { border-radius: 999px; }
.research-member--pricing .research-member__billing button span:last-child {
  background: var(--academic-accent-soft);
  color: var(--academic-accent);
}
.research-member--pricing .research-member__plans { gap: 20px; }
.research-member--pricing .research-member__plan {
  padding: 28px;
  gap: 20px;
  border-radius: 16px;
  background: var(--surface-card);
}
.research-member--pricing .research-member__plan-heading > * { font-size: 22px; }
.research-member--pricing .research-member__price-number { font-size: 38px; letter-spacing: -0.025em; }
.research-member--pricing .research-member__description { min-height: 4.8em; font-size: 14px; }
.research-member--pricing .research-member__features { gap: 12px; list-style: none; }
.research-member--pricing .research-member__features > * { font-size: 14px; }
.research-member--pricing .research-member__allowance {
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid var(--paper-border);
}
.research-member--pricing .research-member__purchase { font-size: 14px; font-weight: 600; }
@media (max-width: 720px) {
  .research-member--pricing .research-member__header { align-items: center; margin-bottom: 24px; }
  .research-member--pricing .research-member__plan { padding: 24px; }
  .research-member--pricing .research-member__description { min-height: 0; }
}
</style>
