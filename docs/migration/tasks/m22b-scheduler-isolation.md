# M22B: Data API och schemaläggarens SQL-tillitsgräns

Status: genomförd avgränsad verifiering; se [rapporten](../m22-isolation-results.md).
Beroende: M22A/PR #100 mergad. Bas `e43d752e9792124bd3ec8c2aaa3ed83462afb177`.
Separat branch från main: `test/scheduler-isolation`.

## Bakgrund och filer

Läs [AGENTS.md](../../../AGENTS.md), [ADR-009](../decisions.md),
[M22A-resultatet](../m22-scheduler-results.md),
[säkerhetsarkitekturen](../../security-architecture.md) och
[körbeskrivningen](../../../backend/README.md).
M22A fick 503/PGRST002 vid ett negativt Data API-prov. Det gav inget bevis för
schemaisolering. Användaren bekräftade i denna session att Data API avsiktligt
stängts av eftersom Kotlin ansluter med JDBC. Detta förval ska bevaras.
pg_net:s PUBLIC-grants är en separat SQL-gräns, även med avstängt Data API.

## Mål, omfattning och acceptans

1. Diagnostisera 503 med loggar och aktuell leverantörsdokumentation.
2. Ta snapshot av effektiva rättigheter och autentikatorns konfiguration utan
   att läsa köheaders, riktiga hemligheter eller produktionsdata.
3. Exponera tillfälligt endast en syntetisk RLS-skyddad kontrolltabell i det
   isolerade projektet forena-kotlin. Bekräfta lyckad läsning och nekad skrivning,
   samt schemaavvisning för GET/POST och scheduler-RPC. Godkänn aldrig 503 som
   lyckad isolering. Inga slutanvändare eller riktiga utskick ingår.
4. Reproducera pg_net:s SQL-synlighet med ofarlig markör som tas bort före
   commit. Bevara SET FALSE för runtime-/observationsrollerna; deras effektiva
   rättigheter verifieras i katalogen, inte genom att utöka rollmedlemskap.
5. Återställ avstängt Data API, ta bort fixtur och endast provets HTTP-poster.
   Spara sanerade bevis och körbara kontroller i scripts/probe/isolation-*.
6. Ange vad detta betyder för JDBC och nästa test, samt vad som kräver ett
   separat beslut innan produktion. Uppdatera status och överlämning.

## Avgränsning och verifiering

Ingen ändring av verksamhetskod, backendartefakt, versioner, Vercelprojekt,
produktionsdatabas eller permanent Data API-aktivering. Inget försök att kringgå
plattformens äganderätt till net; ingen egen outbox eller ny leverantör införs.
SQL-fixturen är provider-/testbootstrap, inte en Liquibase-verksamhetsmigration.

13 verkliga HTTP-kontroller, SQL-markörprov och katalogkontroll finns i
[beviset](../evidence/m22-isolation.json). Pythonkontrollen kan även verifiera
detta bevis offline; sex regressionstester nekar falska positiva resultat.
Authenticated testas som SQL-roll, inte med en verklig användar-JWT över HTTP.
Rapporten anger exakt tillfällig API-konfiguration och återställning.

Nästa oberoende test är [M22C](m22c-scheduled-crash.md). Produktionsvalet kräver
fortfarande bedömning av betrodda SQL-konton, credentialomfång, begränsad
registryläsning, last och kostnader i M22.
