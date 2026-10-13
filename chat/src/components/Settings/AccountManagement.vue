<script setup lang="ts">
import { fetchSendSms, fetchUpdateInfoAPI, fetchUpdatePasswordAPI } from '@/api'
import type { ResData } from '@/api/types'
import {
  fetchBindWxBySceneStrAPI,
  fetchGetQRCodeAPI,
  fetchGetQRSceneStrByBindAPI,
  fetchVerifyIdentityAPI,
  fetchVerifyPhoneIdentityAPI,
} from '@/api/user'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
import { ArrowLeft, Edit, IdCard, Lock, Phone, Wechat } from '@icon-park/vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import SliderCaptcha from '../Login/SliderCaptcha.vue'

interface Props {
  visible: boolean
}

const props = defineProps<Props>()

const authStore = useAuthStore()
const loading = ref(false)
const ms = message()
const showPasswordForm = ref(false)


// 定义用户信息完整类型
interface UserInfo {
  username: string
  email: string
  role: string
  id: string | number
  avatar?: string
  sign?: string
  isBindWx: boolean
  consecutiveDays: number
  phone?: string
  realName?: string
  idCard?: string
}

// 获取用户信息和余额
const userInfo = computed(() => (authStore.userInfo as UserInfo) || ({} as UserInfo))

const emailLoginStatus = computed(() => Number(authStore.globalConfig.emailLoginStatus) === 1)
const wechatRegisterStatus = computed(
  () => Number(authStore.globalConfig.wechatRegisterStatus) === 1
)
const phoneLoginStatus = computed(() => Number(authStore.globalConfig.phoneLoginStatus) === 1)
const openIdentity = computed(() => Number(authStore.globalConfig.openIdentity) === 1)

// 登录状态检测
const isLogin = computed(() => authStore.isLogin)

// 密码修改相关
const passwordForm = reactive({
  newPassword: '',
  confirmPassword: '',
})
const passwordError = ref('')
const reenteredPasswordError = ref('')
const isPasswordUpdating = ref(false)

// 处理密码修改表单提交
function handlePasswordFormSubmit() {

  const { newPassword, confirmPassword } = passwordForm

  // 清空之前的错误信息
  passwordError.value = ''
  reenteredPasswordError.value = ''

  // 验证新密码
  if (!newPassword) {
    passwordError.value = t('lens.account.passwordRequired')
    return
  }

  // 验证密码格式
  if (newPassword.length < 8 || newPassword.length > 20) {
    passwordError.value = t('lens.account.passwordLength')
    return
  }
  if (!/[a-zA-Z]/.test(newPassword)) {
    passwordError.value = t('lens.account.passwordLetters')
    return
  }
  if (!/\d/.test(newPassword)) {
    passwordError.value = t('lens.account.passwordNumbers')
    return
  }

  // 验证确认密码
  if (!confirmPassword) {
    reenteredPasswordError.value = t('lens.account.reenterPassword')
    return
  }
  if (newPassword !== confirmPassword) {
    reenteredPasswordError.value = t('lens.account.passwordMismatch')
    return
  }

  // 所有验证通过，提交密码修改
  updatePassword()
}

async function updatePassword() {
  try {

    loading.value = true
    isPasswordUpdating.value = true

    const res: ResData = await fetchUpdatePasswordAPI({ password: passwordForm.newPassword })

    loading.value = false
    isPasswordUpdating.value = false

    if (res.success) {

      ms.success(t('lens.account.passwordUpdated'))
      // 重置密码表单
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
      // 返回主视图
      backToMainView()

    } else {

      ms.error(sanitizeUserFacingErrorMessage(res.message || '', 0, t('lens.account.passwordFailed')))
    }
  } catch (error) {

    loading.value = false
    isPasswordUpdating.value = false
    ms.error(t('lens.account.passwordFailed'))
  }
}

function resetForm() {
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordError.value = ''
  reenteredPasswordError.value = ''
}

// 登录检测函数
function checkLoginStatus() {

  if (!isLogin.value) {

    // 显示消息提醒
    ms.warning(t('lens.account.loginRequired'))
    // 关闭设置弹窗
    useGlobalStore.updateSettingsDialog(false)
    // 打开登录弹窗
    authStore.setLoginDialog(true)
    return false
  }
  return true
}

async function getInfo() {
  // 首先检查登录状态
  if (!checkLoginStatus()) {
    return
  }

  try {
    loading.value = true

    // 添加超时控制
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('获取用户信息超时')), 10000)
    )

    await Promise.race([authStore.getUserInfo(), timeout])

    loading.value = false
  } catch (error) {

    loading.value = false
    // 失败时也需要重置UI状态
    resetUiState()
  }
}

const email = computed(() => userInfo.value.email || '')

const avatarLetters = computed(() => {
  const base = (email.value.split('@')[0] || username.value || 'user').trim()
  return base.slice(0, 2).toUpperCase()
})
const username = computed(() => userInfo.value.username || '')
const phone = computed(() => userInfo.value.phone || '')
const realName = computed(() => userInfo.value.realName || '')

// 判断是否显示邮箱
const shouldShowEmail = computed(() => {
  if (!email.value) return false
  if (!emailLoginStatus.value) return false
  const excludeDomains = ['@aiweb.com', '@cooper.com', '@default.com']
  return !excludeDomains.some(domain => email.value.endsWith(domain))
})

// 个人信息编辑
const isEditingInfo = ref(false)
const editableUsername = ref('')

function startEditingInfo() {
  editableUsername.value = username.value
  isEditingInfo.value = true
}

function cancelEditingInfo() {
  isEditingInfo.value = false
}

async function saveUserInfo() {
  try {
    loading.value = true
    const value = editableUsername.value.trim()
    if (!/^[a-z0-9]+$/.test(value)) {
      loading.value = false
      return ms.error(t('lens.account.idRule'))
    }
    const res: ResData = await fetchUpdateInfoAPI({
      username: value,
    })
    loading.value = false

    if (!res.success) {
      ms.error(sanitizeUserFacingErrorMessage(res.message || '', 0, t('lens.account.updateFailed')))
      return
    }

    ms.success(t('lens.account.idUpdated'))
    isEditingInfo.value = false
    await authStore.getUserInfo()
  } catch (error) {
    loading.value = false
    ms.error(t('lens.account.updateFailed'))
  }
}

// 身份验证和手机验证相关
const showVerificationSection = ref(false) // 控制验证部分的展开/收起
const useGlobalStore = useGlobalStoreWithOut()
const globalConfig = computed(() => authStore.globalConfig)

// 身份认证
const isShowIdVerify = ref(false) // 身份验证滑块
const isShowPhoneVerify = ref(false) // 手机验证滑块

// 身份认证表单
const identityForm = ref({
  name: '',
  idCard: '',
})

// 手机认证表单
const phoneForm = ref({
  phone: '',
  code: '',
})

// 验证相关
const agreedToUserAgreement = ref(true) // 是否同意用户协议
const sendCodeLoading = ref(false)
const timer = ref<number | null>(null)

// 微信绑定相关
// const countdownRef = ref<CountdownInst | null>()
const countdownRef = ref<number | null>(null)
const remainingTime = ref(60)
const isCountingDown = ref(false)
const activeCount = ref(false)
const wxLoginUrl = ref('')
const sceneStr = ref('')
const showWxBindSection = ref(false)
const wxBindTimer = ref<number | null>(null)
const isWxBound = computed(() => {
  return userInfo.value && Number(userInfo.value.isBindWx) === 1
})

// 当前显示视图控制
const activeView = ref('main') // 'main', 'phone', 'identity', 'wx', 'password', 'wxMigration'

// 切换到绑定手机界面
function showPhoneBindView() {
  activeView.value = 'phone'
}

// 切换到实名认证界面
function showIdentityView() {
  activeView.value = 'identity'
}

// 切换到微信绑定界面
function showWxBindView() {
  // 先清理之前可能存在的微信绑定资源
  cleanupWxBind()

  // 再切换视图
  activeView.value = 'wx'

  // 如果未绑定微信，获取场景字符串
  if (activeView.value === 'wx' && !isWxBound.value) {
    getSeneStr()
  }
}

// 返回主视图
function backToMainView() {
  // 如果是从微信绑定界面返回，立即清理微信绑定相关资源
  if (activeView.value === 'wx') {
    cleanupWxBind()
  }
  activeView.value = 'main'
}

// 切换验证区域展示

// 切换认证标签

// 切换到修改密码界面
function showPasswordView() {
  activeView.value = 'password'
}

// 点击"用户协议及隐私政策"时，自动同意
function handleAgreementClick() {
  agreedToUserAgreement.value = true // 设置为同意
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.AGREEMENT)
}

// 身份认证提交
function handleIdentitySubmit() {
  if (agreedToUserAgreement.value === false && globalConfig.value.isAutoOpenAgreement === '1') {
    return ms.error(t('lens.account.agreementRequired'))
  }
  isShowIdVerify.value = true
}

// 身份认证成功回调
function onIdentitySuccess() {
  isShowIdVerify.value = false
  fetchVerifyIdentityAPI(identityForm.value).then((res: any) => {
    if (res.code === 200) {
      ms.success(t('lens.account.verificationSuccess'))
      getInfo() // 刷新用户信息
    } else {
      ms.error(sanitizeUserFacingErrorMessage(res.message || '', 0, t('lens.account.verificationFailed')))
    }
  })
}

// 发送手机验证码
async function sendCode() {
  if (!phoneForm.value.phone) {
    return ms.error(t('lens.account.enterPhone'))
  }

  if (isCountingDown.value) return

  try {
    sendCodeLoading.value = true
    const params = { phone: phoneForm.value.phone }
    const res: ResData = await fetchSendSms(params)

    if (res.success) {
      ms.success(t('lens.account.codeSent'))
      startCountdown()
    } else {
      ms.error(sanitizeUserFacingErrorMessage(res.message || '', 0, t('lens.account.codeFailed')))
    }
  } catch (error) {

    ms.error(t('lens.account.codeFailed'))
  } finally {
    sendCodeLoading.value = false
  }
}

// 开始倒计时
const startCountdown = () => {
  if (isCountingDown.value) return

  isCountingDown.value = true
  remainingTime.value = 60

  countdownRef.value = window.setInterval(() => {
    remainingTime.value--
    if (remainingTime.value <= 0) {
      clearInterval(countdownRef.value!)
      countdownRef.value = null
      isCountingDown.value = false
    }
  }, 1000)
}

// 停止倒计时
// 手机认证验证
function handlePhoneSubmit() {
  if (agreedToUserAgreement.value === false && globalConfig.value.isAutoOpenAgreement === '1') {
    return ms.error(t('lens.account.agreementRequired'))
  }

  if (!phoneForm.value.phone || !phoneForm.value.code) {
    return ms.error(t('lens.account.completeFields'))
  }

  isShowPhoneVerify.value = true
}

// 手机认证成功回调
async function onPhoneSuccess() {
  isShowPhoneVerify.value = false
  try {
    loading.value = true

    // 使用正确的API进行手机认证
    const res = (await fetchVerifyPhoneIdentityAPI({
      phone: phoneForm.value.phone,
      code: phoneForm.value.code,
      username: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
      password: '', // 这两个参数在绑定场景下可能不需要，但API定义需要
    })) as ResData

    if (res.success) {
      ms.success(t('lens.account.verificationSuccess'))

      // 重置表单
      phoneForm.value.phone = ''
      phoneForm.value.code = ''

      // 刷新用户信息
      await getInfo()

      // 返回主视图
      backToMainView()
    } else {
      ms.error(sanitizeUserFacingErrorMessage(res.message || '', 0, t('lens.account.verificationFailed')))
    }
  } catch (error) {

    ms.error(t('lens.account.verificationFailed'))
  } finally {
    loading.value = false
  }
}

// 获取场景字符串
async function getSeneStr() {
  try {
    const res = (await fetchGetQRSceneStrByBindAPI()) as ResData
    if (res.success) {
      sceneStr.value = res.data
      getQrCodeUrl()
      // 开始倒计时
      startCountdown()
    }
  } catch (error) {

  }
}

// 获取二维码URL
async function getQrCodeUrl() {
  try {
    const res = (await fetchGetQRCodeAPI({ sceneStr: sceneStr.value })) as ResData
    if (res.success) {
      activeCount.value = true
      wxLoginUrl.value = res.data
      // 使用window.setInterval并保存引用，以便清理
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
      }
      wxBindTimer.value = window.setInterval(() => {
        bindWxBySnece()
      }, 1000)
    }
  } catch (error) {

  }
}

// 通过场景字符串绑定微信
async function bindWxBySnece() {
  if (!sceneStr.value) return
  try {
    const res = (await fetchBindWxBySceneStrAPI({
      sceneStr: sceneStr.value,
    })) as ResData
    if (res.data) {
      if (wxBindTimer.value !== null) {
        clearInterval(wxBindTimer.value)
        wxBindTimer.value = null
      }
      const { status } = res.data
      if (status) {
        ms.success(t('lens.account.wechatLinked'))
        await authStore.getUserInfo()
        // 绑定成功后自动关闭微信绑定区域
        showWxBindSection.value = false
      }
    }
  } catch (error) {

  }
}

// 清理微信绑定相关资源
function cleanupWxBind() {

  if (wxBindTimer.value !== null) {
    clearInterval(wxBindTimer.value)
    wxBindTimer.value = null
  }
  wxLoginUrl.value = ''
  sceneStr.value = ''
  activeCount.value = false
}

// 取消绑定微信
async function unbindWx() {
  try {
    // 这里需要后端提供取消绑定的API
    // const res: ResData = await fetchUnbindWxAPI()
    // if (res.success) {
    //   ms.success('解绑成功')
    //   await authStore.getUserInfo()
    // }
    ms.warning(t('lens.account.wechatUnlinkUnavailable'))
  } catch (error) {

  }
}

// 清理微信迁移相关资源
const wxMigrationTimer = ref<number | null>(null)

function cleanupWechatMigration() {
  if (wxMigrationTimer.value !== null) {
    clearInterval(wxMigrationTimer.value)
    wxMigrationTimer.value = null
  }
}

// 添加onBeforeUnmount钩子来清理资源
onBeforeUnmount(() => {
  // 重置加载状态
  loading.value = false
  if (countdownRef.value !== null) {
    clearInterval(countdownRef.value)
    countdownRef.value = null
  }

  // 清除任何可能正在运行的定时器
  if (timer.value !== null) {
    clearInterval(timer.value)
    timer.value = null
  }

  // 重置表单状态
  resetForm()

  // 关闭任何打开的验证对话框
  isShowIdVerify.value = false
  isShowPhoneVerify.value = false

  // 重置编辑状态
  isEditingInfo.value = false

  // 重置展开/折叠状态
  showVerificationSection.value = false
  showPasswordForm.value = false

  // 清理微信绑定相关资源
  cleanupWxBind()
  cleanupWechatMigration()
})

// 添加一个函数来重置UI状态
function resetUiState() {
  isEditingInfo.value = false
  showVerificationSection.value = false
  showPasswordForm.value = false
  showWxBindSection.value = false
  activeView.value = 'main' // 重置为主视图
}

// 监听visible属性变化，确保在组件变为不可见时重置状态
watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 组件显示时立即检查登录状态
      if (checkLoginStatus()) {
        getInfo()
      }
    } else {
      // 当组件不可见时，重置所有状态
      resetUiState()
      loading.value = false
      // 确保清理微信绑定的定时器
      cleanupWxBind()
    }
  }
)

// 监听登录状态变化
watch(isLogin, newLoginStatus => {

  // 如果组件可见但用户登出了，立即关闭设置弹窗并打开登录弹窗
  if (props.visible && !newLoginStatus) {

    // 显示消息提醒
    ms.warning(t('lens.account.loginRequired'))
    useGlobalStore.updateSettingsDialog(false)
    authStore.setLoginDialog(true)
  }
})

onMounted(() => {
  // 组件挂载时检查登录状态
  if (checkLoginStatus()) {
    getInfo()
  }
})

// 手机号加密显示：123****7890
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.replace(/(\d{3})\d*(\d{4})/, '$1****$2')
}

// 视图控制

// 手机绑定信息
const phoneBindInfo = reactive({
  status: computed(() => (phone.value ? 'bound' : 'unbound')),
  phone: computed(() => maskPhone(phone.value)),
})

// 实名认证状态
const identityStatus = computed(() => (realName.value ? 'verified' : 'unverified'))
</script>

<template>
  <div class="research-account w-full">
    <!-- 主视图 -->
    <div
      v-if="activeView === 'main'"
      class="research-account__overview"
    >
      <!-- 用户基本信息卡片 -->
      <div
        class="research-account__section flex flex-col gap-4"
      >
        <!-- 卡片标题 -->
        <div
          class="research-account__section-title"
        >{{ t('lens.account.personalInfo') }}</div>

        <!-- 头像展示 -->
        <div class="flex items-center">
          <div class="w-20 shrink-0 text-[var(--text-sub)]">{{ t('lens.account.avatar') }}</div>

          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--user-avatar-bg)]">
            <span class="text-white text-lg font-semibold">{{ avatarLetters }}</span>
          </div>
        </div>

        <!-- 用户信息展示 - 每行一个信息 -->

        <div class="flex items-center">
          <div class="w-20 shrink-0 text-[var(--text-sub)]">ID</div>
          <div v-if="!isEditingInfo" class="flex items-center">
            <div class="text-[var(--text-main)]">
              {{ username || t('lens.account.notSet') }}
            </div>
            <div class="group relative ml-2">
              <button @click="startEditingInfo" class="btn-icon btn-sm" :aria-label="t('lens.account.editId')">
                <Edit theme="outline" size="16" class="text-[var(--text-sub)] hover:text-[var(--academic-accent)]" />
              </button>
              <div class="tooltip tooltip-right">{{ t('lens.account.edit') }}</div>
            </div>
          </div>
          <div v-else class="account-edit flex min-w-0 flex-wrap items-center gap-2">
            <input
              v-model="editableUsername"
              class="input input-md w-full"
              :aria-label="t('lens.account.editId')"
              :placeholder="t('lens.account.enterId')"
            />
            <button @click="saveUserInfo" class="btn btn-primary btn-md">{{ t('lens.account.save') }}</button>
            <button @click="cancelEditingInfo" class="btn btn-secondary btn-md">{{ t('lens.account.cancel') }}</button>
          </div>
        </div>

        <div v-if="shouldShowEmail" class="flex items-center">
          <div class="w-20 shrink-0 text-[var(--text-sub)]">{{ t('lens.account.email') }}</div>
          <div class="min-w-0 break-all text-[var(--text-main)]">{{ email }}</div>
        </div>
      </div>

      <!-- 账户安全卡片 -->
      <div
        class="research-account__section flex flex-col gap-4"
      >
        <!-- 卡片标题 -->
        <div
          class="research-account__section-title"
        >{{ t('lens.account.security') }}</div>

        <!-- 账户安全选项 -->
        <div class="grid grid-cols-1 gap-4">
          <!-- 手机绑定 -->
          <div v-if="phoneLoginStatus" class="flex items-center justify-between gap-3">
            <div class="flex items-center">
              <div>
                <div class="text-[var(--text-main)] flex items-center">{{ t('lens.account.phoneBinding') }}<Phone theme="outline" size="16" class="text-[var(--text-sub)] ml-1" />
                </div>
                <div class="text-xs text-[var(--text-sub)]">
                  {{ phoneBindInfo.status === 'bound' ? t('lens.account.bound') : t('lens.account.unbound') }}
                  {{ phoneBindInfo.phone || '' }}
                </div>
              </div>
            </div>
            <button
              v-if="phoneBindInfo.status !== 'bound'"
              @click="showPhoneBindView"
              class="btn btn-secondary btn-sm"
            >{{ t('lens.account.bind') }}</button>
            <span v-else class="text-[var(--academic-blue)] text-sm">{{ t('lens.account.bound') }}</span>
          </div>

          <!-- 微信绑定 -->
          <div v-if="wechatRegisterStatus" class="flex items-center justify-between gap-3">
            <div class="flex items-center">
              <div>
                <div class="text-[var(--text-main)] flex items-center">{{ t('lens.account.wechatBinding') }}<Wechat theme="outline" size="16" class="text-[var(--text-sub)] ml-1" />
                </div>
                <div class="text-xs text-[var(--text-sub)]">
                  {{ isWxBound ? t('lens.account.wechatLinked') : t('lens.account.unbound') }}
                </div>
              </div>
            </div>
            <button @click="showWxBindView" class="btn btn-secondary btn-sm" :disabled="isWxBound">
              {{ isWxBound ? t('lens.account.bound') : t('lens.account.bind') }}
            </button>
          </div>

          <!-- 实名认证 -->
          <div v-if="openIdentity" class="flex items-center justify-between gap-3">
            <div class="flex items-center">
              <div>
                <div class="text-[var(--text-main)] flex items-center">{{ t('lens.account.identity') }}<IdCard theme="outline" size="16" class="text-[var(--text-sub)] ml-1" />
                </div>
                <div class="text-xs text-[var(--text-sub)]">
                  {{ identityStatus === 'verified' ? t('lens.account.verified') : t('lens.account.unverified') }}
                </div>
              </div>
            </div>
            <button
              v-if="identityStatus !== 'verified'"
              @click="showIdentityView"
              class="btn btn-secondary btn-sm"
            >{{ t('lens.account.verify') }}</button>
            <span v-else class="text-[var(--academic-blue)] text-sm">{{ t('lens.account.verified') }}</span>
          </div>

          <!-- 修改密码 -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center">
              <div>
                <div class="text-[var(--text-main)] flex items-center">{{ t('lens.account.password') }}<Lock theme="outline" size="16" class="text-[var(--text-sub)] ml-1" />
                </div>
                <div class="text-xs text-[var(--text-sub)]">{{ t('lens.account.passwordHint') }}</div>
              </div>
            </div>
            <button @click="showPasswordView" class="btn btn-secondary btn-sm">{{ t('lens.account.change') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 修改密码视图 -->
    <div
      v-else-if="activeView === 'password'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 修改密码卡片 -->
      <div
        class="p-4 bg-[var(--surface-card)] rounded-lg border border-[var(--paper-border)] mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2">
          <button @click="backToMainView" class="btn-icon btn-md mr-2" :aria-label="t('lens.account.back')">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-[var(--text-main)]">{{ t('lens.account.changePassword') }}</div>
        </div>

        <form @submit.prevent="handlePasswordFormSubmit" class="flex flex-col space-y-4">
          <!-- 新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="new-password" class="text-sm text-[var(--text-sub)]"
              >{{ t('lens.account.newPassword') }}</label
            >
            <input
              id="new-password"
              v-model="passwordForm.newPassword"
              type="password"
              autocomplete="new-password"
              :placeholder="t('lens.account.enterPassword')"
              class="input input-md w-full"
              required
            />
            <div class="text-xs text-[var(--text-sub)]">{{ t('lens.account.passwordRule') }}</div>
            <div v-if="passwordError" class="text-xs text-red-500 mt-1">{{ passwordError }}</div>
          </div>

          <!-- 确认新密码 -->
          <div class="flex flex-col space-y-1">
            <label for="confirm-password" class="text-sm text-[var(--text-sub)]"
              >{{ t('lens.account.confirmPassword') }}</label
            >
            <input
              id="confirm-password"
              v-model="passwordForm.confirmPassword"
              type="password"
              autocomplete="new-password"
              :placeholder="t('lens.account.reenterPassword')"
              class="input input-md w-full"
              required
            />
            <div v-if="reenteredPasswordError" class="text-xs text-red-500 mt-1">
              {{ reenteredPasswordError }}
            </div>
          </div>

          <!-- 提交按钮 -->
          <div class="pt-2">
            <button
              type="submit"
              class="btn btn-primary btn-md w-full"
              :disabled="isPasswordUpdating"
            >
              <span v-if="isPasswordUpdating">{{ t('lens.account.submitting') }}</span>
              <span v-else>{{ t('lens.account.confirmChange') }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 手机绑定视图 -->
    <div
      v-else-if="activeView === 'phone'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 手机绑定卡片 -->
      <div
        class="p-4 bg-[var(--surface-card)] rounded-lg border border-[var(--paper-border)] mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2">
          <button @click="backToMainView" class="btn-icon btn-md mr-2" :aria-label="t('lens.account.back')">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-[var(--text-main)]">{{ t('lens.account.bindPhone') }}</div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-[var(--text-sub)]">{{ t('lens.account.phone') }}</label>
            <input
              v-model="phoneForm.phone"
              :aria-label="t('lens.account.phone')"
              class="input input-md w-full"
              :placeholder="t('lens.account.enterPhone')"
            />
          </div>
          <div class="flex space-x-2">
            <div class="flex-1">
              <label class="block mb-1 text-sm font-medium text-[var(--text-sub)]">{{ t('lens.account.code') }}</label>
              <input
                v-model="phoneForm.code"
              :aria-label="t('lens.account.code')"
                class="input input-md w-full"
                :placeholder="t('lens.account.enterCode')"
              />
            </div>
            <div class="flex items-end">
              <button
                @click="sendCode"
                class="btn btn-secondary btn-sm w-full"
                :disabled="sendCodeLoading || isCountingDown"
              >
                {{ isCountingDown ? t('lens.login.codeCountdown', { seconds: remainingTime }) : t('login.sendVerificationCode') }}
              </button>
            </div>
          </div>

          <div v-if="globalConfig.isAutoOpenAgreement === '1'" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              :aria-label="t('lens.account.agreement')"
              type="checkbox"
              class="lens-checkbox"
            />
            <p class="ml-1 text-center text-sm text-[var(--text-sub)]">{{ t('lens.account.agreement') }}<a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-[var(--academic-accent)]"
                @click.prevent="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handlePhoneSubmit" class="btn btn-primary btn-md w-full">{{ t('lens.account.submitVerification') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 实名认证视图 -->
    <div
      v-else-if="activeView === 'identity'"
      class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2"
    >
      <!-- 实名认证卡片 -->
      <div
        class="p-4 bg-[var(--surface-card)] rounded-lg border border-[var(--paper-border)] mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2">
          <button @click="backToMainView" class="btn-icon btn-md mr-2" :aria-label="t('lens.account.back')">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-[var(--text-main)]">{{ t('lens.account.identity') }}</div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block mb-1 text-sm font-medium text-[var(--text-sub)]">{{ t('lens.account.realName') }}</label>
            <input
              v-model="identityForm.name"
              :aria-label="t('lens.account.realName')"
              class="input input-md w-full"
              :placeholder="t('lens.account.enterName')"
            />
          </div>
          <div>
            <label class="block mb-1 text-sm font-medium text-[var(--text-sub)]">{{ t('lens.account.idNumber') }}</label>
            <input
              v-model="identityForm.idCard"
              :aria-label="t('lens.account.idNumber')"
              class="input input-md w-full"
              :placeholder="t('lens.account.enterIdentity')"
            />
          </div>

          <div v-if="globalConfig.isAutoOpenAgreement === '1'" class="flex items-center">
            <input
              v-model="agreedToUserAgreement"
              :aria-label="t('lens.account.agreement')"
              type="checkbox"
              class="lens-checkbox"
            />
            <p class="ml-1 text-center text-sm text-[var(--text-sub)]">{{ t('lens.account.agreement') }}<a
                href="#"
                class="font-semibold leading-6 text-primary-600 hover:text-primary-500 dark:text-primary-500 dark:hover:text-[var(--academic-accent)]"
                @click.prevent="handleAgreementClick"
                >《{{ globalConfig.agreementTitle }}》</a
              >
            </p>
          </div>

          <div>
            <button @click="handleIdentitySubmit" class="btn btn-primary btn-md w-full">{{ t('lens.account.submitVerification') }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 微信绑定视图 -->
    <div v-else-if="activeView === 'wx'" class="max-h-[70vh] overflow-y-auto custom-scrollbar p-2">
      <!-- 微信绑定卡片 -->
      <div
        class="p-4 bg-[var(--surface-card)] rounded-lg border border-[var(--paper-border)] mb-4"
      >
        <!-- 卡片标题 -->
        <div class="flex items-center mb-4 pb-2">
          <button @click="backToMainView" class="btn-icon btn-md mr-2" :aria-label="t('lens.account.back')">
            <ArrowLeft size="18" />
          </button>
          <div class="text-base font-semibold text-[var(--text-main)]">{{ t('lens.account.bindWechat') }}</div>
        </div>

        <!-- 已绑定状态 -->
        <div v-if="isWxBound" class="text-center py-6">
          <div class="text-green-500 text-lg mb-4">{{ t('lens.account.wechatLinked') }}</div>
          <button @click="unbindWx" class="btn btn-secondary btn-sm">{{ t('lens.account.unbind') }}</button>
        </div>

        <!-- 未绑定状态 -->
        <div v-else class="px-4 pt-2 pb-6">
          <!-- 绑定提示 -->
          <div class="text-center my-6">
            <p class="text-[var(--text-sub)]">{{ t('lens.account.linkWithin', { seconds: remainingTime }) }}</p>
          </div>

          <!-- 微信绑定页面的二维码显示 -->
          <div class="flex justify-center my-8">
            <div class="relative w-[200px] h-[200px]">
              <img
                v-if="
                  wxLoginUrl && (agreedToUserAgreement || globalConfig.isAutoOpenAgreement !== '1')
                "
                class="w-full h-full select-none rounded-lg object-cover border border-gray-100 dark:border-gray-700"
                :src="wxLoginUrl"
                :alt="t('lens.account.wechatCode')"
              />

              <div
                v-else
                class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              ></div>

              <div
                v-if="!wxLoginUrl"
                class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
              >
                <div
                  class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
                ></div>
              </div>
            </div>
          </div>

          <!-- 提示文字 -->
          <div class="text-center text-[var(--text-sub)] text-base">{{ t('lens.account.scanWechat') }}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 身份认证滑块验证 -->
  <SliderCaptcha
    :show="isShowIdVerify"
    @success="onIdentitySuccess"
    @close="isShowIdVerify = false"
  />

  <!-- 手机认证滑块验证 -->
  <SliderCaptcha
    :show="isShowPhoneVerify"
    @success="onPhoneSuccess"
    @close="isShowPhoneVerify = false"
  />
</template>

<style scoped>
.research-account { font-size: 14px; line-height: 1.5; }
.research-account__overview { display: grid; gap: 28px; }
.research-account__section { min-width: 0; }
.research-account__section-title { color: var(--text-main); font-size: 14px; font-weight: 600; }

.account-edit input { flex: 1 1 120px; min-width: 0; }
.research-account :deep(.btn), .research-account :deep(.btn-icon) { min-height: 44px; }
@media (max-width: 480px) {
  .research-account .w-20 { width: 64px; }
  .research-account .p-4 { padding: 12px; }
}

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
