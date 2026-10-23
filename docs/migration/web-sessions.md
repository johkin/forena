# Webbsessioner i Kotlin

Den nya React/Vite-appen använder Spring Session JDBC och lokala Spring-konton.
Se [autentisering](authentication.md) för konfiguration och kontolivscykel.
Den gamla Next-appen har fortsatt separat Supabase Auth.

Backend laddar kontostatus, sessionsversion och lokal återkallning på varje
anrop. Absolut livstid och inaktivitet kontrolleras. HttpOnly/Secure/SameSite=Lax
samt krypterat cookie-ID hindrar att ett databasläckt sessions-ID används direkt.
Endast strängar serialiseras; ingen SecurityContext, lösenord eller leverantörstoken
lagras i webbsessionen. Spring sköter sessionfixeringsskydd och logout.

Browsern anropar samma origin genom Vites eller hostingens API-proxy. API-skrivningar
kräver exakt kanonisk Origin och `X-Forena-Request: 1`. Verksamhetsskrivningar
kräver också `X-Forena-Account`, vilket verifieras mot autentiserat konto.
Dubbla sessionscookies och tvetydig Authorization avvisas.

Login, passkeys, magic links och logout använder Springs filter. Registrering,
e-postverifiering och reset använder små controllers för applikationens kontoregler.
OAuth-fortsättning valideras separat; consent använder Springs CSRF. Rate limits
ligger i PostgreSQL och gäller över instanser/omstarter, även cookie-lösa
OAuth-anrop innan session kan skapas. Fel i begränsningen stänger åtkomsten med 503.
429 innehåller Retry-After; logout blockeras inte av loginbudgeten.

401 från appen betyder avslutad session. Tekniska verifieringsfel ger 503 och
ska kunna återhämtas utan att klienten raderar sessionen. API-svar använder no-store.
Verksamhetens behörighetskontroller körs på nytt inom skrivtransaktionen.

OAuth/MCP använder Spring Authorization Server med JDBC-lagring och opaka token.
MCP-token accepteras inte i webb-API:t och cookies accepteras inte som MCP-auth.

Historiska Liquibase-tabeller och checksummor bevaras. Överblivna tabeller från
äldre auth-adaptrar tas inte bort i detta arbete. Inga konton eller sessionsdata
importeras mellan apparna.
