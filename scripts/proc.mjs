// Tiny process manager used by dev.mjs / reset.mjs: spawn with prefixed logs,
// tree-kill on Windows, wait for TCP ports.
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { root } from './env.mjs';

const COLORS = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[32m', '\x1b[34m', '\x1b[91m'];
let colorIndex = 0;
const RESET = '\x1b[0m';

/** Spawn a child whose stdout/stderr lines are prefixed with `[name]`. */
export function run(name, command, args, opts = {}) {
  const color = COLORS[colorIndex++ % COLORS.length];
  const child = spawn(command, args, {
    cwd: opts.cwd ?? root,
    env: { ...process.env, FORCE_COLOR: '1', ...(opts.env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const prefix = `${color}[${name}]${RESET} `;
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.trim() || opts.keepBlank) process.stdout.write(prefix + line + '\n');
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => {
    process.stdout.write(`${prefix}exited (${signal ?? code})\n`);
    opts.onExit?.(code, signal);
  });
  child.on('error', (err) => process.stdout.write(`${prefix}failed to start: ${err.message}\n`));
  return child;
}

/** Kill a process tree (Windows needs taskkill /T; POSIX children get SIGTERM). */
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function portOpen(port, host = '127.0.0.1') {
  return new Promise((done) => {
    const socket = connect({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      done(false);
    });
  });
}

/** Resolve when every port accepts TCP connections on 127.0.0.1 or ::1 (Vite binds "localhost", often IPv6). */
export async function waitForPorts(ports, timeoutMs = 60_000) {
  const start = Date.now();
  const pending = new Set(ports);
  while (pending.size) {
    for (const p of [...pending]) if ((await portOpen(p)) || (await portOpen(p, '::1'))) pending.delete(p);
    if (!pending.size) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ports ${[...pending].join(', ')}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** PIDs listening on a TCP port. */
export function pidsOnPort(port) {
  if (process.platform === 'win32') {
    // Both TCP (IPv4) and TCPv6 rows: Vite binds "localhost", which is often [::1].
    const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '';
    const pids = new Set();
    for (const line of out.split('\n')) {
      const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
      if (m && Number(m[1]) === port) pids.add(Number(m[2]));
    }
    return [...pids];
  }
  const out = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout ?? '';
  return out.split('\n').map((s) => Number(s.trim())).filter(Boolean);
}

/** Paths to JS entries of workspace binaries so we never need a shell (.cmd shims). */
export const nodeBin = {
  tsx: resolve(root, 'node_modules/tsx/dist/cli.mjs'),
  /** vite is a dependency of each web app (pnpm does not hoist), so resolve it per app dir. */
  vite: (appDir) => resolve(appDir, 'node_modules/vite/bin/vite.js'),
};
