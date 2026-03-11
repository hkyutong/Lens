<script setup lang="ts">
import QRCode from 'qrcode'
import { ref, watch } from 'vue'

interface Props {
  value?: string // 扫描后的文本或地址
  size?: number // 二维码大小
  color?: string // 二维码颜色，Value must be in hex format (十六进制颜色值)
  backgroundColor?: string // 二维码背景色，Value must be in hex format (十六进制颜色值)
  bordered?: boolean // 是否有边框
  borderColor?: string // 边框颜色
  scale?: number // 每个black dots多少像素
  /*
    纠错等级也叫纠错率，就是指二维码可以被遮挡后还能正常扫描，而这个能被遮挡的最大面积就是纠错率。
    通常情况下二维码分为 4 个纠错级别：L级 可纠正约 7% 错误、M级 可纠正约 15% 错误、Q级 可纠正约 25% 错误、H级 可纠正约30% 错误。
    并不是所有位置都可以缺损，像最明显的三个角上的方框，直接影响初始定位。中间零散的部分是内容编码，可以容忍缺损。
    当二维码的内容编码携带信息比较少的时候，也就是链接比较短的时候，设置不同的纠错等级，生成的图片不会发生变化。
  */
  errorLevel?: string // 二维码纠错等级
}
const props = withDefaults(defineProps<Props>(), {
  value: '',
  size: 160,
  color: '#000',
  backgroundColor: '#FFF',
  bordered: true,
  borderColor: '#0505050f',
  scale: 8,
  errorLevel: 'H', // 可选 L M Q H
})

const qrcode = ref('')

watch(
  () => [props.value, props.errorLevel, props.scale, props.color, props.backgroundColor] as const,
  async () => {
    try {
      qrcode.value = await QRCode.toDataURL(props.value, {
        errorCorrectionLevel: props.errorLevel as 'L' | 'M' | 'Q' | 'H',
        type: 'image/png',
        quality: 1,
        margin: 3,
        scale: props.scale,
        color: {
          dark: props.color,
          light: props.backgroundColor,
        },
      })
    } catch (_error) {
      qrcode.value = ''
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    class="m-qrcode"
    :class="{ bordered }"
    :style="`width: ${size}px; height: ${size}px; border-color: ${borderColor};`"
  >
    <img :src="qrcode" class="u-qrcode" alt="QRCode" />
  </div>
</template>

<style lang="less" scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
.m-qrcode {
  display: inline-block;
  border-radius: 8px;
  overflow: hidden;
  .u-qrcode {
    width: 100%;
    height: 100%;
  }
}
.bordered {
  border-width: 1px;
  border-style: solid;
}
</style>
