import { describe, it, expect, beforeEach } from "vitest";
import {
  stringUtf8CV,
  uintCV,
  boolCV,
  principalCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_LISTING = 101;
const ERR_INVALID_TIMESTAMP = 102;
const ERR_INVALID_SESSION_ID = 103;
const ERR_BOOKING_NOT_FOUND = 104;
const ERR_INVALID_STATUS = 105;
const ERR_CONTRACT_PAUSED = 106;
const ERR_INVALID_COACH = 107;
const ERR_INVALID_LEARNER = 108;
const ERR_SESSION_NOT_AVAILABLE = 109;
const ERR_INVALID_FEE = 110;
const ERR_TRANSFER_FAILED = 111;
const ERR_ALREADY_BOOKED = 112;
const ERR_INVALID_DURATION = 113;
const ERR_INVALID_AMOUNT = 114;
const ERR_LISTING_INACTIVE = 115;
const ERR_MAX_BOOKINGS_EXCEEDED = 116;
const ERR_INVALID_TIMEZONE = 117;

interface Booking {
  learner: string;
  timestamp: number;
  status: string;
  duration: number;
  amount: number;
  timezone: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

interface Listing {
  duration: number;
  price: number;
  status: boolean;
}

class BookingManagerMock {
  state: {
    contractOwner: string;
    isPaused: boolean;
    serviceListing: string;
    bookingFee: number;
    maxBookingsPerListing: number;
    bookings: Map<string, Booking>;
    sessionIdsByListing: Map<string, number>;
  } = {
    contractOwner: "",
    isPaused: false,
    serviceListing: "",
    bookingFee: 25,
    maxBookingsPerListing: 100,
    bookings: new Map(),
    sessionIdsByListing: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1LEARNER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  listings: Map<string, Listing> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      isPaused: false,
      serviceListing: "ST2LISTING",
      bookingFee: 25,
      maxBookingsPerListing: 100,
      bookings: new Map(),
      sessionIdsByListing: new Map(),
    };
    this.blockHeight = 10;
    this.caller = "ST1LEARNER";
    this.stxTransfers = [];
    this.listings = new Map([
      ["ST1COACH-0", { duration: 60, price: 100, status: true }],
    ]);
  }

  private getKey(coach: string, listingId: number, sessionId: number): string {
    return `${coach}-${listingId}-${sessionId}`;
  }

  private getListingKey(coach: string, listingId: number): string {
    return `${coach}-${listingId}`;
  }

  getListing(coach: string, listingId: number): Listing | null {
    return this.listings.get(this.getListingKey(coach, listingId)) || null;
  }

  setBookingFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.bookingFee = newFee;
    return { ok: true, value: true };
  }

  setServiceListing(listingContract: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.serviceListing = listingContract;
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

  bookSession(
    coach: string,
    listingId: number,
    sessionTime: number,
    duration: number,
    amount: number,
    timezone: string
  ): Result<number> {
    const learner = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    const listing = this.getListing(coach, listingId);
    if (!listing || !listing.status)
      return { ok: false, value: ERR_LISTING_INACTIVE };
    if (listing.duration !== duration || listing.price !== amount)
      return { ok: false, value: ERR_INVALID_LISTING };
    const sessionId =
      this.state.sessionIdsByListing.get(
        this.getListingKey(coach, listingId)
      ) || 0;
    if (sessionId >= this.state.maxBookingsPerListing)
      return { ok: false, value: ERR_MAX_BOOKINGS_EXCEEDED };
    if (sessionTime <= this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (duration < 15 || duration > 180)
      return { ok: false, value: ERR_INVALID_DURATION };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (timezone.length > 50) return { ok: false, value: ERR_INVALID_TIMEZONE };
    const key = this.getKey(coach, listingId, sessionId);
    if (this.state.bookings.has(key))
      return { ok: false, value: ERR_ALREADY_BOOKED };
    this.stxTransfers.push({
      amount: this.state.bookingFee,
      from: learner,
      to: "contract",
    });
    this.state.bookings.set(key, {
      learner,
      timestamp: sessionTime,
      status: "pending",
      duration,
      amount,
      timezone,
    });
    this.state.sessionIdsByListing.set(
      this.getListingKey(coach, listingId),
      sessionId + 1
    );
    return { ok: true, value: sessionId };
  }

  confirmSession(
    coach: string,
    listingId: number,
    sessionId: number
  ): Result<boolean> {
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    if (this.caller !== coach) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const key = this.getKey(coach, listingId, sessionId);
    const booking = this.state.bookings.get(key);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (booking.status !== "pending")
      return { ok: false, value: ERR_INVALID_STATUS };
    booking.status = "confirmed";
    this.state.bookings.set(key, booking);
    return { ok: true, value: true };
  }

  cancelSession(
    coach: string,
    listingId: number,
    sessionId: number
  ): Result<boolean> {
    if (this.state.isPaused) return { ok: false, value: ERR_CONTRACT_PAUSED };
    const key = this.getKey(coach, listingId, sessionId);
    const booking = this.state.bookings.get(key);
    if (!booking) return { ok: false, value: ERR_BOOKING_NOT_FOUND };
    if (this.caller !== coach && this.caller !== booking.learner)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (booking.status === "cancelled")
      return { ok: false, value: ERR_INVALID_STATUS };
    booking.status = "cancelled";
    this.state.bookings.set(key, booking);
    return { ok: true, value: true };
  }

  getBooking(
    coach: string,
    listingId: number,
    sessionId: number
  ): Booking | null {
    return (
      this.state.bookings.get(this.getKey(coach, listingId, sessionId)) || null
    );
  }

  getNextSessionId(coach: string, listingId: number): number {
    return (
      this.state.sessionIdsByListing.get(
        this.getListingKey(coach, listingId)
      ) || 0
    );
  }

  getBookingFee(): Result<number> {
    return { ok: true, value: this.state.bookingFee };
  }
}

describe("BookingManager", () => {
  let contract: BookingManagerMock;

  beforeEach(() => {
    contract = new BookingManagerMock();
    contract.reset();
  });

  it("books a session successfully", () => {
    const result = contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const booking = contract.getBooking("ST1COACH", 0, 0);
    expect(booking?.learner).toBe("ST1LEARNER");
    expect(booking?.status).toBe("pending");
    expect(booking?.duration).toBe(60);
    expect(contract.stxTransfers).toEqual([
      { amount: 25, from: "ST1LEARNER", to: "contract" },
    ]);
  });

  it("rejects booking for invalid listing", () => {
    contract.listings.clear();
    const result = contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_LISTING_INACTIVE);
  });

  it("rejects booking when paused", () => {
    contract.caller = "ST1OWNER";
    contract.pauseContract();
    contract.caller = "ST1LEARNER";
    const result = contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONTRACT_PAUSED);
  });

  it("confirms a session successfully", () => {
    contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    contract.caller = "ST1COACH";
    const result = contract.confirmSession("ST1COACH", 0, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const booking = contract.getBooking("ST1COACH", 0, 0);
    expect(booking?.status).toBe("confirmed");
  });

  it("rejects confirmation by non-coach", () => {
    contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    const result = contract.confirmSession("ST1COACH", 0, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("cancels a session successfully", () => {
    contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    contract.caller = "ST1LEARNER";
    const result = contract.cancelSession("ST1COACH", 0, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const booking = contract.getBooking("ST1COACH", 0, 0);
    expect(booking?.status).toBe("cancelled");
  });

  it("rejects cancellation by unauthorized user", () => {
    contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    contract.caller = "ST2FAKE";
    const result = contract.cancelSession("ST1COACH", 0, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets booking fee successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setBookingFee(50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.bookingFee).toBe(50);
  });

  it("rejects set booking fee by non-owner", () => {
    const result = contract.setBookingFee(50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects booking with past timestamp", () => {
    const result = contract.bookSession("ST1COACH", 0, 5, 60, 100, "UTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("rejects booking when max bookings exceeded", () => {
    contract.state.maxBookingsPerListing = 1;
    contract.bookSession("ST1COACH", 0, 20, 60, 100, "UTC");
    const result = contract.bookSession("ST1COACH", 0, 21, 60, 100, "UTC");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_BOOKINGS_EXCEEDED);
  });
});
