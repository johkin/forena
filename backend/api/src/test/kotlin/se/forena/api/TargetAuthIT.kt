package se.forena.api

import com.nimbusds.jwt.SignedJWT
import java.net.URI
import java.net.InetSocketAddress
import java.net.ProxySelector
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.DriverManager
import java.time.Duration
import java.time.Instant
import java.util.UUID
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.builder.SpringApplicationBuilder
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

/** Opt-in: -Dtest=TargetAuthIT test. Never runs against the old project or sends email.
 * Auth credentials belong only to this test process, never the API application config.
 * Prerequisite: bootstrap + Liquibase in the isolated Kotlin project.
 */
class TargetAuthIT {
    private val json = JsonMapper.builder().build()
    // Clear stale evidence even if validation of required environment values fails.
    private val evidence = Path.of("target/target-auth-results.json").also { Files.deleteIfExists(it) }
    private val ref = "ckzrtxqjskosqzoitymc"
    private val issuer = "https://$ref.supabase.co/auth/v1"
    private val secret = required("FORENA_TEST_AUTH_SECRET_KEY")
    private val publishable = required("FORENA_TEST_PUBLISHABLE_KEY")
    private val jdbcUrl = required("FORENA_TEST_JDBC_URL")
    private val owner = required("FORENA_TEST_OWNER_USERNAME")
    private val ownerPassword = required("FORENA_TEST_OWNER_PASSWORD")
    private val runtime = required("FORENA_TEST_RUNTIME_USERNAME")
    private val runtimePassword = required("FORENA_TEST_RUNTIME_PASSWORD")
    private val client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).apply {
        // Use the managed environment's existing proxy when configured, including for JWKS.
        System.getenv("HTTPS_PROXY")?.let { URI(it) }?.let {
            proxy(ProxySelector.of(InetSocketAddress(it.host, if (it.port < 0) 80 else it.port)))
        }
    }.build()

    private fun required(name: String) = System.getenv(name)?.takeIf { it.isNotBlank() }
        ?: error("Configure $name in the test environment; never supply credentials as command arguments")

    private fun auth(method: String, path: String, body: Map<String, Any?>? = null,
                     bearer: String? = null, admin: Boolean = false, expected: Int = 200): JsonNode {
        val request = HttpRequest.newBuilder(URI("$issuer$path")).timeout(Duration.ofSeconds(15))
            .header("apikey", if (admin) secret else publishable)
            .header("Authorization", "Bearer ${bearer ?: if (admin) secret else publishable}")
        val payload = body?.let { json.writeValueAsString(it) } ?: ""
        request.header("Content-Type", "application/json")
            .method(method, if (payload.isEmpty()) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofString(payload))
        val result = client.send(request.build(),HttpResponse.BodyHandlers.ofString())
        // Deliberately never include response bodies: they may contain access/refresh tokens.
        check(result.statusCode() == expected) { "Auth $method ${path.substringBefore('?')}: HTTP ${result.statusCode()}, expected $expected" }
        return if (result.body().isBlank()) json.createObjectNode() else json.readTree(result.body())
    }

    private fun execute(db: Connection, sql: String, vararg values: Any) {
        db.prepareStatement(sql).use { statement ->
            values.forEachIndexed { i, value -> statement.setObject(i+1,value) }
            statement.executeUpdate()
        }
    }

    @Test fun `real target Auth lifecycle and family API reject terminated sessions`() {
        require(System.getenv("FORENA_TEST_TARGET_REF") == ref) { "Explicitly select the isolated forena-kotlin target" }
        require(jdbcUrl.contains("sslmode=verify-full") && !jdbcUrl.contains("password=",true)) { "Use TLS hostname verification and a password-free JDBC URL" }
        require(owner == "forena_api_owner.$ref" || (owner == "forena_api_owner" && jdbcUrl.contains("db.$ref.supabase.co")))
        require(runtime == "forena_api_runtime.$ref" || (runtime == "forena_api_runtime" && jdbcUrl.contains("db.$ref.supabase.co")))
        val users = mutableListOf<UUID>()
        val organization = UUID.randomUUID(); val team = UUID.randomUUID(); val activity = UUID.randomUUID()
        val person = UUID.randomUUID(); val child = UUID.randomUUID(); val invitation = UUID.randomUUID()
        val password = "Target-${UUID.randomUUID()}-9!"
        val emails = List(2) { "forena-auth-${UUID.randomUUID()}@example.invalid" }
        var checksPassed = false
        DriverManager.getConnection(jdbcUrl,owner,ownerPassword).use { db ->
            db.createStatement().use { statement ->
                statement.executeQuery("select count(*) from forena.databasechangelog").use { it.next(); check(it.getInt(1) == 5) { "Run the current Liquibase release before this test" } }
                statement.executeQuery("select current_user").use { it.next(); check(it.getString(1) == "forena_api_owner") }
            }
            try {
                emails.forEach { email ->
                    val user = auth("POST","/admin/users",mapOf("email" to email,"password" to password,"email_confirm" to true),admin=true)
                    users.add(UUID.fromString(user.get("id").asString()))
                }
                db.autoCommit = false
                users.forEach { execute(db,"insert into forena.account(subject) values(?)",it) }
                execute(db,"insert into forena.organization(id,name) values(?,'Syntetisk Auth-klubb')",organization)
                execute(db,"insert into forena.team(id,organization_id,name) values(?,?,'Syntetiskt lag')",team,organization)
                listOf(person,child).forEachIndexed { index,id ->
                    execute(db,"insert into forena.person(id,organization_id,display_name) values(?,?,?)",id,organization,"Syntetisk person $index")
                    execute(db,"insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,?)",id,organization,users[0],if (index==0) "self" else "guardian")
                }
                execute(db,"insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Syntetisk träning',now()+interval '1 hour',now()+interval '2 hours')",activity,organization,team)
                execute(db,"insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)",invitation,organization,activity,child)
                db.commit(); db.autoCommit = true

                // Runtime receives only its own JDBC credential and public issuer/JWKS addresses.
                SpringApplicationBuilder(ForenaApplication::class.java).run(
                    "--server.port=0", "--spring.datasource.url=$jdbcUrl", "--spring.datasource.username=$runtime",
                    "--spring.datasource.password=$runtimePassword", "--spring.liquibase.enabled=false",
                    "--forena.auth.publishable-key=$publishable", "--forena.auth.issuer=$issuer", "--forena.auth.jwks-uri=$issuer/.well-known/jwks.json"
                ).use { app ->
                    val apiClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
                    val port = app.environment.getRequiredProperty("local.server.port")
                    fun api(token: String, expected: Int, write: Boolean = false) {
                        val path = if (write) "/api/invitations/$invitation/respond" else "/api/activities/$activity/my-invitations"
                        val request = HttpRequest.newBuilder(URI("http://127.0.0.1:$port$path")).timeout(Duration.ofSeconds(15))
                            .header("Authorization","Bearer $token")
                        if (write) request.header("Content-Type","application/json").PUT(HttpRequest.BodyPublishers.ofString("{\"response\":\"accepted\"}"))
                        val result = apiClient.send(request.build(),HttpResponse.BodyHandlers.ofString())
                        assertThat(result.statusCode()).isEqualTo(expected)
                        assertThat(result.headers().firstValue("cache-control").orElse("")).contains("no-store")
                        if (expected == 200 && !write) assertThat(result.body()).contains(child.toString())
                    }
                    fun login(index: Int = 0) = auth("POST","/token?grant_type=password",mapOf("email" to emails[index],"password" to password))
                    fun access(session: JsonNode) = session.get("access_token").asString()
                    fun deny(token: String) { api(token,401); api(token,401,true) }
                    val first = login(); val token = access(first)
                    val claims = SignedJWT.parse(token)
                    check(claims.header.algorithm.name in listOf("ES256","RS256"))
                    check(claims.jwtClaimsSet.issuer == issuer && claims.jwtClaimsSet.audience == listOf("authenticated"))
                    check(claims.jwtClaimsSet.subject == users[0].toString())
                    UUID.fromString(claims.jwtClaimsSet.getStringClaim("session_id"))
                    api(token,200); api(token,200,true)
                    api(access(login(1)),404); api(access(login(1)),403,true)
                    val refreshed = auth("POST","/token?grant_type=refresh_token",mapOf("refresh_token" to first.get("refresh_token").asString()))
                    api(access(refreshed),200)
                    val second = access(login())
                    auth("POST","/logout?scope=local",bearer=access(refreshed),expected=204)
                    deny(token); deny(access(refreshed)); api(second,200)
                    // A new, real session works; provider logout does not disable the local account.
                    val third = access(login()); api(third,200)
                    auth("POST","/logout?scope=global",bearer=third,expected=204)
                    deny(second); deny(third)
                    val banned = access(login()); api(banned,200)
                    auth("PUT","/admin/users/${users[0]}",mapOf("ban_duration" to "1h"),admin=true)
                    deny(banned)
                    auth("PUT","/admin/users/${users[0]}",mapOf("ban_duration" to "none"),admin=true)
                    val deleted = access(login()); api(deleted,200)
                    auth("DELETE","/admin/users/${users[0]}",mapOf("should_soft_delete" to true),admin=true)
                    deny(deleted)
                    // No rejected action may create additional response history.
                    db.prepareStatement("select count(*) from forena.invitation_history where invitation_id=?").use {
                        it.setObject(1,invitation); it.executeQuery().use { rows -> rows.next(); check(rows.getInt(1)==1) }
                    }
                    checksPassed = true
                }
            } finally {
                if (!db.autoCommit) { db.rollback(); db.autoCommit = true }
                // Only this run's IDs. Try Auth cleanup even if database cleanup fails.
                var cleanupFailure: Throwable? = null
                fun remember(error: Throwable) {
                    if (cleanupFailure == null) cleanupFailure = error else cleanupFailure!!.addSuppressed(error)
                }
                try {
                db.autoCommit = false
                execute(db,"delete from forena.invitation_history where invitation_id=?",invitation)
                execute(db,"delete from forena.activity_signal_state where activity_id=?",activity)
                execute(db,"delete from forena.invitation where id=?",invitation)
                execute(db,"delete from forena.activity where id=?",activity)
                listOf(person,child).forEach {
                    execute(db,"delete from forena.person_access where person_id=?",it)
                    execute(db,"delete from forena.person where id=?",it)
                }
                execute(db,"delete from forena.team where id=?",team)
                execute(db,"delete from forena.organization where id=?",organization)
                users.forEach { execute(db,"delete from forena.account where subject=?",it) }
                db.commit(); db.autoCommit = true
                } catch (error: Exception) { remember(error) }
                users.forEach {
                    try { auth("DELETE","/admin/users/$it",mapOf("should_soft_delete" to false),admin=true) }
                    catch (error: Exception) { remember(error) }
                }
                cleanupFailure?.let { throw it }
            }
        }
        check(checksPassed)
        Files.createDirectories(evidence.parent)
        Files.writeString(evidence,json.writeValueAsString(mapOf(
            "project_ref" to ref, "checked_at" to Instant.now().toString(), "passed" to true,
            "checks" to listOf("real-password-login","issuer-audience-asymmetric-signature","family-isolation",
                "refresh","local-logout-old-jwt-denied","other-session-preserved","global-logout",
                "relogin","provider-ban","provider-soft-delete","no-rejected-writes","cleanup"),
            "not_tested" to listOf("email-delivery","browser-pkce","passkeys","oauth-mcp","cloud-runtime")
        )))
    }
}
