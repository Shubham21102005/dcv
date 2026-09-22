import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_* variables come from the single workspace-root .env (see PLAN.md section 11).
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: { port: 5174, strictPort: true },
  preview: { port: 5174 },
});
