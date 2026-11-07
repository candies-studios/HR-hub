import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/HR-hub/").
// Leave it unset for Vercel / Netlify / local dev (served from "/").
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
