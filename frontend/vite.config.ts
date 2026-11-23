import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, les appels /api/* sont relayés vers le backend FastAPI (uvicorn, port 8000 par défaut).
// Pour pointer ailleurs : VITE_PROXY_TARGET=http://autre-hote:8000 npm run dev
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true }
    }
  }
});
