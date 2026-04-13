import { defineStore } from 'pinia'
import { useChatStore } from '../chat'

import { fetchGetInfo } from '@/api'
import { fetchGetBalanceQueryAPI } from '@/api/balance'
import { fetchQueryConfigAPI } from '@/api/config'
import type { ResData } from '@/api/types'
import { store } from '@/store/pinia'
import type { AuthState, GlobalConfig, UserBalance, UserInfo } from './helper'
import { defaultUserBalance, defaultUserInfo, getToken, removeToken, setToken } from './helper'

export const useAuthStore = defineStore('auth-store', {
  state: (): AuthState => ({
    token: getToken(),
    loginDialog: false,
    globalConfigLoading: true,
    userInfo: defaultUserInfo(),
    userBalance: defaultUserBalance(),
    globalConfig: {} as GlobalConfig,
    loadInit: false,
  }),

  getters: {
    isLogin: (state: AuthState) => !!state.token,
  },

  actions: {
    async getUserInfo(): Promise<{ userInfo: UserInfo; userBalance: UserBalance } | undefined> {
      try {
        if (!this.loadInit) await this.getGlobalConfig()

        const res = await fetchGetInfo<{
          userInfo?: Partial<UserInfo>
          userBalance?: Partial<UserBalance>
        }>()
        if (!res) return Promise.resolve(res)
        const { data } = res
        const { userInfo, userBalance } = data
        this.userInfo = { ...defaultUserInfo(), ...userInfo }
        this.userBalance = { ...defaultUserBalance(), ...userBalance }
        return Promise.resolve({
          userInfo: this.userInfo,
          userBalance: this.userBalance,
        })
      } catch (error) {
        return Promise.reject(error)
      }
    },

    updateUserBalance(userBalance: UserBalance) {
      this.userBalance = userBalance
    },

    async getUserBalance() {
      const res: ResData = await fetchGetBalanceQueryAPI()
      const { success, data } = res
      if (success) this.userBalance = data
    },

    async getGlobalConfig(domain = '') {
      const resolvedDomain = String(domain || '').trim()
      const res = await fetchQueryConfigAPI(resolvedDomain ? { domain: resolvedDomain } : undefined)
      this.globalConfig = res.data as GlobalConfig
      this.globalConfigLoading = false
      this.loadInit = true
    },

    setToken(token: string) {
      this.token = token
      setToken(token)
    },

    removeToken() {
      this.token = undefined
      removeToken()
    },

    setLoginDialog(bool: boolean) {
      this.loginDialog = bool
    },

    logOut() {
      this.token = undefined
      removeToken()
      this.userInfo = defaultUserInfo()
      this.userBalance = defaultUserBalance()
      // message().success('登出账户成功！')
      const chatStore = useChatStore()
      chatStore.clearChat()
      window.location.reload()
    },

    updatePasswordSuccess() {
      this.token = undefined
      removeToken()
      this.userInfo = defaultUserInfo()
      this.userBalance = defaultUserBalance()
      this.loginDialog = true
    },
  },
})

export function useAuthStoreWithout() {
  return useAuthStore(store)
}
