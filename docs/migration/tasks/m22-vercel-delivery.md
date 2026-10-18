# M22: Beständig leverans och väckning på Vercel

Status: delvis genomförd. Regionkontroll, lokalt konkurrensprov och långt
återtag efter inaktivitet i Vercel är körda;
schemalagd molnleverans är nu provad i [M22A](m22a-scheduled-worker.md).
Produktionsgränser, kostnadsbild och hostingbeslut återstår. Ingen separat GitHub Issue.
Beroende: M21 mergad via PR #98 som `2e0af8f`. Följ AGENTS.md.
Se [delresultat och nästa prov](../m22-results.md).

## Bakgrund och mål

Läs [resultaten](../vercel-probe-results.md), [ADR-009](../decisions.md),
[M06](m06-durable-events.md) och [backend/README.md](../../../backend/README.md).
På verklig Vercel-preview slutfördes en 10-sekunderslyssnare efter 202-svaret,
men en 60-sekunderslyssnare inte inom 90 s. Modulith-publicering överlevde
JVM-krasch. Manuellt återtag under en aktiv request fungerade.
Målet är en verifierad leveransmekanism som fungerar när ingen användare anropar
appen och som ger underlag för beslut om Vercel eller Cloud Run.

## Ingår och acceptanskriterier

1. Arbeta endast i forena-kotlin-projekten med syntetiska data. Återanvänd
   backend/ och scripts/probe/. Behåll fastställda versioner och Moduliths
   leveransregister; ingen parallell generell outbox.
2. Verifiera leverantörsstöd och planbegränsningar för autentiserad schemalagd
   väckning. Implementera ett begränsat återtagningsanrop som väntar på arbete,
   med timeout, återförsök och dokumenterat beteende vid instansdöd.
3. Låt appen bli inaktiv och avstå från användartrafik. Visa att schemalagd
   väckning slutför både korta och längre kvarvarande publiceringar. Registrera
   instans-ID:n, DB-tider, requesttider och misslyckanden.
4. Prova två samtidiga workers och krasch mellan effekt och leveranskvittens.
   Verifiera idempotens, transaktioner och ingen förlust. Externa utskick kräver
   separat idempotensmodell innan de ingår.
5. Verifiera faktisk JVM-region, uppstartstid och anslutningsbudget. Kontrollera
   att Git-preview bygger från backend utan att ordinarie app påverkas.
6. Uppdatera kostnadsbild för dev/test/prod med daterade källor, valda planer,
   aktiva workers och idle-beteende. Dokumentera kvarvarande betabegränsningar.
7. Kör Maven-verifiering och lokalt kraschprov. Lägg molnbevis i docs/migration,
   uppdatera status och ADR-009. Inga credentials eller åtkomstlänkar i repot.

## Utanför och överlämning

Ingen verksamhetsmigrering, användar-JWT, frontendflytt eller produktionsdeploy.
Om Vercel inte ger tillräckliga garantier, dokumentera hindret och föreslå
Cloud Run enligt M08; byt inte hosting automatiskt. Leverera en liten separat
PR med körbara kontroller, kvarvarande resurser och uttryckligt hostingbeslut.
