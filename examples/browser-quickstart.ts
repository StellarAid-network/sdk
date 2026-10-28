/**
 * Browser (client-side) Quick Start Example for @stellar-aid/sdk.
 *
 * Mirrors the README Quick Start sections:
 * 1. Configure the SDK
 * 2. Create a giveaway (claimable balance)
 * 3. Claim a giveaway
 * 4. Contribute to a help request (Soroban)
 */
import { createStellarAid } from "../dist/index.js";
import { predicates } from "../dist/giveaways.js";

// Mock browser wallet adapter (e.g. Stellar Wallets Kit in `web`)
const wallet = {
  async signTransaction(unsignedXdr: string): Promise<string> {
    return `SIGNED(${unsignedXdr.slice(0, 24)}...)`;
  },
};

async function main() {
  const aid = createStellarAid({ network: "testnet" });

  // Inject mock account loader and Soroban client so example runs offline without RPC
  const creator = "GCFGKLCBV5IGJYGRR7FJNU53HFV5674PMQNNJT6HRAFGUAHZ7V3ZELXR";
  const claimerA = "GBTYIQPBLDAXZ3DGFY5KAYFHRVGOF5V5GU263RTRVQQOAIICCW5S4VEQ";
  const claimerB = "GD5DJQDDBKGAYNEAXU562HYGOOSYAEOO6AS53PZXBOZGCP5M2OPGMZV3";

  // 1. Predicate helpers for claimable balances
  const windowPred = predicates.window({
    from: new Date(),
    until: new Date(Date.now() + 7 * 864e5),
  });
  console.log("Built claimable window predicate:", JSON.stringify(windowPred));

  // 2. Contribute to a help request (Soroban wrapper)
  aid.helpRequests.rawClient.contribute = (async () => ({
    toXDR: () => "AAAA_UNSIGNED_HELP_REQUEST_CONTRIBUTE_XDR",
  })) as never;

  const tx = await aid.helpRequests.contribute({
    requestId: 42n,
    contributor: claimerA,
    amount: "25.00",
  });

  const signedXdr = await wallet.signTransaction(tx.xdr);
  console.log("Prepared and signed help request contribution:", {
    creator,
    contributor: claimerA,
    coClaimer: claimerB,
    signedXdr,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
