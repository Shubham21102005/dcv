// Main-thread side of the KDF worker: a WrapKeyDeriver for Keyring options.
import { importWrapKey, type KdfParams, type WrapKeyDeriver } from '@dcv/core/vault/kdf';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (raw: Uint8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/kdf.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: number; raw?: Uint8Array; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.raw) p.resolve(new Uint8Array(e.data.raw));
    else p.reject(new Error(e.data.error ?? 'kdf failed'));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message));
    pending.clear();
  };
  return worker;
}

export const workerDeriveWrapKey: WrapKeyDeriver = async (passphrase: string, kdf: KdfParams) => {
  const id = ++seq;
  const raw = await new Promise<Uint8Array>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, passphrase, kdf });
  });
  return importWrapKey(raw);
};
