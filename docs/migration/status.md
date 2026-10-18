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

## Reviderad databasriktning

Planerings-PR: [#97](https://github.com/johkin/forena/pull/97), mergad som `ce0d23a`.
Supabase PostgreSQL behålls enligt ADR-008. Cloud SQL är ett senare alternativ,
inte ett beroende för backend eller frontend. Befintlig säkerhet behålls tills
motsvarande backendregler är testade. M20 ger separat verifiering av portabilitet.
Inga databaser har ändrats eller provisionerats; inga nya prisuppgifter verifierats.
Tidigare budget och M00:s kontrollantal avser första planversionen.
Den reviderade planens 209 lokala länkar, 23 uppgiftsbeskrivningar och
beroendegraf har kontrollerats; Cloud SQL-uppgiften blockerar inte backendpiloten.
Inga apptester kördes lokalt för denna rena textändring.

M21:s teknikprov startades på `spike/vercel-kotlin` från `ce0d23a` på main.
Det testar delar av M01/M02/M06; inga beroende PR:er staplas på planeringsbranchen.
Maven Wrapper, låst container, 9 backendtester och CI-jobb finns nu i M21:s
separata ändring. Lokal Maven-verifiering och appens tester/typecheck/lint/build
är godkända. Publicerad Vercel-preview och Supabase-JDBC-prov är körda, se
[provrapporten](vercel-probe-results.md) med källmanifest och exakta resultat.
10 s efter HTTP-svar lyckades; 60 s blev inte klart inom 90 s. Verklig JVM-krasch
återtogs av ny instans, med en effekt efter upprepat återtag. Hostingbeslutet är
fortfarande öppet. M22 beskriver nästa leveransprov, inte en startad session.

## Nästa ordning

1. M01: grundprojekt med låsta versioner, Maven Wrapper, container och CI samt
   struktur-/modultester. M21 inför ett isolerat bygge; verksamhetsgrundprojektet återstår.
2. M04 och M17 kan inventeras oberoende. M02 och M03 följer M01.
3. M05/M06 förbereder första svarflödet. M07 flyttar hela flödet genom ny backend.
4. M08 förbereder Cloud Run med verifierad anslutning till Supabase PostgreSQL.
   M13 är backendpilot på samma databas. M12:s Cloud SQL-flytt är vilande.

Övriga verksamhetsuppgifter i indexet är planerade. M21 är ett genomfört teknikprov,
inte implementering av verksamhetsbackend. M22 följer innan hostingvalet fastställs.
M15A/M15B separerar kanalerna och M18A/M18B/M18C separerar katalogflytt, Vite och hosting. Fler självständiga
uppgifter krävs för kvarvarande verksamhetsflöden innan pilotens cutover-grind.

## Frågor som behöver beslut före respektive aktivering

| Fråga | När krävs svaret? | Nuvarande hantering |
| --- | --- | --- |
| Region och same-origin-stöd | M08 innan Terraform-plan låses | europe-west1 kandidat, europe-north2 alternativ; båda kräver verifiering |
| SLO, RPO, RTO och backup/PITR | Före produktionsbudget/aktivering | Verifiera stöd och pris i vald Supabaseplan; Cloud SQL HA är endast jämförelse |
| Faktisk signeringsnyckel, audience/scopes, kontorevokering | M03 före auth-aktivering | Enbart teststub verifierad hittills |
| Befintlig domän/RP-ID och preview-origins | Före domän-/hostingbyte | Behåll befintlig identitetsleverantör och ändra inte RP-ID utan plan |
| Auth passkeys/OAuth Terraform-stöd | Före automatisering av dessa fält | Låst providerkälla granskad; faktisk publicerad release/API-roundtrip återstår |
| SSR/förgenerering och publik datafärskhet | M17 före Vite | Next.js kvar tills beslut och prov |
| Tillåten livslängd för äldre frontend/API | Före brytande API-ändring | Additiva kontrakt och kompatibilitetsadapter under övergången |
| Pilotklubb och routingfönster | M13 efter testrepetition | Ingen produktionspilot vald eller bokad |

## Mall vid nästa avslut

```text
Uppgift / PR / commit:
Ändrat beteende och berörda filer:
Verifiering (godkänt / fel / överhoppat / ej kört, exakt revision/miljö):
Begränsningar och aktiveringsstatus:
Nya beslut och följduppgifter:
Nästa beroende uppgift:
```

## M22: genomförd första del

PR #98 är mergad som `2e0af8f`. Fortsättningen på `test/vercel-durable-delivery`
utgår från denna main. [Delrapporten](m22-results.md) registrerar verifierad
fra1-runtime i Git-previewn och ett reproducerbart lokalt konkurrensprov med
två separata JVM:er. Tre omgångar gav en effekt och noll oavslutade publiceringar.
Krasch-/omstartsprovet passerade också. CI aktiverar samma två-JVM-prov.

Även verkligt långt återtag är nu godkänt: den ursprungliga PROCESSING-posten
och en ny 60-sekundershändelse efter 90 s utan apptrafik återtogs i ny JVM,
med cirka 76 s aktiva HTTP-anrop. Upprepat återtag gav en effekt och noll
oavslutade poster i båda fallen. Resultat och exakta deployment-/klienthashar
finns i delrapporten. Observationskontot har endast läsrättigheter; LOGIN är
avstängt och den tillfälliga testklienten är stoppad. Användaren har godkänt
credentialöverföring för detta och kommande isolerade test.

Vercel Cron kräver production-deployment och Hobby stödjer endast dagliga jobb.
Ingen planuppgradering eller cronaktivering har gjorts. Nästa avgränsade del
är ett workeranrop med tidsbudget och faktisk schemalagd väckning, exempelvis
med Supabase Cron. Molnkonkurrens, felpunkt efter effekt och full kostnadsbild
återstår också; M22 är inte avslutad och hostingbeslutet är öppet.
