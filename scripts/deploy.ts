// pnpm deploy:local - deploy + seed the contracts on the running Anvil and write
// deployments/anvil.json (or $DEPLOYMENTS_FILE).
import { getConfig } from '@dcv/core/config';
import { deployAll, issuerAddressFromKey } from '@dcv/core/chain/deploy';
import { writeDeploymentsFile } from '@dcv/core/chain/deploymentsNode';
import './env.mjs';

const cfg = getConfig();
const deployments = await deployAll({
  rpcUrl: cfg.rpcUrl,
  adminPrivateKey: cfg.adminPrivateKey,
  issuerAddress: issuerAddressFromKey(cfg.issuerPrivateKey),
  issuerName: cfg.issuerName,
  // A plain URL served by the issuer app; no IPFS dependency at deploy time.
  issuerMetadataURI: `${cfg.issuerPublicUrl}/metadata.json`,
  log: (line) => console.log(line),
});
const file = writeDeploymentsFile(cfg.deploymentsFile, deployments);
console.log(`issuer DID ${deployments.issuer.did}`);
console.log(`wrote ${file}`);
