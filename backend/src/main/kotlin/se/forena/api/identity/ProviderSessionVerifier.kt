package se.forena.api.identity

/** Provider-specific liveness, separate from portable account and person authorization. */
interface ProviderSessionVerifier {
    fun requireActive(actor: Actor)
}
