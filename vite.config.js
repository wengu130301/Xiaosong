import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: [
        './calculator.html',
        './clock.html',
        './map.html',
        './weather.html',
        './memo.html',
        './discover.html',
        './profile.html',
        './square.html',
        './browser.html',
        './id.html'
      ],
      output: {
        assetFileNames: 'css/[name].[ext]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js'
      }
    }
  },
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
