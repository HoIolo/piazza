import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Tauri 在开发时通过固定端口访问前端，端口被占用时必须直接失败而非静默换端口，
// 否则 Rust 侧连的是旧端口、前端跑在新端口，表现为白屏且难以定位。
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    target: 'safari15',
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // src-tauri 由 cargo 自己监听，Vite 再监听会造成重复重启
      ignored: ['**/src-tauri/**'],
    },
  },
})
