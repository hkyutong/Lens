<script lang="ts" setup>
import { fetchLoginAPI, fetchSendCode } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { message } from '@/utils/message'
import { ref } from 'vue'
import SliderCaptcha from './SliderCaptcha.vue'

interface Props {
  loginMode: 'password' | 'captcha'
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'changeLoginType', mode: 'password' | 'captcha'): void
}>()
const formRef = ref<HTMLFormElement | null>(null)
const ms = message()
const loading = ref(false)
const authStore = useAuthStore()
const lastSendPhoneCodeTime = ref(0)
const { isMobile } = useBasicLayout()
const isShow = ref(false)

// 验证码登录表单
const captchaForm = ref({
  contact: '',
  captchaId: null,
  code: '',
})

// 密码登录表单
const passwordForm = ref({
  username: '',
  password: '',
})

// 验证表单
const validateForm = () => {
  let hasError = false

  // 密码登录表单验证
  if (props.loginMode === 'password') {
    // 验证用户名
    if (!passwordForm.value.username.trim()) {
      hasError = true
    } else if (passwordForm.value.username.length < 2 || passwordForm.value.username.length > 30) {
      hasError = true
    }

    // 验证密码
    if (!passwordForm.value.password.trim()) {
      hasError = true
    } else if (passwordForm.value.password.length < 6 || passwordForm.value.password.length > 30) {
      hasError = true
    }
  }

  // 验证码登录表单验证
  else if (props.loginMode === 'captcha') {
    // 验证联系方式
    if (!captchaForm.value.contact.trim()) {
      hasError = true
    }

    // 验证验证码
    if (!captchaForm.value.captchaId) {
      hasError = true
    }
  }

  return !hasError
}

// 只验证联系方式，用于发送验证码前的验证
const validateContactOnly = () => {
  return captchaForm.value.contact.trim() !== ''
}

const agreedToPolicies = ref(false)
const showPolicyModal = ref(false)
const policyTitle = ref('')
const policyUrl = ref('')
const termsUrl = '/legal/terms.html'
const privacyUrl = '/legal/privacy.html'

function openPolicy(title: string, url: string) {
  policyTitle.value = title
  policyUrl.value = url
  showPolicyModal.value = true
}

function closePolicy() {
  showPolicyModal.value = false
}

//  定时器改变倒计时时间方法
function changeLastSendPhoneCodeTime() {
  if (lastSendPhoneCodeTime.value > 0) {
    setTimeout(() => {
      lastSendPhoneCodeTime.value--
      changeLastSendPhoneCodeTime()
    }, 1000)
  }
}

/* 发送验证码 */
async function handleSendCaptcha() {
  isShow.value = false
  if (validateContactOnly()) {
    // 只验证联系方式
    try {
      const { contact } = captchaForm.value

      // 只传递联系方式(邮箱或手机号)
      const params: any = { contact }
      let res: any
      res = await fetchSendCode(params)
      const { success } = res
      if (success) {
        ms.success(res.data)
        // 记录重新发送倒计时
        lastSendPhoneCodeTime.value = 60
        changeLastSendPhoneCodeTime()
      }
    } catch (error) {}
  }
}

/* 登录处理 */
function handlerSubmit(event: Event) {
  event.preventDefault()

  if (!agreedToPolicies.value) {
    return ms.error('请阅读并同意《服务协议》和《隐私政策》')
  }

  if (validateForm()) {
    loginAction()
  }
}

async function loginAction() {
  try {
    loading.value = true

    // 根据登录模式构建参数
    const params: any =
      props.loginMode === 'password'
        ? {
            username: passwordForm.value.username,
            password: passwordForm.value.password,
          }
        : {
            username: captchaForm.value.contact,
            captchaId: captchaForm.value.captchaId,
          }

    const res: any = await fetchLoginAPI(params)
    loading.value = false

    const { success } = res

    if (!success) return

    ms.success(t('login.loginSuccess'))
    authStore.setToken(res.data)
    authStore.getUserInfo()
    authStore.setLoginDialog(false)
  } catch (error: any) {
    loading.value = false
    ms.error(error.message)
  }
}
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between" :class="isMobile ? 'px-5 ' : 'px-10 '">
    <!-- 密码登录表单 -->
    <form
      v-if="loginMode === 'password'"
      ref="formRef"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <div class="flex flex-col gap-2">
          <label for="username" class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >邮箱</label
          >
          <div>
            <input
              id="username"
              type="text"
              v-model="passwordForm.username"
              :placeholder="t('login.enterEmail')"
              class="input input-md w-full"
            />
          </div>
        </div>

        <div class="mt-4 relative">
          <div class="flex flex-col gap-2">
            <label
              for="password"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >{{ t('login.password') }}</label
            >
            <div>
              <input
                id="password"
                type="password"
                v-model="passwordForm.password"
                :placeholder="t('login.enterYourPassword')"
                class="input input-md w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="mt-8 mb-6">
          <div class="flex items-start justify-center">
            <input
              id="agreement-password"
              v-model="agreedToPolicies"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-white/40 bg-white text-[#080808] focus:ring-black/20"
            />
            <p class="ml-2 text-xs text-white/60 leading-5">
              <button
                type="button"
                class="font-medium text-white opacity-80 hover:opacity-100 no-underline"
                @click="openPolicy('服务协议', termsUrl)"
              >
                《服务协议》
              </button>
              和
              <button
                type="button"
                class="font-medium text-white opacity-80 hover:opacity-100 no-underline"
                @click="openPolicy('隐私政策', privacyUrl)"
              >
                《隐私政策》
              </button>
            </p>
          </div>
        </div>
        <button
          type="submit"
          class="btn btn-primary btn-md w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !passwordForm.username.trim() || !passwordForm.password"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          {{ t('login.loginAccount') }}
        </button>
        <button
          type="button"
          class="mt-4 text-sm text-white/70 hover:text-white text-center w-full"
          @click="emit('changeLoginType', 'captcha')"
        >
          使用验证码登录
        </button>
      </div>
    </form>

    <!-- 验证码登录表单 -->
    <form
      v-if="loginMode === 'captcha'"
      ref="formRef"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <div class="flex flex-col gap-2">
          <label for="contact" class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
            >邮箱</label
          >
          <div>
            <input
              id="contact"
              type="text"
              v-model="captchaForm.contact"
              :placeholder="t('login.enterEmail')"
              class="input input-md w-full"
            />
          </div>
        </div>

        <div class="mt-4">
          <div class="flex flex-col gap-2">
            <label
              for="captchaId"
              class="block text-sm/6 font-medium text-gray-900 dark:text-gray-300"
              >验证码</label
            >
            <div class="relative px-1">
              <div class="flex relative">
                <input
                  id="captchaId"
                  type="text"
                  v-model="captchaForm.captchaId"
                  :placeholder="t('login.enterCode')"
                  class="input input-md w-full pr-28"
                />
                <button
                  type="button"
                  class="btn-captcha px-4 text-sm"
                  :disabled="loading || lastSendPhoneCodeTime > 0 || !captchaForm.contact.trim()"
                  @click="isShow = true"
                >
                  <span v-if="loading && lastSendPhoneCodeTime === 0" class="inline-block mr-1">
                    <div class="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></div>
                  </span>
                  {{
                    lastSendPhoneCodeTime > 0
                      ? `${lastSendPhoneCodeTime}秒`
                      : t('login.sendVerificationCode')
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg">
          <SliderCaptcha
            :show="isShow"
            @success="handleSendCaptcha()"
            @close="isShow = false"
            class="z-[10000]"
          />
        </div>
      </div>

      <div>
        <div class="mt-8 mb-6">
          <div class="flex items-start justify-center">
            <input
              id="agreement-captcha"
              v-model="agreedToPolicies"
              type="checkbox"
              class="mt-0.5 h-4 w-4 rounded border-white/40 bg-white text-[#080808] focus:ring-black/20"
            />
            <p class="ml-2 text-xs text-white/60 leading-5">
              <button
                type="button"
                class="font-medium text-white opacity-80 hover:opacity-100 no-underline"
                @click="openPolicy('服务协议', termsUrl)"
              >
                《服务协议》
              </button>
              和
              <button
                type="button"
                class="font-medium text-white opacity-80 hover:opacity-100 no-underline"
                @click="openPolicy('隐私政策', privacyUrl)"
              >
                《隐私政策》
              </button>
            </p>
          </div>
        </div>
        <button
          type="submit"
          class="btn btn-primary btn-md w-full rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loading || !captchaForm.contact.trim() || !captchaForm.captchaId"
        >
          <span v-if="loading" class="inline-block mr-2">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          </span>
          验证码登录
        </button>
        <button
          type="button"
          class="mt-4 text-sm text-white/70 hover:text-white text-center w-full"
          @click="emit('changeLoginType', 'password')"
        >
          使用密码登录
        </button>
      </div>
    </form>

    <div
      v-if="showPolicyModal"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    >
      <div
        class="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-[90vw] h-[80vh] max-w-3xl overflow-hidden flex flex-col"
      >
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800"
        >
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{
            policyTitle
          }}</span>
          <button
            type="button"
            class="btn-icon btn-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            @click="closePolicy"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <iframe
          :src="policyUrl"
          class="w-full flex-1 border-0"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  </div>
</template>
