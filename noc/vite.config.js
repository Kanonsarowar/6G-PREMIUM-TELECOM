import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  base: '/',
  // Default esbuild target only supports browsers from ~2020 onward
  // (needed for native optional chaining/nullish coalescing, used
  // throughout this app). Older browsers get a parse-time SyntaxError
  // before any script runs at all - a fully blank page with nothing in
  // the console. es2017 forces esbuild to transpile that syntax down.
  build: {
    target: 'es2017',
  },
})
