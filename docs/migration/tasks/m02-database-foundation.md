# M02: Inför Liquibase och PostgreSQL-testgrund

Status: delvis implementerad (2026-10-19). Beroenden: M01. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

Databasgrunden finns i `backend` med lokala Liquibase/Testcontainers-prov.
Privat schema och separata begränsade LOGIN-roller är verifierade i
`forena-kotlin`. Verklig JDBC med CA/hostname-verifiering och separat paketerad
Liquibase-release har körts i Vercel Sandbox; fem historikposter är oförändrade
vid återkörning. Testfixturer är städade. Ingen driftaktivering ingår.
Se [målmiljö/Auth](../target-auth-lifecycle.md) för observerat nuläge.

## Bakgrund och gemensamma beslut

Backendens egna verksamhetsscheman i Supabase PostgreSQL ska kunna köras på vanlig PostgreSQL utan Supabase auth-schema (ADR-008). JDBC och explicita transaktioner är valt i ADR-003.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

backend/pom.xml, backend/src/main/resources/db/, backend/src/test/, supabase/config.toml. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inför Liquibase och Testcontainers/PostgreSQL17. Dokumentera schemaägarskap i Supabase: auth/storage förblir leverantörens; befintliga objekt överlåts inte implicit. Separera migrerings- och runtimekonton och stäng av automatisk produktionsmigrering vid appstart. Lägg ett minimalt verkligt schema för backendens versions-/identitetsgrund, utan att kopiera hela verksamheten.

## Acceptanskriterier

Tom databas migreras; föregående changelog med syntetiska data uppgraderas utan dataförlust; andra körningen ändrar inget. FK/unik/null-villkor och minst en negativ constraint verifieras. Runtime kan inte ändra schema.

## Verifiering

JUnit/Testcontainers med tom, föregående och aktuell version; Liquibase validate och återkörning. Verifiera transaktionsrollback och poolens anslutningsgräns.

## Lämnas till senare

Ingen dataflytt eller produktionsrelease. Befintliga Supabase-objekt ägs fortsatt av supabase/migrations.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
