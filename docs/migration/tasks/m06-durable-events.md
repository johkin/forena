# M06: Bevisa beständig modulreaktion och Pub/Sub-gräns

Status: planerad. Beroenden: M01, M02. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Registry ska utvärderas före egen generell outbox. Befintlig outbox/triggerkedja förblir auktoritativ tills dess ansvar uttryckligen ersätts. ADR-005 styr.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/scheduled-tasks.md, supabase/functions/notification-worker/index.ts, supabase/migrations/20261008183546_capability_signals.sql, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Skapa ett avgränsat prov med riktig JDBC Event Publication Registry, transaktionell lyssnare och en extern Pub/Sub-publicerare via port. Dokumentera event-ID, payloadversion, retry/lease/ack och exakt ansvar. Prova emulerad transport lokalt och verklig avsedd Pub/Sub-testmiljö i M08. Ange hur Scheduler/Job väcker arbetet från noll instanser.

## Acceptanskriterier

Affärsskrivning och registry-post committas/rullas tillbaka tillsammans. Krasch före/efter publish, timeout efter provideraccept, dubbelleverans, flera instanser och SIGTERM kan återtas utan dubbla verksamhetseffekter. Återspelning kan inte automatiskt orsaka dubbla utskick. Dubbla outboxansvar undviks.

## Verifiering

PostgreSQL/Testcontainers, kontrollerade felpunkter och omstart; rapportera emulator separat från riktigt molnprov. Dokumentera svar på vilken Modulith-funktion/adaptation som används, inte antaget inbyggt Pub/Sub-stöd.

## Lämnas till senare

Ingen generell eventbuss för alla interna händelser, inget Kafka, ingen konvertering av hela nuvarande kömodellen. Aktivering för verkliga utskick väntar på M10 och M08:s livscykelprov.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
