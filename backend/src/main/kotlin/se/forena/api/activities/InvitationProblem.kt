package se.forena.api.activities

class InvitationProblem(val status: Int, override val message: String) : RuntimeException(message)
