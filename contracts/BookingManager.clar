(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-LISTING u101)
(define-constant ERR-INVALID-TIMESTAMP u102)
(define-constant ERR-INVALID-SESSION-ID u103)
(define-constant ERR-BOOKING-NOT-FOUND u104)
(define-constant ERR-INVALID-STATUS u105)
(define-constant ERR-CONTRACT-PAUSED u106)
(define-constant ERR-INVALID-COACH u107)
(define-constant ERR-INVALID-LEARNER u108)
(define-constant ERR-SESSION-NOT-AVAILABLE u109)
(define-constant ERR-INVALID-FEE u110)
(define-constant ERR-TRANSFER-FAILED u111)
(define-constant ERR-ALREADY-BOOKED u112)
(define-constant ERR-INVALID-DURATION u113)
(define-constant ERR-INVALID-AMOUNT u114)
(define-constant ERR-LISTING-INACTIVE u115)
(define-constant ERR-MAX-BOOKINGS-EXCEEDED u116)
(define-constant ERR-INVALID-TIMEZONE u117)

(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var service-listing principal tx-sender)
(define-data-var booking-fee uint u25)
(define-data-var max-bookings-per-listing uint u100)

(define-map bookings
  { coach: principal, listing-id: uint, session-id: uint }
  {
    learner: principal,
    timestamp: uint,
    status: (string-utf8 20),
    duration: uint,
    amount: uint,
    timezone: (string-utf8 50)
  }
)

(define-map session-ids-by-listing
  { coach: principal, listing-id: uint }
  { next-id: uint }
)

(define-read-only (get-booking (coach principal) (listing-id uint) (session-id uint))
  (map-get? bookings { coach: coach, listing-id: listing-id, session-id: session-id })
)

(define-read-only (get-next-session-id (coach principal) (listing-id uint))
  (default-to u0 (get next-id (map-get? session-ids-by-listing { coach: coach, listing-id: listing-id })))
)

(define-read-only (get-booking-fee)
  (ok (var-get booking-fee))
)

(define-private (validate-timestamp (ts uint))
  (if (> ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "pending") (is-eq status "confirmed") (is-eq status "cancelled"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-duration (duration uint))
  (if (and (>= duration u15) (<= duration u180))
      (ok true)
      (err ERR-INVALID-DURATION))
)

(define-private (validate-amount (amount uint))
  (if (> amount u0)
      (ok true)
      (err ERR-INVALID-AMOUNT))
)

(define-private (validate-timezone (tz (string-utf8 50)))
  (if (<= (len tz) u50)
      (ok true)
      (err ERR-INVALID-TIMEZONE))
)

(define-private (check-not-paused)
  (ok (asserts! (not (var-get is-paused)) ERR-CONTRACT-PAUSED))
)

(define-private (check-valid-listing (coach principal) (listing-id uint) (duration uint) (amount uint))
  (let ((listing (contract-call? (var-get service-listing) get-listing coach listing-id)))
    (if (and (is-some listing) (get status (unwrap! listing (err ERR-INVALID-LISTING))))
        (if (and (is-eq duration (get duration (unwrap! listing (err ERR-INVALID-LISTING))))
                 (is-eq amount (get price (unwrap! listing (err ERR-INVALID-LISTING)))))
            (ok true)
            (err ERR-INVALID-LISTING))
        (err ERR-LISTING-INACTIVE))
  )
)

(define-private (check-session-availability (coach principal) (listing-id uint) (session-id uint) (ts uint))
  (let ((booking (get-booking coach listing-id session-id)))
    (if (is-none booking)
        (ok true)
        (err ERR-ALREADY-BOOKED))
  )
)

(define-public (set-booking-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= new-fee u0) (err ERR-INVALID-FEE))
    (var-set booking-fee new-fee)
    (ok true)
  )
)

(define-public (set-service-listing (listing-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set service-listing listing-contract)
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

(define-public (book-session
  (coach principal)
  (listing-id uint)
  (session-time uint)
  (duration uint)
  (amount uint)
  (timezone (string-utf8 50))
)
  (let (
    (learner tx-sender)
    (session-id (get-next-session-id coach listing-id))
    (max-bookings (var-get max-bookings-per-listing))
  )
    (try! (check-not-paused))
    (try! (check-valid-listing coach listing-id duration amount))
    (try! (check-session-availability coach listing-id session-id session-time))
    (try! (validate-timestamp session-time))
    (try! (validate-duration duration))
    (try! (validate-amount amount))
    (try! (validate-timezone timezone))
    (asserts! (< session-id max-bookings) (err ERR-MAX-BOOKINGS-EXCEEDED))
    (try! (stx-transfer? (var-get booking-fee) learner (as-contract tx-sender)))
    (map-set bookings { coach: coach, listing-id: listing-id, session-id: session-id }
      {
        learner: learner,
        timestamp: session-time,
        status: "pending",
        duration: duration,
        amount: amount,
        timezone: timezone
      }
    )
    (map-set session-ids-by-listing { coach: coach, listing-id: listing-id }
      { next-id: (+ session-id u1) }
    )
    (print { event: "session-booked", coach: coach, listing-id: listing-id, session-id: session-id })
    (ok session-id)
  )
)

(define-public (confirm-session (coach principal) (listing-id uint) (session-id uint))
  (let (
    (booking (unwrap! (get-booking coach listing-id session-id) (err ERR-BOOKING-NOT-FOUND)))
  )
    (try! (check-not-paused))
    (asserts! (is-eq coach tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (get status booking) "pending") (err ERR-INVALID-STATUS))
    (map-set bookings { coach: coach, listing-id: listing-id, session-id: session-id }
      (merge booking { status: "confirmed" })
    )
    (print { event: "session-confirmed", coach: coach, listing-id: listing-id, session-id: session-id })
    (ok true)
  )
)

(define-public (cancel-session (coach principal) (listing-id uint) (session-id uint))
  (let (
    (booking (unwrap! (get-booking coach listing-id session-id) (err ERR-BOOKING-NOT-FOUND)))
    (learner (get learner booking))
  )
    (try! (check-not-paused))
    (asserts! (or (is-eq coach tx-sender) (is-eq learner tx-sender)) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq (get status booking) "cancelled")) (err ERR-INVALID-STATUS))
    (map-set bookings { coach: coach, listing-id: listing-id, session-id: session-id }
      (merge booking { status: "cancelled" })
    )
    (print { event: "session-cancelled", coach: coach, listing-id: listing-id, session-id: session-id })
    (ok true)
  )
)