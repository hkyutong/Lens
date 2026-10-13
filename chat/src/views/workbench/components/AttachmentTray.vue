<script setup lang="ts">
import { Close } from '@icon-park/vue-next'
import { t } from '@/locales'
import { ref, watch } from 'vue'

interface FileItem {
  name: string
  url: string
  type?: string
}

interface Props {
  dataBase64List?: string[] // 上传文件的base64预览列表
  fileList?: File[] // 上传的文件列表
  savedFiles?: FileItem[] // 已保存的文件列表
  showSavedFiles?: boolean // 是否展示已保存文件
}

const props = withDefaults(defineProps<Props>(), {
  dataBase64List: () => [],
  fileList: () => [],
  savedFiles: () => [],
  showSavedFiles: true,
})
const emit = defineEmits<{
  (e: 'clearData', index: number, isSavedFile: boolean): void
}>()

// 记录正在转换的文件索引（PDF、Excel、Word或PPTX）
const convertingFileIndex = ref<number | null>(null)
// 记录已处理过的文件数量，用于检测新文件
const processedFileCount = ref(0)

const handleClearData = (index: number, isSavedFile: boolean) => {
  emit('clearData', index, isSavedFile)
}

// 监听savedFiles变化，自动处理新上传的文件
watch(
  () => props.savedFiles,
  newFiles => {
    processedFileCount.value = newFiles.length
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div
    v-if="fileList.length > 0 || (showSavedFiles && savedFiles.length > 0)"
    class="self-start w-full select-none"
  >
    <!-- 上传的文件和图片显示区域 -->
    <div class="self-start w-full rounded-t-2xl mt-2">
      <div class="flex flex-wrap px-2">
        <!-- 已保存的文件显示 -->
        <template v-if="showSavedFiles && savedFiles.length > 0">
          <!-- 先显示图片 -->
          <div
            class="relative inline-block mr-2 mb-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'image')"
            :key="'saved-img-' + index"
          >
            <img
              :src="file.url"
              class="max-h-16 border border-gray-100 shadow-sm dark:border-gray-700 rounded-md"
              :alt="t('lens.footer.imagePreview')"
            />
            <button
              type="button" class="attachment-remove" :aria-label="t('lens.footer.removeMaterial')" @click="handleClearData(savedFiles.indexOf(file), true)"><Close class="w-4 h-4" /></button>
          </div>

          <!-- 再显示文件 -->
          <div
            class="relative inline-block mr-2 mb-2"
            v-for="(file, index) in savedFiles.filter((f: FileItem) => f.type === 'document')"
            :key="'saved-file-' + index"
          >
            <div
              class="px-3 flex items-center justify-start rounded-[var(--radius-control)] min-h-[44px] text-[var(--text-main)] border border-[var(--paper-border)] bg-[var(--surface-card)] transition-colors relative"
            >
              <!-- 统一加载指示器 - 处理文件转换加载状态 -->
              <div
                v-if="convertingFileIndex === savedFiles.indexOf(file)"
                class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 dark:bg-gray-800 dark:bg-opacity-80 rounded-xl z-10"
              >
                <div class="loading-animation">
                  <span></span>
                </div>
              </div>

              <span class="text-[var(--text-sub)] max-w-48 truncate mr-9">{{ file.name }}</span>
            </div>
            <!-- 删除按钮 -->
            <button
              v-if="convertingFileIndex !== savedFiles.indexOf(file)"
              type="button" class="attachment-remove" :aria-label="t('lens.footer.removeMaterial')" @click="handleClearData(savedFiles.indexOf(file), true)"><Close class="w-4 h-4" /></button>
          </div>
        </template>

        <!-- 本地待发送文件（图片 + 文档） -->
        <template
          v-if="fileList.length > 0"
          v-for="(file, index) in fileList"
          :key="'item-' + index"
        >
          <div v-if="file?.type.startsWith('image/')" class="relative inline-block mr-2 mb-2">
            <img
              :src="dataBase64List[index]"
              class="max-h-16 border border-gray-100 shadow-sm dark:border-gray-700 rounded-xl"
              :alt="t('lens.footer.imagePreview')"
            />
            <button
              type="button" class="attachment-remove" :aria-label="t('lens.footer.removeMaterial')" @click="handleClearData(index, false)"><Close class="w-4 h-4" /></button>
          </div>

          <div v-else class="relative inline-block mr-2 mb-2">
            <div
              class="px-3 flex items-center justify-start rounded-[var(--radius-control)] min-h-[44px] text-[var(--text-main)] border border-[var(--paper-border)] bg-[var(--surface-card)] transition-colors relative"
            >
              <span class="text-[var(--text-sub)] max-w-48 truncate mr-9">{{ file.name }}</span>
            </div>
            <button
              type="button" class="attachment-remove" :aria-label="t('lens.footer.removeMaterial')" @click="handleClearData(index, false)"><Close class="w-4 h-4" /></button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attachment-remove { position: absolute; top: 0; right: 0; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: var(--radius-control); color: var(--text-sub); background: var(--surface-card); }
.attachment-remove:hover { background: var(--academic-blue-soft); color: var(--academic-blue); }

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
