(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-ALREADY-SUBMITTED u101)
(define-constant ERR-INVALID-HASH u102)
(define-constant ERR-NOT-VERIFIED u103)
(define-constant ERR-INVALID-TITLE u104)
(define-constant ERR-INVALID-DESCRIPTION u105)
(define-constant ERR-INVALID-ISSUER u106)
(define-constant ERR-INVALID-EXPIRY u107)
(define-constant ERR-CREDENTIAL-EXPIRED u108)
(define-constant ERR-ATTESTER-NOT-TRUSTED u109)
(define-constant ERR-INVALID-SIGNATURE u110)
(define-constant ERR-CREDENTIAL-NOT-FOUND u111)
(define-constant ERR-INVALID-STATUS u112)
(define-constant ERR-MAX-ATTESTERS-EXCEEDED u113)
(define-constant ERR-INVALID-ATTESTER u114)
(define-constant ERR-ATTESTER-ALREADY-ADDED u115)
(define-constant ERR_INVALID_METADATA u116)
(define-constant ERR_INVALID_TIMESTAMP u117)
(define-constant ERR_INSUFFICIENT_PERMISSIONS u118)
(define-constant ERR_INVALID_CATEGORY u119)
(define-constant ERR_INVALID_LEVEL u120)
(define-constant ERR_INVALID_SCORE u121)
(define-constant ERR_MAX_CREDENTIALS_EXCEEDED u122)
(define-constant ERR_INVALID_VERIFICATION_FEE u123)
(define-constant ERR_TRANSFER_FAILED u124)

(define-data-var contract-owner principal tx-sender)
(define-data-var trusted-attesters-count uint u0)
(define-data-var max-trusted-attesters uint u50)
(define-data-var max-credentials-per-user uint u10)
(define-data-var verification-fee uint u100)
(define-data-var is-paused bool false)

(define-map credentials
  { coach: principal, credential-id: uint }
  {
    hash: (buff 32),
    title: (string-utf8 100),
    description: (string-utf8 500),
    issuer: (string-utf8 100),
    expiry: (optional uint),
    timestamp: uint,
    status: bool,
    category: (string-utf8 50),
    level: uint,
    score: uint,
    metadata: (optional (buff 256))
  }
)

(define-map credential-ids-by-coach
  principal
  { next-id: uint }
)

(define-map attestations
  { coach: principal, credential-id: uint }
  {
    attester: principal,
    signature: (buff 65),
    timestamp: uint,
    valid: bool
  }
)

(define-map trusted-attesters
  principal
  bool
)

(define-map credential-verifications
  { coach: principal, credential-id: uint }
  bool
)

(define-read-only (get-credential (coach principal) (id uint))
  (map-get? credentials { coach: coach, credential-id: id })
)

(define-read-only (get-attestation (coach principal) (id uint))
  (map-get? attestations { coach: coach, credential-id: id })
)

(define-read-only (is-credential-verified (coach principal) (id uint))
  (default-to false (map-get? credential-verifications { coach: coach, credential-id: id }))
)

(define-read-only (get-next-credential-id (coach principal))
  (default-to u0 (get next-id (map-get? credential-ids-by-coach coach)))
)

(define-read-only (is-trusted-attester (attester principal))
  (default-to false (map-get? trusted-attesters attester))
)

(define-read-only (get-verification-fee)
  (ok (var-get verification-fee))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-title (title (string-utf8 100)))
  (if (and (> (len title) u0) (<= (len title) u100))
      (ok true)
      (err ERR-INVALID-TITLE))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (<= (len desc) u500)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-issuer (issuer (string-utf8 100)))
  (if (and (> (len issuer) u0) (<= (len issuer) u100))
      (ok true)
      (err ERR-INVALID-ISSUER))
)

(define-private (validate-expiry (expiry (optional uint)))
  (match expiry exp
    (if (> exp block-height)
        (ok true)
        (err ERR-INVALID_EXPIRY))
    (ok true))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR_INVALID_CATEGORY))
)

(define-private (validate-level (level uint))
  (if (and (>= level u1) (<= level u10))
      (ok true)
      (err ERR_INVALID_LEVEL))
)

(define-private (validate-score (score uint))
  (if (<= score u100)
      (ok true)
      (err ERR_INVALID_SCORE))
)

(define-private (validate-metadata (meta (optional (buff 256))))
  (match meta m
    (if (<= (len m) u256)
        (ok true)
        (err ERR_INVALID_METADATA))
    (ok true))
)

(define-private (validate-signature (sig (buff 65)))
  (if (is-eq (len sig) u65)
      (ok true)
      (err ERR-INVALID_SIGNATURE))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR_INVALID_TIMESTAMP))
)

(define-private (check-not-paused)
  (ok (asserts! (not (var-get is-paused)) ERR_INSUFFICIENT_PERMISSIONS))
)

(define-public (set-verification-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR_INVALID_VERIFICATION_FEE))
    (var-set verification-fee new-fee)
    (ok true)
  )
)

(define-public (add-trusted-attester (attester principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (try! (check-not-paused))
    (asserts! (< (var-get trusted-attesters-count) (var-get max-trusted-attesters)) (err ERR_MAX_ATTESTERS_EXCEEDED))
    (asserts! (not (is-trusted-attester attester)) (err ERR_ATTESTER-ALREADY-ADDED))
    (map-set trusted-attesters attester true)
    (var-set trusted-attesters-count (+ (var-get trusted-attesters-count) u1))
    (ok true)
  )
)

(define-public (remove-trusted-attester (attester principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-trusted-attester attester) (err ERR_INVALID_ATTESTER))
    (map-delete trusted-attesters attester)
    (var-set trusted-attesters-count (- (var-get trusted-attesters-count) u1))
    (ok true)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set is-paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set is-paused false)
    (ok true)
  )
)

(define-public (submit-credential
  (hash (buff 32))
  (title (string-utf8 100))
  (description (string-utf8 500))
  (issuer (string-utf8 100))
  (expiry (optional uint))
  (category (string-utf8 50))
  (level uint)
  (score uint)
  (metadata (optional (buff 256)))
)
  (let (
    (coach tx-sender)
    (next-id (get-next-credential-id coach))
    (max-creds (var-get max-credentials-per-user))
  )
    (try! (check-not-paused))
    (asserts! (< next-id max-creds) (err ERR_MAX_CREDENTIALS_EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-issuer issuer))
    (try! (validate-expiry expiry))
    (try! (validate-category category))
    (try! (validate-level level))
    (try! (validate-score score))
    (try! (validate-metadata metadata))
    (asserts! (is-none (get-credential coach next-id)) (err ERR_ALREADY-SUBMITTED))
    (map-set credentials { coach: coach, credential-id: next-id }
      {
        hash: hash,
        title: title,
        description: description,
        issuer: issuer,
        expiry: expiry,
        timestamp: block-height,
        status: false,
        category: category,
        level: level,
        score: score,
        metadata: metadata
      }
    )
    (map-set credential-ids-by-coach coach { next-id: (+ next-id u1) })
    (print { event: "credential-submitted", coach: coach, id: next-id })
    (ok next-id)
  )
)

(define-public (attest-credential
  (coach principal)
  (id uint)
  (signature (buff 65))
)
  (let (
    (attester tx-sender)
    (cred (unwrap! (get-credential coach id) (err ERR_CREDENTIAL-NOT-FOUND)))
    (expiry (get expiry cred))
  )
    (try! (check-not-paused))
    (asserts! (is-trusted-attester attester) (err ERR_ATTESTER-NOT-TRUSTED))
    (try! (validate-signature signature))
    (match expiry exp
      (asserts! (> exp block-height) (err ERR_CREDENTIAL-EXPIRED))
      true
    )
    (asserts! (not (get status cred)) (err ERR_ALREADY-SUBMITTED))
    (try! (stx-transfer? (var-get verification-fee) coach (as-contract tx-sender)))
    (map-set attestations { coach: coach, credential-id: id }
      {
        attester: attester,
        signature: signature,
        timestamp: block-height,
        valid: true
      }
    )
    (map-set credentials { coach: coach, credential-id: id }
      (merge cred { status: true })
    )
    (map-set credential-verifications { coach: coach, credential-id: id } true)
    (print { event: "credential-attested", coach: coach, id: id, attester: attester })
    (ok true)
  )
)

(define-public (revoke-attestation
  (coach principal)
  (id uint)
)
  (let (
    (attester tx-sender)
    (att (unwrap! (get-attestation coach id) (err ERR_CREDENTIAL-NOT-FOUND)))
  )
    (try! (check-not-paused))
    (asserts! (is-eq attester (get attester att)) (err ERR_NOT-AUTHORIZED))
    (map-set attestations { coach: coach, credential-id: id }
      (merge att { valid: false })
    )
    (map-set credential-verifications { coach: coach, credential-id: id } false)
    (print { event: "attestation-revoked", coach: coach, id: id, attester: attester })
    (ok true)
  )
)

(define-public (update-credential-status
  (coach principal)
  (id uint)
  (new-status bool)
)
  (let (
    (cred (unwrap! (get-credential coach id) (err ERR_CREDENTIAL-NOT-FOUND)))
  )
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR_NOT-AUTHORIZED))
    (try! (check-not-paused))
    (map-set credentials { coach: coach, credential-id: id }
      (merge cred { status: new-status })
    )
    (map-set credential-verifications { coach: coach, credential-id: id } new-status)
    (print { event: "credential-status-updated", coach: coach, id: id, status: new-status })
    (ok true)
  )
)

(define-public (get-credential-details (coach principal) (id uint))
  (let (
    (cred (get-credential coach id))
    (att (get-attestation coach id))
    (verified (is-credential-verified coach id))
  )
    (ok { credential: cred, attestation: att, verified: verified })
  )
)