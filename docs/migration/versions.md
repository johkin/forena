# Tillgänglighet och kompatibilitet

Verifierat 2026-10-18. Uppdragets versioner är oförändrade: **Spring Boot 4.1.0,
Kotlin 2.4.20 och Java 26**. Provet använde JDK **26.0.2.1** från Oracle för
både Maven, Kotlin-kompilering och testkörning. Ordinarie miljö har JDK 21 och
saknar Maven; därför hämtades separata verktyg till en tillfällig provkatalog.
De ändrade inte systemets Java eller Förena-applikationen.

## Faktiskt resultat

Isolerad minimalapp: `clean verify dependency:tree` gav **BUILD SUCCESS**,
**9 tester, 0 fel, 0 överhoppade**. Kotlin producerade sex produktionsklasser
med class major **70**, minor **0**: JVM 26 utan preview-bytecode. Körbar Boot-JAR
byggdes. Provet finns reproducerbart beskrivet med exakta källor och hashes i
[toolchain-probe.md](toolchain-probe.md); det ingår inte i repots ordinarie CI.

| Komponent | Upplöst version | Verifieringsnivå |
| --- | --- | --- |
| Boot parent/starters/Maven-plugin | 4.1.0 | Hämtat, kompilerat, ompackat och startat i test |
| Kotlin plugin/allopen/stdlib/reflect | 2.4.20 | Hämtat, kompilerat och JVM 26-bytecode kontrollerat |
| Maven | 3.9.11 | Kört på JDK 26.0.2.1 |
| Spring Modulith BOM/core/test | 2.1.0 | `ApplicationModules.verify()` för minimalapp med en verklig modul |
| Spring Framework/JDBC | 7.0.8 | Upplöst; Spring-app startad, JDBC-databasåtkomst ej provad |
| Spring Security resource server | 7.1.0 | Saknad/ogiltig Bearer nekas via nekande testdecoder; riktig JWT ej provad |
| Jackson Kotlin, `tools.jackson.module` | 3.1.4 | Kotlin-konstruktor deserialiserad och JSON via riktig HTTP |
| springdoc WebMVC UI | 3.1.1 | `/v3/api-docs` ger 200 med båda prov-endpointsen; UI ej browserprovat |
| Liquibase | 5.0.3 | Upplöst/paketerat; migrationer ej körda |
| PostgreSQL JDBC | 42.7.11 | Upplöst/paketerat; ingen anslutning |
| Testcontainers PostgreSQL | 2.0.5 | Klass laddad; ingen Docker/container startad |
| ArchUnit | 1.4.2 | Använt genom Modulithstrukturprov |
| Maven Surefire | 3.5.6 | Nio tester körda på JDK 26 |

Minimalappens övriga tester täcker giltigt/blankt domännamn, Boot-start med
inbäddad Tomcat och serviceinjektion, HTTP-JSON och OpenAPI. Modulithprovet
verifierar **inte** Förena-modulgränser, ett tvåmodulssamarbete, cykeldetektering,
`@ApplicationModuleTest` eller Event Publication Registry. Dessa krävs i M01/M06.

Boot 4.1.0 hanterar Kotlin **2.3.21** som standard. Därför måste `kotlin.version`
sättas explicit till **2.4.20**, inklusive Maven-plugin/allopen och runtime-
beroenden; enbart ett pluginbyte räcker inte. Modulith 2.1.0:s publicerade
core-POM och taggade käll-POM refererar Boot 4.1.0; springdocs parent 3.1.1
refererar också Boot 4.1.0. Metadata med nyare versioner är ingen anledning
att ändra uppdragets låsningar.

## Begränsningar och kvarstående grindar

Inget blockerande hämtnings-, kompilerings- eller testfel återstod i provet.
Detta är en verifierad kompatibel grundkombination i den provade omfattningen,
inte ett godkännande av alla framtida beroenden eller en färdig backend.

- **M01:** Maven Wrapper/checksummor, Enforcer/toolchains, verkliga modulprov,
  samma JDK-distribution och patch i lokal miljö, CI och container. JDK 26-image,
  leverantörens villkor och underhållshorisont måste verifieras innan valet låses.
  Oracle användes för provet; det är inte ett beslutat produktionslicensval.
- **M02/M05:** Liquibase, PostgreSQL/Testcontainers, schema-/uppgraderingstester,
  JDBC/RLS och anslutningspool. Provet uteslöt DataSourceAutoConfiguration och
  avaktiverade Liquibase uttryckligen; det är ingen produktionskonfiguration.
- **M03:** Giltig JWT, signatur/issuer/audience/scopes, nyckelrotation och riktig
  Supabase Auth/passkey/MCP-integration. Testdecodern nekar alla tokens.
- **M06/M08:** Registry-JDBC, Cloud Run-livscykel och Pub/Sub-adapter samt GCP-
  bibliotek/Terraform-provider och containerbygg. Dessa är ännu inte upplösta
  eller körda i provet och får inte beskrivas som kompatibilitetsverifierade.

Maven/Guice/Sisu gav varningar om Unsafe/final-field-reflektion och
Mockito/Byte Buddy om dynamisk agentladdning på JDK 26. De blockerade inte
körningen. Inga flaggor användes för att dölja dem. M01 ska avgöra om explicita
testagent-inställningar behövs och dokumentera kvarstående varningar.

## Källor och nätbegränsning

HTTP 200 och POM-innehåll kontrollerades för:

- [Boot parent 4.1.0](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-starter-parent/4.1.0/spring-boot-starter-parent-4.1.0.pom).
- [Boot Maven-plugin 4.1.0](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-maven-plugin/4.1.0/spring-boot-maven-plugin-4.1.0.pom).
- [Kotlin Maven-plugin 2.4.20](https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-maven-plugin/2.4.20/kotlin-maven-plugin-2.4.20.pom).
- [Modulith core 2.1.0](https://repo.maven.apache.org/maven2/org/springframework/modulith/spring-modulith-core/2.1.0/spring-modulith-core-2.1.0.pom).
- [Modulith käll-POM 2.1.0](https://github.com/spring-projects/spring-modulith/blob/2.1.0/pom.xml).
- [springdoc parent 3.1.1](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/3.1.1/springdoc-openapi-3.1.1.pom).

JDK hämtades från Oracles `java/26/latest/jdk-26_linux-x64_bin.tar.gz` och Maven
från Maven Central. `latest` är en hämtningskälla för engångsprovet, inte ett
reproducerbart versionslås. Lokalt beräknad SHA-256 för hämtade arkiv:

```text
JDK:   30410726d866e16154571879785a44736009bc34e409cb66473b6e797d883df7
Maven: 4b7195b6a4f5c81af4c0212677a32ee8143643401bc6e1e8412e6b06ea82beac
```

Dessa hashes identifierar provets arkiv, inte verifiering mot leverantörens
signaturer. M01 ska verifiera publicerade checksummor före ordinarie användning.
Miljöns proxy och TLS-kontroll behölls. `supabase.com/changelog.md` och Java.net-
åtkomst nekades av nätpolicyn; Supabase-produktstatus och officiella Google-priser
är därför fortfarande separata grindar enligt [kostnadsunderlaget](costs-and-regions.md).
