import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 简化配置，与工作版本 WaKuChat_3 保持一致
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    proxy: {
      // 代理本地 nwaku REST API 请求
      '/nwaku-api-1': {
        target: 'http://localhost:8646',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nwaku-api-1/, ''),
      },
      '/nwaku-api-2': {
        target: 'http://localhost:8647',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nwaku-api-2/, ''),
      },
    },
  },
});
