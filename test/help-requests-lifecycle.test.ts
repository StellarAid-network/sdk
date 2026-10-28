import type { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { ContractError, createStellarAid, parseAmount } from "../src";

interface SimulatedRequestState {
  id: bigint;
  creator: string;
  token: string;
  goal: bigint;
  raised: bigint;
  total_released: bigint;
  deadline: bigint;
  status: { tag: string };
  content_hash: Buffer;
  milestones: Array<{
    index: number;
    amount: bigint;
    evidence_hash: Buffer | null;
    released: boolean;
  }>;
  created_at: bigint;
  contributions: Map<string, bigint>;
  approvals: Map<number, Set<string>>;
}

/**
 * Attaches an in-memory Soroban contract state machine to `aid.helpRequests.rawClient`
 * so full wrapper lifecycles (amount formatting, byte normalization, simulation,
 * state transitions, and error mapping) execute deterministically in CI.
 */
function attachMockHelpRequestChain(aid: ReturnType<typeof createStellarAid>) {
  let nextId = 1n;
  let now = 1_700_000_000n;
  const requests = new Map<bigint, SimulatedRequestState>();
  const client = aid.helpRequests.rawClient as unknown as Record<string, unknown>;

  client.create_request = async (args: {
    creator: string;
    token: string;
    goal: bigint;
    deadline: bigint;
    milestones: Array<{ index: number; amount: bigint; evidence_hash?: Buffer; released: boolean }>;
    content_hash: Buffer;
  }) => {
    if (args.goal <= 0n) {
      throw new Error("HostError: Error(Contract, #4)");
    }
    if (args.deadline <= now) {
      throw new Error("HostError: Error(Contract, #5)");
    }
    const id = nextId++;
    const milestones =
      args.milestones.length > 0
        ? args.milestones.map((m) => ({
            index: m.index,
            amount: m.amount,
            evidence_hash: m.evidence_hash ?? null,
            released: false,
          }))
        : [{ index: 0, amount: args.goal, evidence_hash: null, released: false }];

    requests.set(id, {
      id,
      creator: args.creator,
      token: args.token,
      goal: args.goal,
      raised: 0n,
      total_released: 0n,
      deadline: args.deadline,
      status: { tag: "Open" },
      content_hash: args.content_hash,
      milestones,
      created_at: now,
      contributions: new Map(),
      approvals: new Map(),
    });

    return {
      toXDR: () => `UNSIGNED_CREATE_XDR_${id}`,
      simulate: async () => ({ result: { retval: id } }),
      result: id,
    };
  };

  client.get_request = async ({ request_id }: { request_id: bigint }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    return {
      toXDR: () => `UNSIGNED_GET_XDR_${request_id}`,
      simulate: async () => ({ result: { retval: req } }),
      result: req,
    };
  };

  client.contribute = async ({
    request_id,
    contributor,
    amount,
  }: {
    request_id: bigint;
    contributor: string;
    amount: bigint;
  }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    if (req.status.tag !== "Open") throw new Error("HostError: Error(Contract, #7)");
    if (now >= req.deadline) throw new Error("HostError: Error(Contract, #5)");
    if (amount <= 0n) throw new Error("HostError: Error(Contract, #4)");

    const prev = req.contributions.get(contributor) ?? 0n;
    req.contributions.set(contributor, prev + amount);
    req.raised += amount;
    if (req.raised >= req.goal) {
      req.status = { tag: "Funded" };
    }
    return {
      toXDR: () => `UNSIGNED_CONTRIBUTE_XDR_${request_id}_${amount}`,
    };
  };

  client.get_contribution = async ({
    request_id,
    contributor,
  }: {
    request_id: bigint;
    contributor: string;
  }) => {
    const req = requests.get(request_id);
    const val = req?.contributions.get(contributor) ?? 0n;
    return {
      toXDR: () => "UNSIGNED_GET_CONTRIBUTION",
      simulate: async () => ({ result: { retval: val } }),
      result: val,
    };
  };

  client.finalize = async ({ request_id }: { request_id: bigint }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    if (req.status.tag !== "Open") throw new Error("HostError: Error(Contract, #7)");
    if (now < req.deadline) throw new Error("HostError: Error(Contract, #6)");
    req.status = { tag: req.raised >= req.goal ? "Funded" : "Failed" };
    return {
      toXDR: () => `UNSIGNED_FINALIZE_XDR_${request_id}`,
    };
  };

  client.cancel = async ({ request_id }: { request_id: bigint }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    if (req.status.tag !== "Open") throw new Error("HostError: Error(Contract, #7)");
    req.status = { tag: "Cancelled" };
    return {
      toXDR: () => `UNSIGNED_CANCEL_XDR_${request_id}`,
    };
  };

  client.submit_milestone = async ({
    request_id,
    index,
    evidence_hash,
  }: {
    request_id: bigint;
    index: number;
    evidence_hash: Buffer;
  }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    const m = req.milestones[index];
    if (!m) throw new Error("HostError: Error(Contract, #11)");
    m.evidence_hash = evidence_hash;
    return {
      toXDR: () => `UNSIGNED_SUBMIT_MILESTONE_${request_id}_${index}`,
    };
  };

  client.approve_milestone = async ({
    request_id,
    index,
    approver,
  }: {
    request_id: bigint;
    index: number;
    approver: string;
  }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    const m = req.milestones[index];
    if (!m) throw new Error("HostError: Error(Contract, #11)");
    if (!m.evidence_hash) throw new Error("HostError: Error(Contract, #13)");
    const set = req.approvals.get(index) ?? new Set<string>();
    if (set.has(approver)) throw new Error("HostError: Error(Contract, #15)");
    set.add(approver);
    req.approvals.set(index, set);
    return {
      toXDR: () => `UNSIGNED_APPROVE_MILESTONE_${request_id}_${index}`,
    };
  };

  client.release_milestone = async ({
    request_id,
    index,
  }: {
    request_id: bigint;
    index: number;
  }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    const m = req.milestones[index];
    if (!m) throw new Error("HostError: Error(Contract, #11)");
    const approvals = req.approvals.get(index)?.size ?? 0;
    if (approvals < 1) throw new Error("HostError: Error(Contract, #16)");
    m.released = true;
    req.total_released += m.amount;
    const allReleased = req.milestones.every((ms) => ms.released);
    req.status = { tag: allReleased ? "Completed" : "Releasing" };
    return {
      toXDR: () => `UNSIGNED_RELEASE_MILESTONE_${request_id}_${index}`,
    };
  };

  client.refund = async ({
    request_id,
    contributor,
  }: {
    request_id: bigint;
    contributor: string;
  }) => {
    const req = requests.get(request_id);
    if (!req) throw new Error("HostError: Error(Contract, #3)");
    if (!["Failed", "Cancelled", "Disputed"].includes(req.status.tag)) {
      throw new Error("HostError: Error(Contract, #7)");
    }
    const bal = req.contributions.get(contributor) ?? 0n;
    if (bal <= 0n) throw new Error("HostError: Error(Contract, #10)");
    req.contributions.set(contributor, 0n);
    return {
      toXDR: () => `UNSIGNED_REFUND_XDR_${request_id}_${contributor}`,
    };
  };

  return {
    setNow: (t: bigint) => {
      now = t;
    },
  };
}

describe("HelpRequest full lifecycles via SDK wrappers", () => {
  const creator = "GCFGKLCBV5IGJYGRR7FJNU53HFV5674PMQNNJT6HRAFGUAHZ7V3ZELXR";
  const donor1 = "GBTYIQPBLDAXZ3DGFY5KAYFHRVGOF5V5GU263RTRVQQOAIICCW5S4VEQ";
  const donor2 = "GD5DJQDDBKGAYNEAXU562HYGOOSYAEOO6AS53PZXBOZGCP5M2OPGMZV3";
  const approver = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
  const token = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  it("completes full lifecycle: create -> contribute -> milestones -> completed", async () => {
    const aid = createStellarAid({ network: "local" });
    attachMockHelpRequestChain(aid);

    const createTx = await aid.helpRequests.create({
      creator,
      token,
      goal: "100.00",
      deadline: 1_700_086_400,
      contentHash: "a".repeat(64),
      milestones: [
        { index: 0, amount: "40.00" },
        { index: 1, amount: "60.00" },
      ],
    });
    expect(createTx.xdr).toContain("UNSIGNED_CREATE_XDR_1");

    // Contribute 40 + 60 = 100
    await aid.helpRequests.contribute({ requestId: 1n, contributor: donor1, amount: "40.00" });
    await aid.helpRequests.contribute({ requestId: 1n, contributor: donor2, amount: "60.00" });

    let details = await aid.helpRequests.get(1n);
    expect(details.status).toBe("Funded");
    expect(details.raisedFormatted).toBe("100.0000000");

    // Milestone 0: submit -> approve -> release
    await aid.helpRequests.submitMilestone({
      requestId: 1n,
      index: 0,
      evidenceHash: "b".repeat(64),
    });
    await aid.helpRequests.approveMilestone({ requestId: 1n, index: 0, approver });
    await aid.helpRequests.releaseMilestone({ requestId: 1n, index: 0 });

    details = await aid.helpRequests.get(1n);
    expect(details.status).toBe("Releasing");
    expect(details.totalReleasedFormatted).toBe("40.0000000");
    expect(details.milestones[0]?.released).toBe(true);

    // Milestone 1: submit -> approve -> release -> Completed
    await aid.helpRequests.submitMilestone({
      requestId: 1n,
      index: 1,
      evidenceHash: "c".repeat(64),
    });
    await aid.helpRequests.approveMilestone({ requestId: 1n, index: 1, approver });
    await aid.helpRequests.releaseMilestone({ requestId: 1n, index: 1 });

    details = await aid.helpRequests.get(1n);
    expect(details.status).toBe("Completed");
    expect(details.totalReleasedFormatted).toBe("100.0000000");
  });

  it("handles failed goal + refund lifecycle and rejects double refund", async () => {
    const aid = createStellarAid({ network: "local" });
    const chain = attachMockHelpRequestChain(aid);

    await aid.helpRequests.create({
      creator,
      token,
      goal: "100.00",
      deadline: 1_700_010_000,
      contentHash: "d".repeat(64),
    });

    await aid.helpRequests.contribute({ requestId: 1n, contributor: donor1, amount: "25.00" });
    expect(await aid.helpRequests.getContribution(1n, donor1)).toBe(parseAmount("25.00"));

    // Finalizing before deadline maps to ContractError DeadlineNotReached
    await expect(aid.helpRequests.finalize({ requestId: 1n })).rejects.toMatchObject({
      name: "DeadlineNotReached",
      code: 6,
    });

    // Advance past deadline and finalize -> Failed
    chain.setNow(1_700_010_001n);
    await aid.helpRequests.finalize({ requestId: 1n });

    const details = await aid.helpRequests.get(1n);
    expect(details.status).toBe("Failed");

    // Claim refund
    const refundTx = await aid.helpRequests.refund({ requestId: 1n, contributor: donor1 });
    expect(refundTx.xdr).toContain("UNSIGNED_REFUND_XDR_1");
    expect(await aid.helpRequests.getContribution(1n, donor1)).toBe(0n);

    // Double refund maps to NothingToRefund
    await expect(
      aid.helpRequests.refund({ requestId: 1n, contributor: donor1 }),
    ).rejects.toBeInstanceOf(ContractError);
    await expect(
      aid.helpRequests.refund({ requestId: 1n, contributor: donor1 }),
    ).rejects.toMatchObject({
      name: "NothingToRefund",
      code: 10,
    });
  });

  it("handles cancel + refund lifecycle before goal is met", async () => {
    const aid = createStellarAid({ network: "local" });
    attachMockHelpRequestChain(aid);

    await aid.helpRequests.create({
      creator,
      token,
      goal: "50.00",
      deadline: 1_700_050_000,
      contentHash: "e".repeat(64),
    });

    await aid.helpRequests.contribute({ requestId: 1n, contributor: donor1, amount: "15.00" });
    await aid.helpRequests.cancel({ requestId: 1n });

    const details = await aid.helpRequests.get(1n);
    expect(details.status).toBe("Cancelled");

    const refundTx = await aid.helpRequests.refund({ requestId: 1n, contributor: donor1 });
    expect(refundTx.xdr).toContain("UNSIGNED_REFUND_XDR_1");
    expect(await aid.helpRequests.getContribution(1n, donor1)).toBe(0n);
  });
});
