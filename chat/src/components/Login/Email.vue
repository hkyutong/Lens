<script lang="ts" setup>
import { fetchLoginAPI, fetchSendCode } from '@/api'
import { YUTOAI_LEGAL_LINKS } from '@/constants/legalLinks'
import { useNativeDialog } from '@/hooks/useNativeDialog'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
import { ref, watch } from 'vue'
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
const loginError = ref('')
const authStore = useAuthStore()
const lastSendPhoneCodeTime = ref(0)
const isShow = ref(false)

watch(() => props.loginMode, () => {
  loginError.value = ''
})

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
const policyDialog = ref<HTMLDialogElement | null>(null)
const showPolicyModal = ref(false)
useNativeDialog(policyDialog, () => showPolicyModal.value)
const policyTitle = ref('')
const policyUrl = ref('')
const termsUrl = YUTOAI_LEGAL_LINKS.terms
const privacyUrl = YUTOAI_LEGAL_LINKS.privacy

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
        ms.success(t('lens.account.codeSent'))
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
  loginError.value = ''

  if (!agreedToPolicies.value) {
    loginError.value = t('lens.login.agreementRequired')
    return
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

    if (!success) {
      loginError.value = t('lens.login.failed')
      return
    }

    ms.success(t('login.loginSuccess'))
    authStore.setToken(res.data)
    authStore.getUserInfo()
    authStore.setLoginDialog(false)
  } catch (error: any) {
    loading.value = false
    loginError.value = sanitizeUserFacingErrorMessage(error?.message || '', 0, t('lens.login.failed'))
  }
}
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between">
    <p
      v-if="loginError"
      role="alert"
      class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {{ loginError }}
    </p>
    <!-- 密码登录表单 -->
    <form
      v-if="loginMode === 'password'"
      ref="formRef"
      class="flex flex-col flex-1 justify-between"
      @submit="handlerSubmit"
    >
      <div>
        <div class="flex flex-col gap-2">
          <label for="username" class="login-field-label block text-sm/6 font-medium"
            >{{ t('lens.login.accountLabel') }}</label
          >
          <div>
            <input
              id="username"
              autocomplete="username"
              type="text"
              v-model="passwordForm.username"
              :placeholder="t('login.enterUsername')"
              class="input input-md w-full"
            />
          </div>
        </div>

        <div class="mt-4 relative">
          <div class="flex flex-col gap-2">
            <label
              for="password"
              class="login-field-label block text-sm/6 font-medium"
              >{{ t('login.password') }}</label
            >
            <div>
              <input
                id="password"
                autocomplete="current-password"
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
          <div class="login-policy-row">
            <label class="login-policy-check" for="agreement-password">
            <input
              id="agreement-password"
              v-model="agreedToPolicies"
              type="checkbox"
              :aria-label="t('lens.login.agreementLabel')"
              class="lens-checkbox"
            />
            </label>
            <p class="login-policy-copy text-xs leading-5">
              <button
                type="button"
                class="login-policy-link font-medium no-underline"
                @click="openPolicy(t('lens.login.terms'), termsUrl)"
              >
                {{ t('lens.login.terms') }}
              </button>
              <span>{{ t('lens.login.and') }}</span>
              <button
                type="button"
                class="login-policy-link font-medium no-underline"
                @click="openPolicy(t('lens.login.privacy'), privacyUrl)"
              >
                {{ t('lens.login.privacy') }}
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
          class="login-switch mt-4 text-sm text-center w-full"
          @click="emit('changeLoginType', 'captcha')"
        >
          {{ t('lens.login.useCode') }}
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
          <label for="contact" class="login-field-label block text-sm/6 font-medium"
            >{{ t('login.email') }}</label
          >
          <div>
            <input
              id="contact"
              autocomplete="email"
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
              class="login-field-label block text-sm/6 font-medium"
              >{{ t('lens.login.verificationCode') }}</label
            >
            <div class="relative px-1">
              <div class="flex relative">
                <input
                  id="captchaId"
                  autocomplete="one-time-code"
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
                      ? t('lens.login.codeCountdown', { seconds: lastSendPhoneCodeTime })
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
          <div class="login-policy-row">
            <label class="login-policy-check" for="agreement-captcha">
            <input
              id="agreement-captcha"
              v-model="agreedToPolicies"
              type="checkbox"
              :aria-label="t('lens.login.agreementLabel')"
              class="lens-checkbox"
            />
            </label>
            <p class="login-policy-copy text-xs leading-5">
              <button
                type="button"
                class="login-policy-link font-medium no-underline"
                @click="openPolicy(t('lens.login.terms'), termsUrl)"
              >
                {{ t('lens.login.terms') }}
              </button>
              <span>{{ t('lens.login.and') }}</span>
              <button
                type="button"
                class="login-policy-link font-medium no-underline"
                @click="openPolicy(t('lens.login.privacy'), privacyUrl)"
              >
                {{ t('lens.login.privacy') }}
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
          {{ t('lens.login.codeLogin') }}
        </button>
        <button
          type="button"
          class="login-switch mt-4 text-sm text-center w-full"
          @click="emit('changeLoginType', 'password')"
        >
          {{ t('lens.login.usePassword') }}
        </button>
      </div>
    </form>

    <dialog
      ref="policyDialog"
      :aria-label="policyTitle"
      @cancel.prevent="closePolicy"
      v-if="showPolicyModal"
      class="lens-dialog fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    >
      <div
        class="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-[90vw] h-[80vh] max-w-3xl overflow-hidden flex flex-col"
      >
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800"
        >
          <span class="login-policy-title text-sm font-medium">{{
            policyTitle
          }}</span>
          <button
            type="button"
            class="login-policy-close"
            @click="closePolicy"
:aria-label="t('lens.header.close')"
          >
            <SvgIcon icon="ri:close-line" />
          </button>
        </div>
        <iframe
          :src="policyUrl"
          :title="policyTitle"
          class="w-full flex-1 border-0"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.login-field-label {
  color: var(--text-sub);
}

.login-policy-row {
  display: grid;
  grid-template-columns: 44px max-content 44px;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.login-policy-check { display: grid; width: 44px; min-width: 44px; height: 44px; place-items: center; cursor: pointer; }
.login-policy-copy { display: flex; min-width: 0; align-items: center; gap: 4px; margin: 0; color: var(--text-sub); white-space: nowrap; }
.login-policy-link { display: inline-flex; align-items: center; vertical-align: middle; }

.login-policy-title {
  color: var(--text-main);
}

.login-policy-close {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-sub);
}

.login-policy-close svg { width: 16px; height: 16px; }
.login-policy-close:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

.login-policy-close:hover {
  color: var(--text-main);
}

.login-policy-link,
.login-switch {
  min-height: 44px;
  color: var(--accent);
  transition: color 160ms ease;
}

.login-policy-link:hover,
.login-switch:hover {
  color: var(--accent-strong);
}

.login-policy-copy :deep(button:focus-visible),
.login-switch:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
@media (max-width: 359px) {
  .login-policy-copy { font-size: 11px; gap: 3px; }
}
</style>
