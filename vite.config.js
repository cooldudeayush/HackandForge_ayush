import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log("Server Port:", env.VITE_DEV_PORT)
  const devPort = Number(env.VITE_DEV_PORT || 3002)

  return {
    plugins: [react()],
    server: {
      port: devPort,
      proxy: {
        '/api': {
          target: 'http://localhost:3030',
          changeOrigin: true
        }
      }
    }
  }
})
