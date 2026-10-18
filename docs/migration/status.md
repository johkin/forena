# Migreringsstatus

Uppdaterad 2026-10-18. Inventeringsbas: `c379a96719490bc4edbfcb0a4ee7a1947684ddce`.
Planens uppgifter finns i [uppgiftsindex](tasks/README.md).

## M00: Nuläge, beslut och migreringsplan

Status: dokumentationsleverans färdig för granskning på
`docs/spring-migration-plan`, skapad från uppdaterad `origin/main`.
Ingen backendimplementation, produktionsändring eller dataflytt ingår.
PR-/CI-status redovisas i leveransrapporten; denna text påstår inte att CI gått.

Ändrat beteende: inget runtimebeteende. Repot får gemensamt migrationsunderlag,
självständiga uppgifter, beslut, första flödets acceptans och en kostnadsmodell.
Verifierat nuläge hålls isär från målarkitektur och obesvarade driftfrågor.

Genomförd verifiering:

- Repots enda hittade `AGENTS.md` och relevanta arkitektur-/säkerhets-/driftdokument
  lästa; aktuell main-SHA kontrollerad före branchskapande.
- Källkodsinventering: 98 SQL-migrationsfiler, 43 SQL-testfiler och 131 TS/TSX-
  testfiler. Statisk SQL-referenslista beskriver historiken, inte effektiv katalog.
- Isolerat verktygskedjeprov på JDK 26.0.2.1: Boot 4.1.0, Kotlin 2.4.20,
  Modulith 2.1.0; nio tester godkända, inga fel eller överhoppade. Se
  [exakt provomfattning](versions.md) och [reproduktion](toolchain-probe.md).
- Supabase Terraform-provider granskad i offentlig källa vid låst commit;
  passkey- och MCP OAuth-konfiguration är ännu inte verifierat providerstöd.

Dokumentkontroll godkänd: 34 Markdown-filer, 237 lokala länkar, 231 grupper
med SQL-radreferenser, 22 uppgiftsbeskrivningar inklusive beroendegraf samt
refererade befintliga filer. Kostnadssummor och whitespace kontrollerade.
Appens test/typecheck/lint/build och databasreset körs inte enbart för textändringen,
i enlighet med AGENTS.md. Dessa kontroller är **inte körda lokalt för M00**.
Det isolerade JVM-provet ersätter inte deras resultat.

Begränsningar: ingen läsning av driftkonton/produktionsdata, inga externa
JWT/passkey/OAuth-/kanalflöden eller Docker-/databasprov. Inga verifierade
aktuella Google-priser eller regionlistor på grund av nätpolicyn.
Kostnadsbilden är en antagandebaserad budget, inte en offert.

Tre separata agentuppdrag genomfördes: källkodsinventering (read-only), isolerat
verktygskedjeprov (endast temporär katalog) och kostnads-/regionunderlag (egen
fil). De var underuppdrag till denna leverans, inte egna GitHub Issues eller
långlivade migreringsbrancher. Övriga uppgifter är dokumenterade, inte delegerade.

## Nästa ordning

1. M01: grundprojekt med låsta versioner, Maven Wrapper, container och CI samt
   struktur-/modultester. Isolerat prov finns; repots bygge är ännu inte infört.
2. M04 och M17 kan inventeras oberoende. M02 och M03 följer M01.
3. M05/M06 förbereder första svarflödet. M07 flyttar hela flödet genom ny backend.
4. M08 förbereder isolerad molntestdrift parallellt. Ingen skarp Cloud SQL-
   växling innan M12/M13 och alla pilotens beroenden är verifierade.

Övriga uppgifter i indexet är planerade. Ingen är markerad implementerad.
M15A/M15B separerar kanalerna och M18A/M18B/M18C separerar katalogflytt, Vite och hosting. Fler självständiga
uppgifter krävs för kvarvarande verksamhetsflöden innan pilotens cutover-grind.

## Frågor som behöver beslut före respektive aktivering

| Fråga | När krävs svaret? | Nuvarande hantering |
| --- | --- | --- |
| Region och same-origin-stöd | M08 innan Terraform-plan låses | europe-west1 kandidat, europe-north2 alternativ; båda kräver verifiering |
| SLO, RPO, RTO och SQL HA | Före produktionsbudget/provisionering | HA-budget reserveras; ingen tillgänglighetsnivå påstås |
| Faktisk signeringsnyckel, audience/scopes, kontorevokering | M03 före auth-aktivering | Enbart teststub verifierad hittills |
| Befintlig domän/RP-ID och preview-origins | Före domän-/hostingbyte | Behåll befintlig identitetsleverantör och ändra inte RP-ID utan plan |
| Auth passkeys/OAuth Terraform-stöd | Före automatisering av dessa fält | Låst providerkälla granskad; faktisk publicerad release/API-roundtrip återstår |
| SSR/förgenerering och publik datafärskhet | M17 före Vite | Next.js kvar tills beslut och prov |
| Tillåten livslängd för äldre frontend/API | Före brytande API-ändring | Additiva kontrakt och kompatibilitetsadapter under övergången |
| Pilotklubb och datafrysningsfönster | M13 efter testrepetition | Ingen produktionspilot vald eller bokad |

## Mall vid nästa avslut

```text
Uppgift / PR / commit:
Ändrat beteende och berörda filer:
Verifiering (godkänt / fel / överhoppat / ej kört, exakt revision/miljö):
Begränsningar och aktiveringsstatus:
Nya beslut och följduppgifter:
Nästa beroende uppgift:
```
