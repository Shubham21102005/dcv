// argon2id off the main thread. Receives { passphrase, kdf }, answers { raw } (32 bytes)
// which the main thread imports as a non-extractable CryptoKey and discards.
import { deriveWrapKeyBytes, type KdfParams } from '@dcv/core/vault/kdf';

self.onmessage = async (e: MessageEvent<{ id: number; passphrase: string; kdf: KdfParams }>) => {
  const { id, passphrase, kdf } = e.data;
  try {
    const raw = await deriveWrapKeyBytes(passphrase, kdf);
    (self as unknown as Worker).postMessage({ id, raw }, [raw.buffer as ArrayBuffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
