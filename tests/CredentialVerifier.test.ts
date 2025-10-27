import { describe, it, expect, beforeEach } from "vitest";
import { buffCV, stringUtf8CV, uintCV, optionalCV, boolCV, principalCV, noneCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_ALREADY_SUBMITTED = 101;
const ERR_INVALID_HASH = 102;
const ERR_NOT_VERIFIED = 103;
const ERR_INVALID_TITLE = 104;
const ERR_INVALID_DESCRIPTION = 105;
const ERR_INVALID_ISSUER = 106;
const ERR_INVALID_EXPIRY = 107;
const ERR_CREDENTIAL_EXPIRED = 108;
const ERR_ATTESTER_NOT_TRUSTED = 109;
const ERR_INVALID_SIGNATURE = 110;
const ERR_CREDENTIAL_NOT_FOUND = 111;
const ERR_INVALID_STATUS = 112;
const ERR_MAX_ATTESTERS_EXCEEDED = 113;
const ERR_INVALID_ATTESTER = 114;
const ERR_ATTESTER_ALREADY_ADDED = 115;
const ERR_INVALID_METADATA = 116;
const ERR_INVALID_TIMESTAMP = 117;
const ERR_INSUFFICIENT_PERMISSIONS = 118;
const ERR_INVALID_CATEGORY = 119;
const ERR_INVALID_LEVEL = 120;
const ERR_INVALID_SCORE = 121;
const ERR_MAX_CREDENTIALS_EXCEEDED = 122;
const ERR_INVALID_VERIFICATION_FEE = 123;
const ERR_TRANSFER_FAILED = 124;

interface Credential {
  hash: Uint8Array;
  title: string;
  description: string;
  issuer: string;
  expiry: number | null;
  timestamp: number;
  status: boolean;
  category: string;
  level: number;
  score: number;
  metadata: Uint8Array | null;
}

interface Attestation {
  attester: string;
  signature: Uint8Array;
  timestamp: number;
  valid: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class CredentialVerifierMock {
  state: {
    contractOwner: string;
    trustedAttestersCount: number;
    maxTrustedAttesters: number;
    maxCredentialsPerUser: number;
    verificationFee: number;
    isPaused: boolean;
    credentials: Map<string, Credential>;
    credentialIdsByCoach: Map<string, number>;
    attestations: Map<string, Attestation>;
    trustedAttesters: Map<string, boolean>;
    credentialVerifications: Map<string, boolean>;
  } = {
    contractOwner: "",
    trustedAttestersCount: 0,
    maxTrustedAttesters: 50,
    maxCredentialsPerUser: 10,
    verificationFee: 100,
    isPaused: false,
    credentials: new Map(),
    credentialIdsByCoach: new Map(),
    attestations: new Map(),
    trustedAttesters: new Map(),
    credentialVerifications: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1COACH";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      contractOwner: "ST1OWNER",
      trustedAttestersCount: 0,
      maxTrustedAttesters: 50,
      maxCredentialsPerUser: 10,
      verificationFee: 100,
      isPaused: false,
      credentials: new Map(),
      credentialIdsByCoach: new Map(),
      attestations: new Map(),
      trustedAttesters: new Map(),
      credentialVerifications: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1COACH";
    this.stxTransfers = [];
  }

  private getKey(coach: string, id: number): string {
    return `${coach}-${id}`;
  }

  setVerificationFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_VERIFICATION_FEE };
    this.state.verificationFee = newFee;
    return { ok: true, value: true };
  }

  addTrustedAttester(attester: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.isPaused) return { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
    if (this.state.trustedAttestersCount >= this.state.maxTrustedAttesters) return { ok: false, value: ERR_MAX_ATTESTERS_EXCEEDED };
    if (this.state.trustedAttesters.has(attester)) return { ok: false, value: ERR_ATTESTER_ALREADY_ADDED };
    this.state.trustedAttesters.set(attester, true);
    this.state.trustedAttestersCount++;
    return { ok: true, value: true };
  }

  removeTrustedAttester(attester: string): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.trustedAttesters.has(attester)) return { ok: false, value: ERR_INVALID_ATTESTER };
    this.state.trustedAttesters.delete(attester);
    this.state.trustedAttestersCount--;
    return { ok: true, value: true };
  }

  pauseContract(): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isPaused = true;
    return { ok: true, value: true };
  }

  unpauseContract(): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.isPaused = false;
    return { ok: true, value: true };
  }

  submitCredential(
    hash: Uint8Array,
    title: string,
    description: string,
    issuer: string,
    expiry: number | null,
    category: string,
    level: number,
    score: number,
    metadata: Uint8Array | null
  ): Result<number> {
    const coach = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
    let nextId = this.state.credentialIdsByCoach.get(coach) || 0;
    if (nextId >= this.state.maxCredentialsPerUser) return { ok: false, value: ERR_MAX_CREDENTIALS_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (title.length === 0 || title.length > 100) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (issuer.length === 0 || issuer.length > 100) return { ok: false, value: ERR_INVALID_ISSUER };
    if (expiry !== null && expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (category.length === 0 || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (level < 1 || level > 10) return { ok: false, value: ERR_INVALID_LEVEL };
    if (score > 100) return { ok: false, value: ERR_INVALID_SCORE };
    if (metadata !== null && metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    const key = this.getKey(coach, nextId);
    if (this.state.credentials.has(key)) return { ok: false, value: ERR_ALREADY_SUBMITTED };
    this.state.credentials.set(key, {
      hash,
      title,
      description,
      issuer,
      expiry,
      timestamp: this.blockHeight,
      status: false,
      category,
      level,
      score,
      metadata,
    });
    this.state.credentialIdsByCoach.set(coach, nextId + 1);
    return { ok: true, value: nextId };
  }

  attestCredential(
    coach: string,
    id: number,
    signature: Uint8Array
  ): Result<boolean> {
    const attester = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
    if (!this.state.trustedAttesters.has(attester)) return { ok: false, value: ERR_ATTESTER_NOT_TRUSTED };
    if (signature.length !== 65) return { ok: false, value: ERR_INVALID_SIGNATURE };
    const key = this.getKey(coach, id);
    const cred = this.state.credentials.get(key);
    if (!cred) return { ok: false, value: ERR_CREDENTIAL_NOT_FOUND };
    if (cred.expiry !== null && cred.expiry <= this.blockHeight) return { ok: false, value: ERR_CREDENTIAL_EXPIRED };
    if (cred.status) return { ok: false, value: ERR_ALREADY_SUBMITTED };
    this.stxTransfers.push({ amount: this.state.verificationFee, from: coach, to: "contract" });
    this.state.attestations.set(key, {
      attester,
      signature,
      timestamp: this.blockHeight,
      valid: true,
    });
    cred.status = true;
    this.state.credentials.set(key, cred);
    this.state.credentialVerifications.set(key, true);
    return { ok: true, value: true };
  }

  revokeAttestation(
    coach: string,
    id: number
  ): Result<boolean> {
    const attester = this.caller;
    if (this.state.isPaused) return { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
    const key = this.getKey(coach, id);
    const att = this.state.attestations.get(key);
    if (!att) return { ok: false, value: ERR_CREDENTIAL_NOT_FOUND };
    if (att.attester !== attester) return { ok: false, value: ERR_NOT_AUTHORIZED };
    att.valid = false;
    this.state.attestations.set(key, att);
    this.state.credentialVerifications.set(key, false);
    return { ok: true, value: true };
  }

  updateCredentialStatus(
    coach: string,
    id: number,
    newStatus: boolean
  ): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.isPaused) return { ok: false, value: ERR_INSUFFICIENT_PERMISSIONS };
    const key = this.getKey(coach, id);
    const cred = this.state.credentials.get(key);
    if (!cred) return { ok: false, value: ERR_CREDENTIAL_NOT_FOUND };
    cred.status = newStatus;
    this.state.credentials.set(key, cred);
    this.state.credentialVerifications.set(key, newStatus);
    return { ok: true, value: true };
  }

  getCredentialDetails(
    coach: string,
    id: number
  ): Result<{ credential: Credential | null; attestation: Attestation | null; verified: boolean }> {
    const key = this.getKey(coach, id);
    return {
      ok: true,
      value: {
        credential: this.state.credentials.get(key) || null,
        attestation: this.state.attestations.get(key) || null,
        verified: this.state.credentialVerifications.get(key) || false,
      },
    };
  }
}

describe("CredentialVerifier", () => {
  let contract: CredentialVerifierMock;

  beforeEach(() => {
    contract = new CredentialVerifierMock();
    contract.reset();
  });

  it("submits a credential successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    const result = contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      null,
      "Education",
      5,
      85,
      null
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const details = contract.getCredentialDetails("ST1COACH", 0).value;
    expect(details.credential?.title).toBe("Cert Title");
    expect(details.credential?.status).toBe(false);
    expect(details.verified).toBe(false);
  });

  it("rejects submission with invalid hash", () => {
    const hash = new Uint8Array(31).fill(1);
    const result = contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      null,
      "Education",
      5,
      85,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects attestation by non-trusted attester", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      null,
      "Education",
      5,
      85,
      null
    );
    const signature = new Uint8Array(65).fill(2);
    const result = contract.attestCredential("ST1COACH", 0, signature);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ATTESTER_NOT_TRUSTED);
  });

  it("updates credential status successfully", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      null,
      "Education",
      5,
      85,
      null
    );
    contract.caller = "ST1OWNER";
    const result = contract.updateCredentialStatus("ST1COACH", 0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const details = contract.getCredentialDetails("ST1COACH", 0).value;
    expect(details.credential?.status).toBe(true);
    expect(details.verified).toBe(true);
  });

  it("rejects status update by non-owner", () => {
    const hash = new Uint8Array(32).fill(1);
    contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      null,
      "Education",
      5,
      85,
      null
    );
    const result = contract.updateCredentialStatus("ST1COACH", 0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("adds trusted attester successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.addTrustedAttester("ST2ATTESTER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.trustedAttesters.has("ST2ATTESTER")).toBe(true);
  });

  it("rejects adding attester when max exceeded", () => {
    contract.caller = "ST1OWNER";
    contract.state.trustedAttestersCount = 50;
    const result = contract.addTrustedAttester("ST2ATTESTER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ATTESTERS_EXCEEDED);
  });

  it("removes trusted attester successfully", () => {
    contract.caller = "ST1OWNER";
    contract.addTrustedAttester("ST2ATTESTER");
    const result = contract.removeTrustedAttester("ST2ATTESTER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.trustedAttesters.has("ST2ATTESTER")).toBe(false);
  });

  it("sets verification fee successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setVerificationFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.verificationFee).toBe(200);
  });

  it("pauses and unpauses contract successfully", () => {
    contract.caller = "ST1OWNER";
    let result = contract.pauseContract();
    expect(result.ok).toBe(true);
    expect(contract.state.isPaused).toBe(true);
    result = contract.unpauseContract();
    expect(result.ok).toBe(true);
    expect(contract.state.isPaused).toBe(false);
  });

  it("rejects submission after max credentials", () => {
    const hash = new Uint8Array(32).fill(1);
    for (let i = 0; i < 10; i++) {
      contract.submitCredential(
        hash,
        `Title ${i}`,
        "Description",
        "Issuer",
        null,
        "Category",
        5,
        85,
        null
      );
    }
    const result = contract.submitCredential(
      hash,
      "Extra Title",
      "Description",
      "Issuer",
      null,
      "Category",
      5,
      85,
      null
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CREDENTIALS_EXCEEDED);
  });

  it("handles optional expiry and metadata correctly", () => {
    const hash = new Uint8Array(32).fill(1);
    const metadata = new Uint8Array(256).fill(3);
    const result = contract.submitCredential(
      hash,
      "Cert Title",
      "Description here",
      "Issuer Org",
      100,
      "Education",
      5,
      85,
      metadata
    );
    expect(result.ok).toBe(true);
    const details = contract.getCredentialDetails("ST1COACH", 0).value;
    expect(details.credential?.expiry).toBe(100);
    expect(details.credential?.metadata).toEqual(metadata);
  });
});