/**
 * Regenerate the generated contract bindings in `src/generated/` from the deployed contracts.
 *
 * Never edit `src/generated/` by hand; this script is the only writer.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SdkDeploymentsFile {
  network: string;
  networkPassphrase: string;
  contracts: {
    help_request: string;
    reputation: string;
    attestation: string;
  };
}

function generateBindings(network: string = "testnet") {
  const root = path.resolve(__dirname, "..");
  const deployFilePath = path.resolve(root, `src/deployments/${network}.json`);
  const outputBase = path.resolve(root, "src/generated");

  if (!fs.existsSync(deployFilePath)) {
    throw new Error(`Deployment file ${deployFilePath} not found.`);
  }

  const raw = fs.readFileSync(deployFilePath, "utf-8");
  const data: SdkDeploymentsFile = JSON.parse(raw);

  const contracts = [
    { name: "help_request", id: data.contracts.help_request },
    { name: "reputation", id: data.contracts.reputation },
    { name: "attestation", id: data.contracts.attestation },
  ];

  for (const { name, id } of contracts) {
    if (!id) {
      console.warn(`No contract ID for ${name} on ${network}, skipping.`);
      continue;
    }
    const outDir = path.join(outputBase, name);
    console.log(`Generating bindings for ${name} (${id}) on ${network}...`);
    execSync(
      `stellar contract bindings typescript --contract-id "${id}" --network "${network}" --output-dir "${outDir}" --overwrite`,
      { stdio: "inherit" },
    );

    const generatedIndex = path.join(outDir, "src", "index.ts");
    if (fs.existsSync(generatedIndex)) {
      let content = fs.readFileSync(generatedIndex, "utf-8");

      // Filter out ScSpecEntryKind >= 5 (e.g. ScSpecEntryEvent) unsupported by stellar-sdk 13 js-xdr
      content = content.replace(/new ContractSpec\(\[\s*([\s\S]*?)\]\)/, (_match, entriesStr) => {
        const rawEntries = entriesStr
          .split(",")
          .map((s: string) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        const filtered = rawEntries.filter((e: string) => {
          try {
            const buf = Buffer.from(e, "base64");
            return buf.readInt32BE(0) < 5;
          } catch {
            return true;
          }
        });
        const formatted = filtered.map((e: string) => ` "${e}"`).join(",\n       ");
        return `new ContractSpec([\n       ${formatted}\n      ])`;
      });

      if (!content.startsWith("// @ts-nocheck")) {
        content = `// @ts-nocheck\n${content}`;
      }
      fs.writeFileSync(generatedIndex, content);
    }
  }

  console.log("All bindings generated successfully.");
}

const network = process.argv[2] || "testnet";
generateBindings(network);
