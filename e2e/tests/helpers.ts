import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const ISSUER = 'http://localhost:4001';
export const WALLET = 'http://localhost:5173';
export const VERIFIER_WEB = 'http://localhost:5174';
export const VERIFIER_API = 'http://localhost:4002';
export const PASSPHRASE = 'correct horse battery staple';

export const SUBJECT = {
  name: 'Alice Example',
  birthDate: '2003-04-12',
  studentId: 'ASU-2026-00042',
  degree: { type: 'BachelorDegree', name: 'Bachelor of Science in Computer Science', grade: 'First Class Honours', awardedOn: '2026-06-30' },
};

/** Wipe the wallet's IndexedDB so every spec starts from a fresh identity. */
export async function wipeWallet(page: Page): Promise<void> {
  await page.goto(WALLET);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('dcv');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
  );
  await page.goto(`${WALLET}/#/`);
  await page.reload();
}

/** Create identity in the wallet; returns the 12-word mnemonic shown once. */
export async function onboardWallet(page: Page, passphrase = PASSPHRASE): Promise<string> {
  await page.goto(`${WALLET}/#/`);
  await expect(page.getByRole('heading', { name: 'Create your identity' })).toBeVisible();
  const inputs = page.locator('input[type=password]');
  await inputs.nth(0).fill(passphrase);
  await inputs.nth(1).fill(passphrase);
  await page.getByRole('button', { name: 'Create identity' }).click();
  await expect(page.getByRole('heading', { name: 'Write these 12 words down' })).toBeVisible({ timeout: 30_000 });
  const words = await page.locator('.mnemonic li').allTextContents();
  const mnemonic = words.map((w) => w.replace(/^\d+/, '').trim()).join(' ');
  expect(mnemonic.split(' ')).toHaveLength(12);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Open my vault' }).click();
  await expect(page.getByRole('heading', { name: 'My credentials' })).toBeVisible();
  return mnemonic;
}

/** Issue through the console UI (click Issue) and return the "Open in wallet" link. */
export async function issueViaConsole(page: Page): Promise<string> {
  await page.goto(ISSUER);
  await expect(page.locator('#id-did')).toContainText('did:ethr:anvil:');
  await page.getByRole('button', { name: 'Issue → create offer' }).click();
  const link = page.locator('#offer-link');
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!;
}

/** Issue through the API (faster) and return the wallet link. */
export async function issueViaApi(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${ISSUER}/credentials`, { data: { type: 'UniversityDegreeCredential', subject: SUBJECT } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { walletLink: string }).walletLink;
}

export async function acceptInWallet(page: Page, walletLink: string): Promise<void> {
  await page.goto(walletLink);
  await expect(page.getByRole('heading', { name: 'Credential offer' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept credential' }).click();
  await expect(page.getByText('Encrypted and stored')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open my vault' }).click();
  await expect(page.locator('.cred')).toHaveCount(1);
}

/** Create a request in the verifier web UI (Degree ticked by default) and return the wallet link. */
export async function createRequestInVerifier(page: Page): Promise<string> {
  await page.goto(VERIFIER_WEB);
  await page.getByRole('button', { name: 'Create request' }).click();
  const link = page.getByRole('link', { name: 'Open in wallet' }).first();
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!;
}

export async function presentInWallet(page: Page, requestLink: string): Promise<void> {
  await page.goto(requestLink);
  await expect(page.getByRole('heading', { name: /asks for/ })).toBeVisible();
  await page.getByRole('button', { name: /^Present \d+ claim/ }).click();
  await expect(page.getByRole('heading', { name: /Accepted by/ })).toBeVisible({ timeout: 30_000 });
}
