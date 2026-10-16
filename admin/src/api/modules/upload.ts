import api from '../index'

const PUBLIC_ASSET_PURPOSES = [
  'logo',
  'favicon',
  'robot-avatar',
  'default-avatar',
  'model-avatar',
  'app-cover',
  'app-background',
  'package-cover',
  'notice-image',
  'agreement-image',
  'classification-image',
] as const

export type PublicAssetPurpose = typeof PUBLIC_ASSET_PURPOSES[number]

export default {
  uploadFile: (data: FormData, purpose: PublicAssetPurpose) => {
    if (!PUBLIC_ASSET_PURPOSES.includes(purpose)) {
      throw new Error('Invalid public asset purpose')
    }
    return api.post(`/upload/public-asset?purpose=${encodeURIComponent(purpose)}`, data)
  },
}
