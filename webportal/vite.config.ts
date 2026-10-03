import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Deployed under /webportal/ next to the marketing site.
  base: '/webportal/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
