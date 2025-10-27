import { describe, it, expect, beforeEach } from "vitest";
import {
  stringUtf8CV,
  uintCV,
  boolCV,
  principalCV,
  listCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_TITLE = 101;
const ERR_INVALID_DESCRIPTION = 102;
const ERR_INVALID_PRICE = 103;
const ERR_INVALID_DURATION = 104;
const ERR_INVALID_CATEGORY = 105;
const ERR_INVALID_TIMESTAMP = 106;
const ERR_NOT_VERIFIED_COACH = 107;
const ERR_LISTING_NOT_FOUND = 108;
const ERR_INVALID_STATUS = 109;
const ERR_MAX_LISTINGS_EXCEEDED = 110;
const ERR_INVALID_AVAILABILITY = 111;
const ERR_CONTRACT_PAUSED = 112;
const ERR_INVALID_VERIFIER = 113;
const ERR_INVALID_CURRENCY = 114;
const ERR_INVALID_UPDATE = 115;
const ERR_ALREADY_EXISTS = 116;
const ERR_INVALID_MAX_SESSIONS = 117;
const ERR_INVALID_LOCATION = 118;
const ERR_INVALID_TIMEZONE = 119;

interface Listing {
  title: string;
  description: string;
  price: number;
  duration: number;
  category: string;
  timestamp: number;
  status: boolean;
  availability: number[];
  currency: string;
  maxSessions: number;
  location: string;
  timezone: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ServiceListingMock {
  state: {
    contractOwner: string;
    isPaused: boolean;
    maxListingsPerCoach: number;
    credentialVerifier: string;
    listingFee: number;
    listings: Map<string, Listing>;
    listingIdsByCoach: Map<string, number>;
  } = {
    contractOwner: "",
    isPaused: false,
    maxListingsPerCoach: 10,
    credentialVerifier: "",
    listingFee: 50,
    listings: new Map(),
    listingIdsByCoach: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1COACH";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  verifiedCoaches: Set<string> = new Set();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      isPaused: false,
      maxListingsPerCoach: 10,
      credentialVerifier: "ST2VERIFIER",
      listingFee: 50,
      listings: new Map(),
      listingIdsByCoach: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1COACH";
    this.stxTransfers = [];
    this.verifiedCoaches = new Set(["ST1COACH"]);
  }

  private getKey(coach: string, id: number): string {
    return `${coach}-${id}`;
  }

  isCredentialVerified(coach: string, id: number): boolean {
    return this.verifiedCoaches.has(coach);
  }

  setListingFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.listingFee = newFee;
    return { ok: true, value: true };
  }

  setCredentialVerifier(verifier: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.credentialVerifier = verifier;
    return { ok: true, value: true };
  }

  pauseContract(): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isPaused = true;
    return { ok: true, value: true };
  }

  unpauseContract(): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isPaused = false;
    return { ok: true, value: true };
  }

  createListing(
    title: string,
    description: string,
    price: number,
    duration: number,
    category: string,
    availability: number[],
    currency: string,
    maxSessions: number,
    location: string,
    timezone: string
  ): Result<number> {
    const coach = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    if (!this.isCredentialVerified(coach, 0))
      return { ok: false, value: ERR_NOT_VERIFIED_COACH };
    const nextId = this.state.listingIdsByCoach.get(coach) || 0;
    if (nextId >= this.state.maxListingsPerCoach)
      return { ok: false, value: ERR_MAX_LISTINGS_EXCEEDED };
    if (title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (duration < 15 || duration > 180)
      return { ok: false, value: ERR_INVALID_DURATION };
    if (category.length === 0 || category.length > 50)
      return { ok: false, value: ERR_INVALID_CATEGORY };
    if (availability.length > 10)
      return { ok: false, value: ERR_INVALID_AVAILABILITY };
    if (!["STX", "USD"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    if (maxSessions <= 0 || maxSessions > 100)
      return { ok: false, value: ERR_INVALID_MAX_SESSIONS };
    if (location.length > 100)
      return { ok: false, value: ERR_INVALID_LOCATION };
    if (timezone.length > 50) return { ok: false, value: ERR_INVALID_TIMEZONE };
    this.stxTransfers.push({
      amount: this.state.listingFee,
      from: coach,
      to: "contract",
    });
    const key = this.getKey(coach, nextId);
    this.state.listings.set(key, {
      title,
      description,
      price,
      duration,
      category,
      timestamp: this.blockHeight,
      status: true,
      availability,
      currency,
      maxSessions,
      location,
      timezone,
    });
    this.state.listingIdsByCoach.set(coach, nextId + 1);
    return { ok: true, value: nextId };
  }

  updateListing(
    id: number,
    title: string,
    description: string,
    price: number,
    duration: number,
    category: string,
    availability: number[],
    status: boolean
  ): Result<boolean> {
    const coach = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    const key = this.getKey(coach, id);
    const listing = this.state.listings.get(key);
    if (!listing) return { ok: false, value: ERR_LISTING_NOT_FOUND };
    if (title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (duration < 15 || duration > 180)
      return { ok: false, value: ERR_INVALID_DURATION };
    if (category.length === 0 || category.length > 50)
      return { ok: false, value: ERR_INVALID_CATEGORY };
    if (availability.length > 10)
      return { ok: false, value: ERR_INVALID_AVAILABILITY };
    this.state.listings.set(key, {
      ...listing,
      title,
      description,
      price,
      duration,
      category,
      timestamp: this.blockHeight,
      status,
      availability,
    });
    return { ok: true, value: true };
  }

  deleteListing(id: number): Result<boolean> {
    const coach = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    const key = this.getKey(coach, id);
    const listing = this.state.listings.get(key);
    if (!listing) return { ok: false, value: ERR_LISTING_NOT_FOUND };
    this.state.listings.delete(key);
    return { ok: true, value: true };
  }

  getListing(coach: string, id: number): Listing | null {
    return this.state.listings.get(this.getKey(coach, id)) || null;
  }

  getNextListingId(coach: string): number {
    return this.state.listingIdsByCoach.get(coach) || 0;
  }

  getListingFee(): Result<number> {
    return { ok: true, value: this.state.listingFee };
  }
}

describe("ServiceListing", () => {
  let contract: ServiceListingMock;

  beforeEach(() => {
    contract = new ServiceListingMock();
    contract.reset();
  });

  it("creates a listing successfully", () => {
    const result = contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const listing = contract.getListing("ST1COACH", 0);
    expect(listing?.title).toBe("Coaching Session");
    expect(listing?.price).toBe(100);
    expect(listing?.status).toBe(true);
    expect(contract.stxTransfers).toEqual([
      { amount: 50, from: "ST1COACH", to: "contract" },
    ]);
  });

  it("rejects listing by unverified coach", () => {
    contract.verifiedCoaches.clear();
    const result = contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_VERIFIED_COACH);
  });

  it("rejects listing when paused", () => {
    contract.caller = "ST1OWNER";
    contract.pauseContract();
    contract.caller = "ST1COACH";
    const result = contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONTRACT_PAUSED);
  });

  it("updates a listing successfully", () => {
    contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    const result = contract.updateListing(
      0,
      "Updated Session",
      "Advanced blockchain",
      200,
      90,
      "Tech",
      [4, 5],
      false
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const listing = contract.getListing("ST1COACH", 0);
    expect(listing?.title).toBe("Updated Session");
    expect(listing?.price).toBe(200);
    expect(listing?.status).toBe(false);
  });

  it("rejects update for non-existent listing", () => {
    const result = contract.updateListing(
      0,
      "Updated Session",
      "Advanced blockchain",
      200,
      90,
      "Tech",
      [4, 5],
      false
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_LISTING_NOT_FOUND);
  });

  it("deletes a listing successfully", () => {
    contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    const result = contract.deleteListing(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getListing("ST1COACH", 0)).toBe(null);
  });

  it("rejects listing with invalid price", () => {
    const result = contract.createListing(
      "Coaching Session",
      "Learn blockchain basics",
      0,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRICE);
  });

  it("sets listing fee successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setListingFee(100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.listingFee).toBe(100);
  });

  it("rejects set listing fee by non-owner", () => {
    const result = contract.setListingFee(100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets credential verifier successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setCredentialVerifier("ST3NEWVERIFIER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.credentialVerifier).toBe("ST3NEWVERIFIER");
  });

  it("rejects max listings exceeded", () => {
    for (let i = 0; i < 10; i++) {
      contract.createListing(
        `Session ${i}`,
        "Learn blockchain basics",
        100,
        60,
        "Education",
        [1, 2, 3],
        "STX",
        10,
        "Online",
        "UTC"
      );
    }
    const result = contract.createListing(
      "Extra Session",
      "Learn blockchain basics",
      100,
      60,
      "Education",
      [1, 2, 3],
      "STX",
      10,
      "Online",
      "UTC"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LISTINGS_EXCEEDED);
  });
});
