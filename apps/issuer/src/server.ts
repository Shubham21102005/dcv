// Issuer service entry point: Hono API + static console on ISSUER_PORT.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromRoot, loadEnv } from '@dcv/core/chain/deploymentsNode';
import { getConfig } from '@dcv/core/config';
import { createIssuerApp } from './app.js';
import { buildIssuerDeps } from './deps.js';

loadEnv();
const cfg = getConfig();
const deps = await buildIssuerDeps();
const { app, boot, statusList } = createIssuerApp(deps);

// Static console (public/index.html) - after the API routes so they win.
const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.use('/*', serveStatic({ root: publicDir }));

const published = await boot();
console.log(`[issuer] ${deps.issuerDid}`);
console.log(`[issuer] status list v${published.version} cid ${published.cid} (${deps.blobStore.kind})`);

const pidFile = fromRoot('data/issuer.pid');
mkdirSync(dirname(pidFile), { recursive: true });
writeFileSync(pidFile, String(process.pid));
const cleanup = () => {
  try {
    unlinkSync(pidFile);
  } catch {
    /* already gone */
  }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));

serve({ fetch: app.fetch, port: cfg.issuerPort, hostname: '127.0.0.1' }, (info) => {
  console.log(`[issuer] listening on http://localhost:${info.port} (pid ${process.pid}, list v${statusList.current()?.version})`);
});
