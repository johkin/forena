# Återanvändning av Spring Security

Granskning och implementation 2026-10-23 på `feature/native-auth`, efter
användarens instruktion att alltid föredra Springs färdiga komponenter.
Gäller Kotlin-backendens Spring-flöde. Next-appen ändras inte.

Underlaget är projektets Spring Security 7.1.0-källkod från Maven-artefakterna
samt Springs officiella dokumentation. Webbdokumentationen visar 7.1.2;
komponenter och anpassningspunkter har därför även kontrollerats i 7.1.0.
Ingen versionsuppgradering ingår.

## Genomförda byten

| Område | Färdiga komponenter | Förena-anpassning |
| --- | --- | --- |
| Lösenordsinloggning | `formLogin`, `UsernamePasswordAuthenticationFilter`, `ProviderManager`, `DaoAuthenticationProvider`, `PasswordEncoder` | Standardformulär med `email`/`password`, `UserDetailsService` mot lokala konton, anropsbegränsning |
| Passkey-inloggning | `PublicKeyCredentialRequestOptionsFilter`, `WebAuthnAuthenticationFilter`, `WebAuthnAuthenticationProvider` | Strängbaserad options-repository |
| Passkey-registrering | `PublicKeyCredentialCreationOptionsFilter`, `WebAuthnRegistrationFilter`, Springs JDBC-repositories | Samma sessionsadapter, krav på user verification |
| Passkey-borttagning | `WebAuthnRegistrationFilter`, `CredentialRecordOwnerAuthorizationManager` | Befintlig API-adress; framgång returnerar nu 204 utan kropp |
| Magic-link | `oneTimeTokenLogin`, `GenerateOneTimeTokenFilter`, `OneTimeTokenAuthenticationFilter`, `OneTimeTokenAuthenticationProvider`, `JdbcOneTimeTokenService` | Tokenservice-adapter för syfte, generation, webbläsarbindning och atomisk mejlkö |
| Logout | `LogoutFilter`, `SecurityContextLogoutHandler`, CSRF-/logout-handlers | JSON-svar och borttagning av vår sessionscookie via `HttpSessionIdResolver` |
| Sessionsbyte efter login | Springs filter-/sessionfixeringsstöd | `SessionRepository` sparar endast identitet och generation som strängar |
| HTTP-säkerhetsheaders | `HeaderWriterFilter`, standard cache-skydd, `ReferrerPolicyHeaderWriter` | Policy `no-referrer`; särskilda OAuth/MCP-svar har även explicit no-store |

`AuthController` har inga login-, logout-, magic-link- eller
WebAuthn-ceremonier. `PasskeyService` är borttagen. `AccountService`
matchar inte längre lösenord eller skapar en autentiserad SecurityContext.
Spring utför autentisering, tokeninlösen och etablering av autentiserad session.

WebAuthn-filtren konfigureras direkt i `AuthenticationConfiguration`.
7.1.0:s `webAuthn`-DSL exponerar inte hela options-repository-konfigurationen
som vår sessionslagring kräver. Att sätta upp Springs färdiga filter med deras
publika setters bevarar ramverksflödet utan att återinföra en egen ceremoni.
Filter-beans är avregistrerade från servletcontainerns separata filterkedja;
de körs endast inne i rätt Spring Security-kedja.

## Adaptrar som behövs

Spring Sessions serializer accepterar enbart strängar. Standard-repositories
för SecurityContext, CSRF och WebAuthn sparar annars objekt i HttpSession.
Vi behåller smala implementationer av Springs repository-gränssnitt i stället
för att slå på Java-deserialisering. Springs WebAuthn-Jackson-modul läser
credentials, men skriver endast ceremony options; options byggs därför tillbaka
explicit från betrodd serverlagrad JSON. Fem minuters giltighet, kontobindning
vid registrering och engångskonsumtion bevaras.

Den nya React/Vite-klienten följer Springs format direkt: URL-kodade formulär
för password (`email`/`password`) och OTT (`username` respektive `token`), råa
WebAuthn-options och assertioner samt `{ publicKey: { credential, label } }`
vid registrering. Inget extra `challenge_id` eller JSON-översättare behövs i
Spring-flödet. API-adresserna konfigureras på Springs filter och hålls under
`/api/auth` för befintlig hostingrouting. Lyckad registrering returnerar
Springs `{ success: true }`; logout och login använder små JSON-success-handlers.
Den nya appen har ett enda auth-kontrakt.

DTO-typer för filter-endpoints ligger i `AuthenticationEndpoints`, delas
med filterkonfigurationen och används vid generering av OpenAPI. Controllers
används fortsatt som underlag för MVC-endpoints. TypeScript genereras från den
riktiga serverexporten även för dessa filter-endpoints.

OTT-adaptern måste särskilja login från verifiering och återställning, kontrollera
konto/generation och binda länken till begärande browser. Alla syften delar i
försöket JDBC-tokenlagring; rå tokeninlösen får inte automatiskt ge inloggning
för ett verifierings- eller återställningstoken. Okända konton får fortsatt
samma generiska HTTP-svar. Token och krypterad mejl-outbox skapas i samma
transaktion; generationens success handler skriver endast bekräftelsen.

Kontoregistrering, bekräftad e-post, lösenordsåterställning, generation vid reset,
verksamhetsbehörighet, API-kontobindning och Resend-kö är applikationsregler.
Spring Security har inget komplett färdigt kontolivscykelflöde som ersätter dem.
`UserDetailsService` håller UUID som principalnamn för samtliga loginmetoder och
förmedlar aktuell auth-generation; kontospärr och gamla generationer kontrolleras
även på efterföljande requests och vid tokenutgivning.

## Övriga kontrollerade områden

- **OAuth:** Authorization Server, PKCE, consent-lagring, grant-lagring,
  tokenutgivning, refresh och revokering använder redan Spring. MCP använder
  Spring Resource Server med `OpaqueTokenIntrospector`. Den lokala
  introspektionsadaptern behöver kontrollera kontospärr, generation och exakt
  resource/audience. Den ersätts inte med en loopback-HTTP-introspektion.
- **OAuth-fortsättning:** `RequestCache` och `SavedRequestAwareAuthenticationSuccessHandler`
  är standardalternativet vid serverstyrd redirect efter login. Pilotens JSON-login
  och `/api/auth/continue` behöver en kontrollerad destination till React-klienten.
  Den lilla strängbaserade fortsättningen behålls; standard `HttpSessionRequestCache`
  kan inte läggas in oförändrad eftersom den sparar SavedRequest-objekt.
- **CSRF:** OAuth-consent använder redan Springs `CsrfFilter` och request handler.
  Den extra filterinstansen behövs eftersom Authorization Server undantar sina
  protokollrutter från vanliga CSRF-filtret. JSON-API:t behåller det uttryckliga
  Origin-/headerkontraktet. Ett byte till Springs SPA-CSRF-tokenflöde kräver
  samordnad klientändring och ska inte ske genom att enbart slå på en cookie.
- **Fel och anropsbegränsning:** Spring failure-/success-handlers används för
  autentisering. Förena behåller säkra JSON-texter, skillnaden mellan 401 och
  tekniskt 503, gemensamma DB-baserade rate limits och Retry-After.
- **Sessioner och cookie:** Spring Session JDBC, `CookieHttpSessionIdResolver`
  och `DefaultCookieSerializer` återanvänds redan. Krypteringsadaptern skyddar
  mot att ett databasläckt sessions-ID ensamt kan användas som browsercredential.
- **MFA, remember-me och externa loginproviders:** Spring har stöd, men de
  aktiveras inte utan ett produktbehov. Detta arbete inför inga ytterligare
  autentiseringsmetoder eller längre sessioner. MFA kräver också korrekt
  persistens av faktorernas tidsstämplar i vår sessionsadapter.

## Verifiering och källor

Kontolivscykel, cookies, browserbindning, replay/reset, OAuth/PKCE, scopes,
revokering och WebAuthn verifieras mot riktig Spring och lokal PostgreSQL.
Det riktiga browserprovet använder virtuell WebAuthn och uppdaterad React/Vite-
klient med Springs payloadformat. Inga riktiga mejl skickas.
Aktuell körstatus dokumenteras i [migreringsstatus](status.md).

- [Spring: Authentication architecture](https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html)
- [Spring: DaoAuthenticationProvider](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/dao-authentication-provider.html)
- [Spring: Passkeys](https://docs.spring.io/spring-security/reference/servlet/authentication/passkeys.html)
- [Spring: One-Time Token Login](https://docs.spring.io/spring-security/reference/servlet/authentication/onetimetoken.html)
- [Spring: Logout](https://docs.spring.io/spring-security/reference/servlet/authentication/logout.html)
- [Spring: Session management](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)
- [Spring: CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
- [Spring: Security headers](https://docs.spring.io/spring-security/reference/servlet/exploits/headers.html)
