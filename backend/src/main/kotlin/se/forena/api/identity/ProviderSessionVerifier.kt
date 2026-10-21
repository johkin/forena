package se.forena.api.identity

/** Provider-specific liveness, separate from portable account and family authorization. */
interface ProviderSessionVerifier {
    fun requireActive(actor: Actor)
}
