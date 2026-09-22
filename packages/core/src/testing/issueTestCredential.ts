// Issue a credential + publish its status list using only core primitives (no
// dependency on @dcv/issuer), so verifier tests can run against a bare Anvil.
import { keccak256, stringToBytes, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { Deployments } from '../chain/deployments.js';
import { getStatusList, publishStatusList } from '../chain/statusRegistry.js';
import { addressToDid } from '../did/ethr.js';
import { MemoryBlobStore, type BlobStore } from '../ipfs/blobStore.js';
import { issueSdJwtVc } from '../sdjwt/issue.js';
import { Bitstring } from '../status/bitstring.js';
import { buildStatusListCredential, signStatusListCredential } from '../status/credential.js';
import { SAMPLE_DEGREE_SUBJECT, buildDegreeCredential } from '../vc/build.js';
import type { DegreeSubjectInput } from '../vc/types.js';
import { secpAddress } from '../crypto/secp.js';
import type { StatusListFetcher } from '../verifier/statusFetch.js';

export interface TestIssuance {
  sdJwt: string;
  issuerDid: string;
  issuerAddress: Address;
  holderDid: string;
  holderAddress: Address;
  index: number;
  listUrl: string;
  blobStore: BlobStore;
  /** Fetcher that reads the anchor from chain and the bytes from the in-memory store. */
  fetchStatusList: StatusListFetcher;
  /** Republish the list with these revoked indices (simulates revocation). */
  republish: (revoked: number[]) => Promise<{ version: number; cid: string; jwt: string }>;
}

export async function issueTestCredential(opts: {
  publicClient: PublicClient;
  issuerWallet: WalletClient & { account: PrivateKeyAccount };
  deployments: Deployments;
  issuerKey: Hex;
  holderKey: Hex;
  issuerPublicUrl?: string;
  issuerName?: string;
  subject?: DegreeSubjectInput;
  index?: number;
  revoked?: number[];
  now?: number;
  validYears?: number;
  blobStore?: BlobStore;
}): Promise<TestIssuance> {
  const issuerAddress = opts.issuerWallet.account.address;
  const issuerDid = addressToDid(issuerAddress);
  const holderAddress = secpAddress(opts.holderKey);
  const holderDid = addressToDid(holderAddress);
  const issuerPublicUrl = opts.issuerPublicUrl ?? 'http://localhost:4001';
  const listUrl = `${issuerPublicUrl}/status/1`;
  const index = opts.index ?? 42;
  const blobStore = opts.blobStore ?? new MemoryBlobStore();
  const nowSec = opts.now ?? Math.floor(Date.now() / 1000);

  const republish = async (revoked: number[]) => {
    const bits = new Bitstring();
    for (const i of revoked) bits.set(i, true);
    const cred = buildStatusListCredential({ issuerDid, listUrl, purpose: 'revocation', encodedList: await bits.toEncodedList(), now: new Date(nowSec * 1000) });
    const jwt = await signStatusListCredential(cred, opts.issuerKey, nowSec);
    const cid = await blobStore.add(stringToBytes(jwt));
    await publishStatusList(opts.issuerWallet, opts.publicClient, opts.deployments, 1, cid, keccak256(stringToBytes(jwt)), 'revocation');
    const anchor = await getStatusList(opts.publicClient, opts.deployments, issuerAddress, 1);
    return { version: anchor.version, cid, jwt };
  };
  await republish(opts.revoked ?? []);

  const credential = buildDegreeCredential({
    issuerDid,
    issuerName: opts.issuerName ?? 'Anvil State University',
    holderDid,
    subject: opts.subject ?? SAMPLE_DEGREE_SUBJECT,
    status: { listUrl, index },
    now: new Date(nowSec * 1000),
    ...(opts.validYears !== undefined ? { validYears: opts.validYears } : {}),
  });
  const sdJwt = await issueSdJwtVc({ issuerKey: opts.issuerKey, issuerDid, credential, holderDid, now: nowSec });

  const fetchStatusList: StatusListFetcher = async (issuer, listId) => {
    const anchor = await getStatusList(opts.publicClient, opts.deployments, issuer, listId);
    if (anchor.version === 0) throw new Error('no status list anchored');
    const jwt = new TextDecoder().decode(await blobStore.cat(anchor.cid));
    return { jwt, anchor, source: 'ipfs', url: `memory://${anchor.cid}` };
  };

  return { sdJwt, issuerDid, issuerAddress, holderDid, holderAddress, index, listUrl, blobStore, fetchStatusList, republish };
}
