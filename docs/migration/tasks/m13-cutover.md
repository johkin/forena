# M13: Genomför kontrollerad Cloud SQL-pilot och återställningsövning

Status: planerad. Beroenden: M12, M07, M09, M10, M11, M14, M15A, M15B, M16. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Detta är en releaseuppgift efter att tenantens verkliga beroenden flyttats. Numren är identifierare, inte strikt datumordning. Återstående flöden måste vara uttryckligt avklarade före aktivering.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/migration/decisions.md, docs/migration/first-flow.md, infra/, .github/workflows/, alla adapter-/workerregister från M04. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Gör komplett läsar-/skrivarregister för pilotklubben inklusive närvaro, serier/import, medlemskap/admin, disciplinjobb, push och direkt PostgREST. Bryt ut och slutför varje saknad flytt som egen PR före cutover. Frys, dränera, importera, validera och växla exakt en källa. Stäng gamla skrivvägar även för äldre flikar och schemaläggare.

## Acceptanskriterier

Noll kvarvarande källskrivare för flyttade data, rätt auth-UUID och tenantisolering, komplett svarflöde på Cloud SQL, inga dubbla utskick. Backup/PITR och återställning övad. Efter första målskrivning fungerar testad återföring eller dokumenterad framåträttning.

## Verifiering

Generalrepetition i isolerad testmiljö med syntetisk klubb och verkliga kanalsänkor, last/samtidighet, fel mitt i växling och återställning. Produktionsaktivering först enligt repots releasebehörigheter och avsedd miljö.

## Lämnas till senare

Ingen automatisk återgång till gammal snapshot. Oflyttat verksamhetsflöde är en blockerare som får egen uppgift, inte en tyst funktionsförlust.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
