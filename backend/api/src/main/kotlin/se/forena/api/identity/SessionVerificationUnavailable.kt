package se.forena.api.identity

/** No fallback to an unverified provider session when its current state cannot be read. */
class SessionVerificationUnavailable : RuntimeException()
