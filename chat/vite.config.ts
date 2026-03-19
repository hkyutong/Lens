import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import { createVitePlugins } from './vite/plugins'

const manualChunkGroups: Array<{ name: string; patterns: string[] }> = [
  {
    name: 'vue-vendor',
    patterns: [
      '/node_modules/vue/',
      '/node_modules/@vue/',
      '/node_modules/vue-router/',
      '/node_modules/pinia/',
    ],
  },
  {
    name: 'utils-vendor',
    patterns: ['/node_modules/@vueuse/', '/node_modules/clientjs/', '/node_modules/pinyin-match/'],
  },
  {
    name: 'icons-vendor',
    patterns: ['/node_modules/@icon-park/', '/node_modules/@iconify/'],
  },
  {
    name: 'codemirror-vendor',
    patterns: ['/node_modules/codemirror/', '/node_modules/@codemirror/'],
  },
  {
    name: 'markdown-it-vendor',
    patterns: ['/node_modules/markdown-it/', '/node_modules/markdown-it-link-attributes/'],
  },
  {
    name: 'highlight-vendor',
    patterns: ['/node_modules/highlight.js/'],
  },
  {
    name: 'katex-vendor',
    patterns: ['/node_modules/katex/', '/node_modules/@traptitech/markdown-it-katex/'],
  },
  {
    name: 'md-editor-vendor',
    patterns: ['/node_modules/md-editor-v3/'],
  },
  {
    name: 'markmap-vendor',
    patterns: ['/node_modules/markmap-'],
  },
  {
    name: 'document-vendor',
    patterns: [
      '/node_modules/pdfjs-dist/',
      '/node_modules/mammoth/',
      '/node_modules/xlsx/',
      '/node_modules/pptxtojson/',
      '/node_modules/office-text-extractor/',
      '/node_modules/@opendocsg/pdf2md/',
      '/node_modules/html2pdf.js/',
      '/node_modules/html-to-image/',
    ],
  },
  {
    name: 'viewer-vendor',
    patterns: ['/node_modules/v-viewer/', '/node_modules/viewerjs/', '/node_modules/qrcode/'],
  },
]

const resolveManualChunk = (id: string) => {
  if (!id.includes('/node_modules/')) return undefined

  for (const group of manualChunkGroups) {
    if (group.patterns.some(pattern => id.includes(pattern))) {
      return group.name
    }
  }

  return undefined
}

export default defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd()) as unknown as ImportMetaEnv
  const isBuild = mode === 'production'

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: createVitePlugins(isBuild),
    server: {
      host: '0.0.0.0',
      port: 9002,
      open: false,
      proxy: {
        '/api': {
          target: viteEnv.VITE_APP_API_BASE_URL,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, '/api/'),
        },
      },
    },
    clearScreen: false,
    envPrefix: ['VITE_'],
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', '@vueuse/core', 'markdown-it', 'highlight.js'],
      exclude: ['acorn'],
    },
    build: {
      target: 'es2015',
      reportCompressedSize: false,
      sourcemap: !isBuild,
      minify: isBuild ? 'esbuild' : false,
      commonjsOptions: {
        ignoreTryCatch: false,
      },
      outDir: 'dist',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // 根据文件类型分类存放
          assetFileNames: assetInfo => {
            const fileName = assetInfo.name || ''

            // 图片文件
            if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(fileName)) {
              return `images/[name]-[hash][extname]`
            }
            // 字体文件
            if (/\.(woff2?|eot|ttf|otf)$/i.test(fileName)) {
              return `fonts/[name]-[hash][extname]`
            }
            // CSS文件
            if (/\.css$/i.test(fileName)) {
              return `css/[name]-[hash][extname]`
            }
            // 其他文件
            return `assets/[name]-[hash][extname]`
          },
          // JS文件分类
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          manualChunks: resolveManualChunk,
        },
      },
    },
    esbuild: {
      drop: isBuild ? ['console', 'debugger'] : [],
    },
  }
})
