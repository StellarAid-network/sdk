import { describe, expectTypeOf, it } from "vitest";
import {
  createStellarAid,
  formatAmount,
  parseAmount,
  decodeEvent,
  type StellarAidError,
  type ContractError,
  type ValidationError,
  type HelpRequestDetails,
  type StellarAidEvent,
  type ReputationBadge,
  type AttestationItem,
} from "../src";
import { auth } from "../src/auth";
import { predicates } from "../src/giveaways";

describe("Public API signature type tests (expectTypeOf)", () => {
  const aid = createStellarAid({ network: "testnet" });

  it("locks createStellarAid client structure", () => {
    expectTypeOf(aid.config.network).toEqualTypeOf<"testnet" | "mainnet" | "local">();
    expectTypeOf(aid.submit).toBeFunction();
    expectTypeOf(aid.submit).parameter(0).toBeString();
  });

  it("locks HelpRequestsModule method signatures", () => {
    expectTypeOf(aid.helpRequests.create).toBeFunction();
    expectTypeOf(aid.helpRequests.get).toBeFunction();
    expectTypeOf(aid.helpRequests.get).returns.toEqualTypeOf<Promise<HelpRequestDetails>>();
    expectTypeOf(aid.helpRequests.contribute).toBeFunction();
    expectTypeOf(aid.helpRequests.finalize).toBeFunction();
    expectTypeOf(aid.helpRequests.refund).toBeFunction();
    expectTypeOf(aid.helpRequests.cancel).toBeFunction();
    expectTypeOf(aid.helpRequests.submitMilestone).toBeFunction();
    expectTypeOf(aid.helpRequests.approveMilestone).toBeFunction();
    expectTypeOf(aid.helpRequests.releaseMilestone).toBeFunction();
    expectTypeOf(aid.helpRequests.getContribution).returns.toEqualTypeOf<Promise<bigint>>();
  });

  it("locks ReputationModule and AttestationsModule method signatures", () => {
    expectTypeOf(aid.reputation.getScore).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(aid.reputation.getBadges).returns.toEqualTypeOf<Promise<ReputationBadge[]>>();
    expectTypeOf(aid.attestations.get).returns.toEqualTypeOf<Promise<AttestationItem[]>>();
    expectTypeOf(aid.attestations.attest).toBeFunction();
    expectTypeOf(aid.attestations.revoke).toBeFunction();
  });

  it("locks Giveaways, Payments, Assets, Events, and Auth signatures", () => {
    expectTypeOf(aid.giveaways.buildCreate).toBeFunction();
    expectTypeOf(aid.giveaways.buildClaim).toBeFunction();
    expectTypeOf(aid.giveaways.buildReclaim).toBeFunction();
    expectTypeOf(aid.giveaways.listClaimable).toBeFunction();
    expectTypeOf(aid.giveaways.evaluateEligibility).toBeFunction();
    expectTypeOf(predicates.window).toBeFunction();
    expectTypeOf(predicates.unconditional).toBeFunction();
    expectTypeOf(predicates.creatorAfter).toBeFunction();

    expectTypeOf(aid.payments.buildDonation).toBeFunction();
    expectTypeOf(aid.payments.ensureTrustline).toBeFunction();

    expectTypeOf(formatAmount).toEqualTypeOf<(amount: bigint, decimals?: number) => string>();
    expectTypeOf(parseAmount).toEqualTypeOf<(amount: string, decimals?: number) => bigint>();

    expectTypeOf(decodeEvent).returns.toEqualTypeOf<StellarAidEvent>();

    expectTypeOf(auth.createChallenge).toBeFunction();
    expectTypeOf(auth.verifyChallenge).toBeFunction();
    expectTypeOf(auth.verifyToken).toBeFunction();
    expectTypeOf(auth.signChallenge).toBeFunction();

    expectTypeOf<ContractError>().toMatchTypeOf<StellarAidError>();
    expectTypeOf<ValidationError>().toMatchTypeOf<StellarAidError>();
  });
});
