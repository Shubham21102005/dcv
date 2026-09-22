import { expect, test } from '@playwright/test';
import { acceptInWallet, createRequestInVerifier, issueViaConsole, onboardWallet, presentInWallet, wipeWallet } from './helpers.js';

test('issuer console -> wallet -> verifier: 8 green rows, only the degree is revealed', async ({ browser }) => {
  // three origins, three browser contexts: the university, Alice, Acme
  const issuer = await (await browser.newContext()).newPage();
  const wallet = await (await browser.newContext()).newPage();
  const verifier = await (await browser.newContext()).newPage();

  await wipeWallet(wallet);
  await onboardWallet(wallet);

  const offerLink = await issueViaConsole(issuer);
  await acceptInWallet(wallet, offerLink);
  await expect(wallet.locator('.cred-card')).toContainText('Bachelor of Science in Computer Science');
  await expect(wallet.locator('.cred-card .mark')).toContainText('not revoked', { timeout: 20_000 });

  const requestLink = await createRequestInVerifier(verifier);
  await presentInWallet(wallet, requestLink);
  await expect(wallet.getByText('8 of 8 checks passed')).toBeVisible();

  // the verifier polls the API; the report appears on its own
  await expect(verifier.getByRole('heading', { name: 'Credential accepted' })).toBeVisible({ timeout: 20_000 });
  await expect(verifier.getByText('8 of 8 checks passed')).toBeVisible();
  await expect(verifier.locator('.checklist li.ok')).toHaveCount(8);
  await expect(verifier.getByText('0 requests to the issuer')).toBeVisible();

  const body = await verifier.locator('main').innerText();
  expect(body).toContain('Bachelor of Science in Computer Science');
  for (const secret of ['Alice Example', '2003-04-12', 'ASU-2026-00042', 'First Class Honours']) expect(body).not.toContain(secret);

  // the issuer's ledger shows the credential, subject redacted, holder DID only as a hash
  await issuer.reload();
  const rows = issuer.locator('#credentials tbody tr');
  await expect(rows.first()).toContainText('University Degree Credential');
  const ledgerText = await issuer.locator('#credentials').innerText();
  expect(ledgerText).not.toContain('Alice');
});
