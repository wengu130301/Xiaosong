import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api/zhipu': {
        target: 'https://open.bigmodel.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zhipu/, '/api/paas')
      },
      '/api/amap': {
        target: 'https://restapi.amap.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/amap/, '/v3')
      }
    }
  }
})