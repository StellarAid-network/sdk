/**
 * Pull the deployments JSON (`testnet.json`, `mainnet.json`) from the `contracts`
 * repository into `src/deployments/`.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ContractDeploymentEntry {
  id: string;
  wasmHash?: string;
}

interface ContractsDeploymentsFile {
  network: string;
  networkPassphrase: string;
  contracts: {
    help_request: ContractDeploymentEntry | string;
    reputation: ContractDeploymentEntry | string;
    attestation: ContractDeploymentEntry | string;
  };
}

function resolveContractId(entry: ContractDeploymentEntry | string | undefined): string {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.id || "";
}

function syncNetwork(network: string) {
  const root = path.resolve(__dirname, "..");
  const contractsDeployPath = path.resolve(root, `../contracts/deployments/${network}.json`);
  const sdkDeployPath = path.resolve(root, `src/deployments/${network}.json`);

  if (!fs.existsSync(contractsDeployPath)) {
    console.warn(`Contracts deployment file not found at ${contractsDeployPath}, skipping.`);
    return;
  }

  const raw = fs.readFileSync(contractsDeployPath, "utf-8");
  const data: ContractsDeploymentsFile = JSON.parse(raw);

  const sdkDeployData = {
    network: data.network,
    networkPassphrase: data.networkPassphrase,
    contracts: {
      help_request: resolveContractId(data.contracts.help_request),
      reputation: resolveContractId(data.contracts.reputation),
      attestation: resolveContractId(data.contracts.attestation),
    },
  };

  fs.writeFileSync(sdkDeployPath, `${JSON.stringify(sdkDeployData, null, 2)}\n`);
  console.log(`Synced ${network} deployments to ${sdkDeployPath}`);
}

syncNetwork("testnet");
syncNetwork("mainnet");
