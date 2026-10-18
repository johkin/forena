# Reproducerbart kompatibilitetsprov

Detta är en dokumenterad engångsminimalapp, inte Förena-backend eller en del av
repots ordinarie bygge/CI. Kör den i en separat tom katalog med JDK 26.0.2.1 och
Maven 3.9.11. Återskapa filerna nedan och kör `mvn -B -ntp clean verify dependency:tree`.
Använd miljöns normala proxy och CA-konfiguration vid behov; stäng aldrig av TLS.
Kontrollera `java -version` och `mvn -version` först. Provet saknar Maven Wrapper;
M01 inför den i det verkliga backendprojektet.

Datakälla/Liquibase är uttryckligen avstängda här och JwtDecoder är en nekande
teststub. Flytta inte dessa inställningar till det riktiga backendprojektet.
Testcontainers-testet laddar bara klassens API; det är inte ett databastest.

Källfilerna nedan är exakt dem som provkördes den 2026-10-18. SHA-256 identifierar
källinnehållet, inte en leverantörssignerad distributionsverifiering.

## pom.xml

SHA-256: `c356a0417777878801c6651db2015df3aa70cba36a474f5062faa40bbd234a71`.

```xml
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
<modelVersion>4.0.0</modelVersion>
<parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>4.1.0</version><relativePath/></parent>
<groupId>se.forena</groupId><artifactId>jvm-check</artifactId><version>0.0.1-SNAPSHOT</version>
<properties><java.version>26</java.version><kotlin.compiler.daemon>false</kotlin.compiler.daemon><kotlin.version>2.4.20</kotlin.version><spring-modulith.version>2.1.0</spring-modulith.version></properties>
<dependencyManagement><dependencies><dependency><groupId>org.springframework.modulith</groupId><artifactId>spring-modulith-bom</artifactId><version>${spring-modulith.version}</version><type>pom</type><scope>import</scope></dependency></dependencies></dependencyManagement>
<dependencies>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-webmvc</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-jdbc</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-liquibase</artifactId></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security-oauth2-resource-server</artifactId></dependency>
<dependency><groupId>org.springframework.modulith</groupId><artifactId>spring-modulith-starter-core</artifactId></dependency>
<dependency><groupId>tools.jackson.module</groupId><artifactId>jackson-module-kotlin</artifactId></dependency>
<dependency><groupId>org.jetbrains.kotlin</groupId><artifactId>kotlin-reflect</artifactId></dependency>
<dependency><groupId>org.jetbrains.kotlin</groupId><artifactId>kotlin-stdlib</artifactId></dependency>
<dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
<dependency><groupId>org.springdoc</groupId><artifactId>springdoc-openapi-starter-webmvc-ui</artifactId><version>3.1.1</version></dependency>
<dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
<dependency><groupId>org.springframework.modulith</groupId><artifactId>spring-modulith-starter-test</artifactId><scope>test</scope></dependency>
<dependency><groupId>org.testcontainers</groupId><artifactId>testcontainers-postgresql</artifactId><scope>test</scope></dependency>
</dependencies>
<build><sourceDirectory>${project.basedir}/src/main/kotlin</sourceDirectory><testSourceDirectory>${project.basedir}/src/test/kotlin</testSourceDirectory><plugins>
<plugin><groupId>org.jetbrains.kotlin</groupId><artifactId>kotlin-maven-plugin</artifactId><version>${kotlin.version}</version><configuration><jvmTarget>26</jvmTarget><javaParameters>true</javaParameters><compilerPlugins><plugin>spring</plugin></compilerPlugins></configuration><executions><execution><id>compile</id><phase>compile</phase><goals><goal>compile</goal></goals></execution><execution><id>test-compile</id><phase>test-compile</phase><goals><goal>test-compile</goal></goals></execution></executions><dependencies><dependency><groupId>org.jetbrains.kotlin</groupId><artifactId>kotlin-maven-allopen</artifactId><version>${kotlin.version}</version></dependency></dependencies></plugin>
<plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>
</plugins></build></project>
```

## src/main/kotlin/se/forena/check/CheckApplication.kt

SHA-256: `e5038d7b29e76d7ac0df65b9aed7c889f1aa196ded0d805ba8058fc1ccc1af8e`.

```kotlin
package se.forena.check
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
@SpringBootApplication
class CheckApplication
fun main(args: Array<String>) { runApplication<CheckApplication>(*args) }
```

## src/main/kotlin/se/forena/check/HttpConfiguration.kt

SHA-256: `f4ec392931a8c97475ee80d2f79c616a0129bcae646f9f8e4f440c9c58d37bdf`.

```kotlin
package se.forena.check
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.BadJwtException
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import se.forena.check.membership.Membership
@Configuration
class HttpConfiguration {
 @Bean fun jwtDecoder(): JwtDecoder = JwtDecoder { throw BadJwtException("Disposable test decoder: rejects all tokens") }
 @Bean fun security(http: HttpSecurity): SecurityFilterChain = http
  .authorizeHttpRequests { it.requestMatchers("/public", "/v3/api-docs/**").permitAll().anyRequest().authenticated() }
  .oauth2ResourceServer { it.jwt { } }.build()
}
@RestController
class CheckController {
 @GetMapping("/public") fun publicMembership() = Membership("Anna")
 @GetMapping("/private") fun privateMembership() = Membership("Anna")
}
```

## src/main/kotlin/se/forena/check/membership/Membership.kt

SHA-256: `06eadee1cb41585918a030bf2e7403dc03bcfdf23aa4a00e62a926aa519071b6`.

```kotlin
package se.forena.check.membership
import org.springframework.stereotype.Service
data class Membership(val name: String) { init { require(name.isNotBlank()) } }
@Service
class MembershipService { fun create(name: String) = Membership(name) }
```

## src/test/kotlin/se/forena/check/ApplicationTest.kt

SHA-256: `aa7715cb0d541ea0eb42f3359d66c428a9b673c18fd153a8d6541162549b99d0`.

```kotlin
package se.forena.check
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.core.env.Environment
import org.assertj.core.api.Assertions.assertThat
import se.forena.check.membership.MembershipService
@SpringBootTest(properties = ["spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration", "spring.liquibase.enabled=false"], webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicationTest {
 @Autowired lateinit var service: MembershipService
 @Autowired lateinit var mapper: tools.jackson.databind.json.JsonMapper
 @Autowired lateinit var environment: Environment
 private fun get(path: String, token: String? = null): HttpResponse<String> {
  val request = HttpRequest.newBuilder(URI("http://127.0.0.1:" + environment.getRequiredProperty("local.server.port") + path))
  if (token != null) request.header("Authorization", "Bearer $token")
  return HttpClient.newHttpClient().send(request.GET().build(), HttpResponse.BodyHandlers.ofString())
 }
 @Test fun jacksonKotlinDeserializesDataClass() { assertThat(mapper.readValue("{\"name\":\"Anna\"}", se.forena.check.membership.Membership::class.java).name).isEqualTo("Anna") }
 @Test fun applicationStarts() { assertThat(service.create("Anna").name).isEqualTo("Anna") }
 @Test fun jacksonKotlinSerializesOverHttp() { val response = get("/public"); assertThat(response.statusCode()).isEqualTo(200); assertThat(response.body()).isEqualTo("{\"name\":\"Anna\"}") }
 @Test fun springdocGeneratesOpenApi() { val response = get("/v3/api-docs"); assertThat(response.statusCode()).isEqualTo(200); assertThat(response.body()).contains("\"openapi\"", "/public", "/private") }
 @Test fun resourceServerRejectsMissingToken() { assertThat(get("/private").statusCode()).isEqualTo(401) }
 @Test fun resourceServerRejectsInvalidToken() { assertThat(get("/private", "invalid").statusCode()).isEqualTo(401) }
}
```

## src/test/kotlin/se/forena/check/VerificationTest.kt

SHA-256: `0f0dc2c4c11fb01093fd063bc355b6754210cbf555b4de1fad694b057d9bb345`.

```kotlin
package se.forena.check
import org.junit.jupiter.api.Test
import org.assertj.core.api.Assertions.*
import org.springframework.modulith.core.ApplicationModules
import se.forena.check.membership.Membership
class VerificationTest {
 @Test fun modulesAreValid() { val modules = ApplicationModules.of(CheckApplication::class.java); assertThat(modules.stream().count()).isEqualTo(1); modules.verify() }
 @Test fun domainRejectsBlankNames() { assertThatThrownBy { Membership(" ") }.isInstanceOf(IllegalArgumentException::class.java); assertThat(Membership("Anna").name).isEqualTo("Anna") }
 @Test fun postgresContainerApiLoadsWithoutDocker() { assertThat(org.testcontainers.postgresql.PostgreSQLContainer::class.java.name).contains("PostgreSQLContainer") }
}
```
