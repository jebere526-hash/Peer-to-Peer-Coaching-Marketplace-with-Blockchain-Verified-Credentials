(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-TITLE u101)
(define-constant ERR-INVALID-DESCRIPTION u102)
(define-constant ERR-INVALID-PRICE u103)
(define-constant ERR-INVALID-DURATION u104)
(define-constant ERR-INVALID-CATEGORY u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-NOT-VERIFIED-COACH u107)
(define-constant ERR-LISTING-NOT-FOUND u108)
(define-constant ERR-INVALID-STATUS u109)
(define-constant ERR-MAX-LISTINGS-EXCEEDED u110)
(define-constant ERR-INVALID-AVAILABILITY u111)
(define-constant ERR-CONTRACT-PAUSED u112)
(define-constant ERR-INVALID-VERIFIER u113)
(define-constant ERR-INVALID-CURRENCY u114)
(define-constant ERR-INVALID-UPDATE u115)
(define-constant ERR-ALREADY-EXISTS u116)
(define-constant ERR-INVALID-MAX-SESSIONS u117)
(define-constant ERR-INVALID-LOCATION u118)
(define-constant ERR-INVALID-TIMEZONE u119)

(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var max-listings-per-coach uint u10)
(define-data-var credential-verifier principal tx-sender)
(define-data-var listing-fee uint u50)

(define-map listings
  { coach: principal, listing-id: uint }
  {
    title: (string-utf8 100),
    description: (string-utf8 500),
    price: uint,
    duration: uint,
    category: (string-utf8 50),
    timestamp: uint,
    status: bool,
    availability: (list 10 uint),
    currency: (string-utf8 10),
    max-sessions: uint,
    location: (string-utf8 100),
    timezone: (string-utf8 50)
  }
)

(define-map listing-ids-by-coach
  principal
  { next-id: uint }
)

(define-read-only (get-listing (coach principal) (id uint))
  (map-get? listings { coach: coach, listing-id: id })
)

(define-read-only (get-next-listing-id (coach principal))
  (default-to u0 (get next-id (map-get? listing-ids-by-coach coach)))
)

(define-read-only (get-listing-fee)
  (ok (var-get listing-fee))
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

(define-private (validate-price (price uint))
  (if (> price u0)
      (ok true)
      (err ERR-INVALID-PRICE))
)

(define-private (validate-duration (duration uint))
  (if (and (>= duration u15) (<= duration u180))
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-availability (avail (list 10 uint)))
  (if (<= (len avail) u10)
      (ok true)
      (err ERR-INVALID-AVAILABILITY))
)

(define-private (validate-currency (cur (string-utf8 10)))
  (if (or (is-eq cur "STX") (is-eq cur "USD"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-max-sessions (max uint))
  (if (and (> max u0) (<= max u100))
      (ok true)
      (err ERR-INVALID-MAX-SESSIONS))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (<= (len loc) u100)
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-timezone (tz (string-utf8 50)))
  (if (<= (len tz) u50)
      (ok true)
      (err ERR-INVALID-TIMEZONE))
)

(define-private (check-not-paused)
  (ok (asserts! (not (var-get is-paused)) ERR-CONTRACT-PAUSED))
)

(define-private (check-verified-coach (coach principal))
  (let ((verifier (var-get credential-verifier)))
    (if (contract-call? verifier is-credential-verified coach u0)
        (ok true)
        (err ERR-NOT-VERIFIED-COACH))
  )
)

(define-public (set-listing-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set listing-fee new-fee)
    (ok true)
  )
)

(define-public (set-credential-verifier (verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set credential-verifier verifier)
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

(define-public (create-listing
  (title (string-utf8 100))
  (description (string-utf8 500))
  (price uint)
  (duration uint)
  (category (string-utf8 50))
  (availability (list 10 uint))
  (currency (string-utf8 10))
  (max-sessions uint)
  (location (string-utf8 100))
  (timezone (string-utf8 50))
)
  (let (
    (coach tx-sender)
    (next-id (get-next-listing-id coach))
    (max-listings (var-get max-listings-per-coach))
  )
    (try! (check-not-paused))
    (try! (check-verified-coach coach))
    (asserts! (< next-id max-listings) (err ERR-MAX-LISTINGS-EXCEEDED))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-price price))
    (try! (validate-duration duration))
    (try! (validate-category category))
    (try! (validate-availability availability))
    (try! (validate-currency currency))
    (try! (validate-max-sessions max-sessions))
    (try! (validate-location location))
    (try! (validate-timezone timezone))
    (try! (stx-transfer? (var-get listing-fee) coach (as-contract tx-sender)))
    (map-set listings { coach: coach, listing-id: next-id }
      {
        title: title,
        description: description,
        price: price,
        duration: duration,
        category: category,
        timestamp: block-height,
        status: true,
        availability: availability,
        currency: currency,
        max-sessions: max-sessions,
        location: location,
        timezone: timezone
      }
    )
    (map-set listing-ids-by-coach coach { next-id: (+ next-id u1) })
    (print { event: "listing-created", coach: coach, id: next-id })
    (ok next-id)
  )
)

(define-public (update-listing
  (id uint)
  (title (string-utf8 100))
  (description (string-utf8 500))
  (price uint)
  (duration uint)
  (category (string-utf8 50))
  (availability (list 10 uint))
  (status bool)
)
  (let (
    (coach tx-sender)
    (listing (unwrap! (get-listing coach id) (err ERR-LISTING-NOT-FOUND)))
  )
    (try! (check-not-paused))
    (try! (validate-title title))
    (try! (validate-description description))
    (try! (validate-price price))
    (try! (validate-duration duration))
    (try! (validate-category category))
    (try! (validate-availability availability))
    (map-set listings { coach: coach, listing-id: id }
      (merge listing
        {
          title: title,
          description: description,
          price: price,
          duration: duration,
          category: category,
          timestamp: block-height,
          status: status,
          availability: availability
        }
      )
    )
    (print { event: "listing-updated", coach: coach, id: id })
    (ok true)
  )
)

(define-public (delete-listing (id uint))
  (let (
    (coach tx-sender)
    (listing (unwrap! (get-listing coach id) (err ERR-LISTING-NOT-FOUND)))
  )
    (try! (check-not-paused))
    (map-delete listings { coach: coach, listing-id: id })
    (print { event: "listing-deleted", coach: coach, id: id })
    (ok true)
  )
)