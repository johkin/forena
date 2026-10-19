package se.forena.api.http

import io.swagger.v3.oas.annotations.media.Schema

data class ApiError(@get:Schema(requiredMode = Schema.RequiredMode.REQUIRED) val error: String)
