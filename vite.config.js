import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  // GitHub Pages: change this to '/YOUR_REPOSITORY_NAME/' before deployment.
  base: '/shiv-coaching-center/',
})
