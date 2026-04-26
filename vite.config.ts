import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// COOP/COEP unlock SharedArrayBuffer for WebLLM's WebGPU + WASM threading.
// Without these, `crossOriginIsolated` is false and WebLLM falls back to a
// slower path (or fails) on some browsers.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
} as const;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
})
