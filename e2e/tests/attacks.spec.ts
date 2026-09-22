import { expect, test } from '@playwright/test';
import { acceptInWallet, createRequestInVerifier, issueViaApi, onboardWallet, presentInWallet, wipeWallet } from './helpers.js';

test('attack lab: each button turns exactly one row red', async ({ browser, request }) => {
  const wallet = await (await browser.newContext()).newPage();
  const verifier = await (await browser.newContext()).newPage();

  await wipeWallet(wallet);
  await onboardWallet(wallet);
  await acceptInWallet(wallet, await issueViaApi(request));
  await presentInWallet(wallet, await createRequestInVerifier(verifier));
  await expect(verifier.getByRole('heading', { name: 'Credential accepted' })).toBeVisible({ timeout: 20_000 });

  const expected: Array<[string, string]> = [
    ['Tamper a disclosure', 'DISCLOSURE_DIGEST_MISMATCH'],
    ['Replay', 'NONCE_REPLAY'],
    ['Expire', 'KB_STALE'],
    ['Wrong audience', 'AUD_MISMATCH'],
  ];
  for (const [label, code] of expected) {
    await verifier.locator('button.attack', { hasText: label }).click();
    const after = verifier.locator('.report', { hasText: `After "${label}"` });
    await expect(after).toBeVisible();
    await expect(after.locator('.checklist li.bad')).toHaveCount(1);
    await expect(after.locator('.checklist li.bad')).toContainText(code);
    await expect(after.locator('.checklist li.ok')).toHaveCount(7);
  }

  // the real report is untouched
  await expect(verifier.locator('.report', { hasText: 'Credential accepted' }).locator('.checklist li.ok')).toHaveCount(8);
});
