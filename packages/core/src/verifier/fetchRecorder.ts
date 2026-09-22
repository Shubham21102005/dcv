// Records every HTTP request made while one verification runs, so the report can
// prove "0 requests to the issuer" and count chain reads. Wraps globalThis.fetch,
// which is what viem (HTTP transport) and ethers (inside ethr-did-resolver) use.
export interface FetchRecord {
  outboundUrls: string[];
  chainReads: number;
  issuerContacted: boolean;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/**
 * Run `fn` with a recording fetch. Serialised through a module-level lock so two
 * concurrent verifications never mix their records.
 */
let lock: Promise<unknown> = Promise.resolve();

export function withFetchRecorder<T>(
  opts: { rpcUrl: string; issuerPublicUrl: string },
  fn: () => Promise<T>,
): Promise<{ result: T; record: FetchRecord }> {
  const run = async () => {
    const original = globalThis.fetch;
    const record: FetchRecord = { outboundUrls: [], chainReads: 0, issuerContacted: false };
    const rpcOrigin = originOf(opts.rpcUrl);
    const issuerOrigin = originOf(opts.issuerPublicUrl);
    const recording: typeof fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const origin = originOf(url);
      if (origin && origin === rpcOrigin) {
        record.chainReads += 1;
      } else {
        record.outboundUrls.push(url);
        if (issuerOrigin && origin === issuerOrigin) record.issuerContacted = true;
      }
      return original(input, init);
    };
    globalThis.fetch = recording;
    try {
      const result = await fn();
      return { result, record };
    } finally {
      globalThis.fetch = original;
    }
  };
  const next = lock.then(run, run);
  lock = next.catch(() => undefined);
  return next;
}
