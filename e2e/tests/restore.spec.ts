import { expect, test } from '@playwright/test';
import { acceptInWallet, createRequestInVerifier, issueViaApi, onboardWallet, presentInWallet, wipeWallet, WALLET } from './helpers.js';

test('backup to IPFS, wipe the browser, restore from the 12 words, present again', async ({ browser, request }) => {
  const wallet = await (await browser.newContext()).newPage();
  const verifier = await (await browser.newContext()).newPage();

  await wipeWallet(wallet);
  const mnemonic = await onboardWallet(wallet);
  await acceptInWallet(wallet, await issueViaApi(request));

  await wallet.goto(`${WALLET}/#/backup`);
  await wallet.getByRole('button', { name: 'Back up to IPFS' }).click();
  await expect(wallet.getByText(/Backed up 1 record/)).toBeVisible({ timeout: 30_000 });

  // stolen/lost device: nothing left in this browser
  await wipeWallet(wallet);
  await expect(wallet.getByRole('heading', { name: 'Create your wallet' })).toBeVisible();

  await wallet.goto(`${WALLET}/#/restore`);
  await wallet.getByPlaceholder('twelve words separated by spaces').fill(mnemonic);
  await wallet.locator('input[type=password]').fill('a brand new passphrase');
  await wallet.getByRole('button', { name: 'Restore wallet' }).click();
  await expect(wallet.getByRole('heading', { name: 'Identity restored' })).toBeVisible({ timeout: 30_000 });
  await wallet.getByRole('button', { name: 'Go to backup and restore' }).click();
  await wallet.getByRole('button', { name: 'Restore from IPFS' }).click();
  await expect(wallet.getByText(/Restored 1 record/)).toBeVisible({ timeout: 30_000 });

  await wallet.goto(`${WALLET}/#/credentials`);
  await expect(wallet.locator('.cred-card')).toHaveCount(1);

  // the re-derived pairwise key still matches the credential binding
  await presentInWallet(wallet, await createRequestInVerifier(verifier));
  await expect(wallet.getByText('8 of 8 checks passed')).toBeVisible();
});
