// The issuer's Hono application. Pure function of its dependencies so tests can
// drive it in-process with app.request() against a self-spawned Anvil.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getAddress, isAddress, type Address, type Hex, type PublicClient, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { Deployments } from '@dcv/core/chain/deployments';
import { getIssuer, isTrustedFor, trustRegistryWrites } from '@dcv/core/chain/trustRegistry';
import type { BlobStore } from '@dcv/core/ipfs/blobStore';
import { DegreeSubjectSchema } from '@dcv/core/vc/schema';
import { DEGREE_CREDENTIAL_TYPE } from '@dcv/core/vc/types';
import { listChainEvents } from './events.js';
import { claimOffer } from './issue.js';
import type { Ledger } from './ledger.js';
import { OfferStore } from './offers.js';
import { REVOCATION_LIST_ID, StatusListPublisher } from './statusList.js';
import { HolderDidMemory, issuerPrivacyScan } from './privacy.js';

export interface IssuerConfig {
  issuerName: string;
  issuerPublicUrl: string;
  walletUrl: string;
  verifierWebUrl: string;
  nonceTtlSeconds: number;
  statusListSize: number;
}

export interface IssuerDeps {
  config: IssuerConfig;
  deployments: Deployments;
  publicClient: PublicClient;
  issuerWallet: WalletClient & { account: PrivateKeyAccount };
  adminWallet: WalletClient & { account: PrivateKeyAccount };
  issuerKey: Hex;
  issuerDid: string;
  ledger: Ledger;
  blobStore: BlobStore;
  metadata: Record<string, unknown>;
  /** Seconds since epoch; tests override it. */
  now?: () => number;
}

const SubjectInput = DegreeSubjectSchema.omit({ id: true });

export function createIssuerApp(deps: IssuerDeps) {
  const { config, deployments, publicClient, issuerWallet, adminWallet, ledger } = deps;
  const offers = new OfferStore(config.nonceTtlSeconds, deps.now);
  const statusList = new StatusListPublisher({
    ledger,
    blobStore: deps.blobStore,
    publicClient,
    issuerWallet,
    issuerKey: deps.issuerKey,
    issuerDid: deps.issuerDid,
    deployments,
    issuerPublicUrl: config.issuerPublicUrl,
    listSize: config.statusListSize,
    now: deps.now,
  });
  const holderDids = new HolderDidMemory();
  const issueDeps = {
    ledger,
    statusList,
    issuerKey: deps.issuerKey,
    issuerDid: deps.issuerDid,
    issuerName: config.issuerName,
    now: deps.now,
  };

  const app = new Hono();
  app.use(
    '*',
    cors({
      origin: [config.walletUrl, config.verifierWebUrl],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );

  const offerUrl = (id: string) => `${config.issuerPublicUrl}/offers/${id}`;
  const walletLink = (id: string) => `${config.walletUrl}/#/accept?offer=${encodeURIComponent(offerUrl(id))}`;

  // ---- identity / info -------------------------------------------------------
  app.get('/health', async (c) =>
    c.json({
      ok: true,
      issuerDid: deps.issuerDid,
      statusListVersion: statusList.current()?.version ?? 0,
      pid: process.pid,
      blobStore: deps.blobStore.kind,
      credentials: ledger.rows().length,
    }),
  );
  app.get('/did', async (c) => {
    const info = await getIssuer(publicClient, deployments, issuerWallet.account.address);
    return c.json({
      did: deps.issuerDid,
      address: issuerWallet.account.address,
      name: config.issuerName,
      trusted: info.active,
      trustedFor: { [DEGREE_CREDENTIAL_TYPE]: await isTrustedFor(publicClient, deployments, issuerWallet.account.address, DEGREE_CREDENTIAL_TYPE) },
      registeredAt: Number(info.registeredAt),
      metadataURI: info.metadataURI,
    });
  });
  app.get('/config', (c) => c.json({ deployments, issuerPublicUrl: config.issuerPublicUrl, walletUrl: config.walletUrl }));
  app.get('/metadata.json', (c) => c.json(deps.metadata));

  // ---- offers & claims --------------------------------------------------------
  app.post('/credentials', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { type?: string; subject?: unknown } | null;
    if (!body || body.type !== DEGREE_CREDENTIAL_TYPE) return c.json({ error: `type must be ${DEGREE_CREDENTIAL_TYPE}` }, 400);
    const subject = SubjectInput.safeParse(body.subject);
    if (!subject.success) return c.json({ error: 'invalid subject', issues: subject.error.issues }, 400);
    const offer = offers.create(body.type, subject.data);
    return c.json({ offerId: offer.id, offerUrl: offerUrl(offer.id), walletLink: walletLink(offer.id), expiresAt: offer.expiresAt }, 201);
  });

  app.get('/offers/:id', (c) => {
    const id = c.req.param('id');
    const state = offers.state(id);
    if (state === 'unknown') return c.json({ error: 'unknown offer' }, 404);
    if (state !== 'ok') return c.json({ error: `offer ${state}` }, 410);
    const o = offers.get(id)!;
    return c.json({
      id: o.id,
      issuerDid: deps.issuerDid,
      issuerName: config.issuerName,
      type: o.type,
      nonce: o.nonce,
      expiresAt: o.expiresAt,
      subjectPreview: { name: o.subject.name, degree: o.subject.degree.name },
      claimUrl: `${offerUrl(o.id)}/claim`,
    });
  });

  app.post('/offers/:id/claim', async (c) => {
    const id = c.req.param('id');
    const state = offers.state(id);
    if (state === 'unknown') return c.json({ error: 'unknown offer' }, 404);
    if (state !== 'ok') return c.json({ error: `offer ${state}` }, 410);
    const body = (await c.req.json().catch(() => null)) as { proof?: string } | null;
    if (!body || typeof body.proof !== 'string') return c.json({ error: 'proof (JWS) required' }, 400);
    const result = await claimOffer(issueDeps, offers.get(id)!, body.proof);
    if (!result.ok) return c.json({ error: result.error }, result.status);
    offers.markClaimed(id, result.row.id);
    holderDids.remember(result.holderDid);
    return c.json({ sdJwt: result.sdJwt, credentialId: result.row.id, statusListIndex: result.row.statusListIndex });
  });

  // ---- ledger ------------------------------------------------------------------
  app.get('/credentials', (c) => c.json({ credentials: ledger.redactedRows() }));
  app.get('/credentials/:id/preview', (c) => {
    const row = ledger.find(c.req.param('id'));
    if (!row) return c.json({ error: 'unknown credential' }, 404);
    return c.json(row.signedPreview);
  });

  const setRevoked = async (id: string, revoked: boolean) => {
    const row = ledger.find(id);
    if (!row) return null;
    ledger.setRevoked(row.id, revoked);
    const published = await statusList.publish();
    return { id: row.id, revoked, statusListIndex: row.statusListIndex, version: published.version, cid: published.cid, contentHash: published.contentHash };
  };
  app.post('/credentials/:id/revoke', async (c) => {
    const r = await setRevoked(c.req.param('id'), true);
    return r ? c.json(r) : c.json({ error: 'unknown credential' }, 404);
  });
  app.post('/credentials/:id/unrevoke', async (c) => {
    const r = await setRevoked(c.req.param('id'), false);
    return r ? c.json(r) : c.json({ error: 'unknown credential' }, 404);
  });

  // ---- status list -----------------------------------------------------------
  app.get('/status/:listId', (c) => {
    const listId = Number.parseInt(c.req.param('listId'), 10);
    const current = statusList.current(listId);
    if (!current) return c.json({ error: 'no status list published' }, 404);
    return c.body(current.jwt, 200, { 'Content-Type': 'application/vc+jwt' });
  });
  app.get('/status/:listId/info', (c) => {
    const current = statusList.current(Number.parseInt(c.req.param('listId'), 10));
    if (!current) return c.json({ error: 'no status list published' }, 404);
    const { jwt: _jwt, ...rest } = current;
    return c.json({ ...rest, gatewayUrl: deps.blobStore.gatewayUrl(current.cid) });
  });
  app.post('/status/:listId/publish', async (c) => {
    const published = await statusList.publish(Number.parseInt(c.req.param('listId'), 10));
    const { jwt: _jwt, ...rest } = published;
    return c.json(rest);
  });

  // ---- governance (admin key) ----------------------------------------------------
  const parseAddr = (s: string | undefined): Address | null => (s && isAddress(s) ? getAddress(s) : null);
  app.post('/admin/issuers', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { address?: string; name?: string; metadataURI?: string } | null;
    const address = parseAddr(body?.address);
    if (!address || !body?.name) return c.json({ error: 'address and name required' }, 400);
    const txHash = await trustRegistryWrites.registerIssuer(adminWallet, publicClient, deployments, address, body.name, body.metadataURI ?? '');
    return c.json({ txHash });
  });
  app.post('/admin/issuers/:addr/revoke', async (c) => {
    const address = parseAddr(c.req.param('addr'));
    if (!address) return c.json({ error: 'bad address' }, 400);
    return c.json({ txHash: await trustRegistryWrites.revokeIssuer(adminWallet, publicClient, deployments, address) });
  });
  app.post('/admin/issuers/:addr/reactivate', async (c) => {
    const address = parseAddr(c.req.param('addr'));
    if (!address) return c.json({ error: 'bad address' }, 400);
    return c.json({ txHash: await trustRegistryWrites.reactivateIssuer(adminWallet, publicClient, deployments, address) });
  });
  app.get('/admin/issuers/:addr', async (c) => {
    const address = parseAddr(c.req.param('addr'));
    if (!address) return c.json({ error: 'bad address' }, 400);
    const info = await getIssuer(publicClient, deployments, address);
    return c.json({
      address,
      name: info.name,
      metadataURI: info.metadataURI,
      active: info.active,
      registeredAt: Number(info.registeredAt),
      trustedFor: { [DEGREE_CREDENTIAL_TYPE]: await isTrustedFor(publicClient, deployments, address, DEGREE_CREDENTIAL_TYPE) },
    });
  });
  const typeBody = async (c: { req: { json: () => Promise<unknown> } }) => {
    const body = (await c.req.json().catch(() => null)) as { issuer?: string; credentialType?: string } | null;
    const issuer = parseAddr(body?.issuer);
    return issuer && body?.credentialType ? { issuer, credentialType: body.credentialType } : null;
  };
  app.post('/admin/types', async (c) => {
    const b = await typeBody(c);
    if (!b) return c.json({ error: 'issuer and credentialType required' }, 400);
    return c.json({ txHash: await trustRegistryWrites.allowCredentialType(adminWallet, publicClient, deployments, b.issuer, b.credentialType) });
  });
  app.delete('/admin/types', async (c) => {
    const b = await typeBody(c);
    if (!b) return c.json({ error: 'issuer and credentialType required' }, 400);
    return c.json({ txHash: await trustRegistryWrites.disallowCredentialType(adminWallet, publicClient, deployments, b.issuer, b.credentialType) });
  });
  app.get('/admin/events', async (c) => c.json({ events: await listChainEvents(publicClient, deployments) }));
  app.post('/admin/reset', async (c) => {
    ledger.reset();
    offers.clear();
    holderDids.clear();
    const published = await statusList.publish();
    return c.json({ ok: true, version: published.version });
  });
  app.get('/admin/privacy-scan', async (c) => {
    try {
      return c.json(await issuerPrivacyScan({ publicClient, blobStore: deps.blobStore, ledger, holderDids }));
    } catch (err) {
      if ((err as Error).name === 'NoTerms') return c.json({ error: 'no PII in the ledger yet - issue a credential first' }, 409);
      throw err;
    }
  });

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
  });

  return {
    app,
    offers,
    statusList,
    /** Boot policy: make sure a status list is anchored before serving. */
    boot: () => statusList.ensurePublished(REVOCATION_LIST_ID),
  };
}
