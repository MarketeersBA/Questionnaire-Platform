import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['localhost', '127.0.0.1', '192.168.1.12', 'frontend', 'questioner_frontend'],
    proxy: {
      '/api': {
        target: 'http://backend:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const remote =
              (req.socket as { remoteAddress?: string } | undefined)?.remoteAddress;
            if (remote) {
              proxyReq.setHeader('X-Forwarded-For', remote);
            }
          });
        },
      }
    }
  }
})
