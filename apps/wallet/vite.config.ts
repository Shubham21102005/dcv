import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

/** Serve deployments/anvil.json (written by pnpm dev) at /deployments.json, always fresh. */
function deploymentsPlugin(): Plugin {
  const file = resolve(workspaceRoot, process.env['DEPLOYMENTS_FILE'] ?? 'deployments/anvil.json');
  return {
    name: 'dcv-deployments',
    configureServer(server) {
      server.middlewares.use('/deployments.json', (_req, res) => {
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `${file} not found - run pnpm dev` }));
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.end(readFileSync(file));
      });
    },
  };
}

// VITE_* variables come from the single workspace-root .env (see PLAN.md section 11).
export default defineConfig({
  plugins: [react(), deploymentsPlugin()],
  envDir: workspaceRoot,
  server: { port: 5173, strictPort: true },
  preview: { port: 5173 },
  worker: { format: 'es' },
});
