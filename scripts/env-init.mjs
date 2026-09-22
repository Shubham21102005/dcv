// Copy .env.example -> .env if .env does not exist (pnpm env:init).
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './env.mjs';

const target = resolve(root, '.env');
if (existsSync(target)) {
  console.log('.env already exists - nothing to do');
} else {
  copyFileSync(resolve(root, '.env.example'), target);
  console.log('created .env from .env.example');
}
