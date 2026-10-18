# M21: Vercel/Kotlin — resultat 2026-10-18

**Slutsats:** JVM-containern fungerar med Supabase PostgreSQL, men fristående
asynkron eventhantering efter HTTP-svaret är inte en tillräcklig leveransgaranti.
10-sekundersprovet lyckades; 60-sekundersprovet blev inte klart inom 90 sekunder.
Beständig Modulith-publicering överlevde en verklig JVM-krasch och återtogs
av en ny instans genom ett aktivt, autentiserat HTTP-anrop.

## Miljö och källversion

- Bas: main `ce0d23a647bdd852f2fb043d69b4bfd159c83c48`; branch
  `spike/vercel-kotlin`. Provet deployades från lokala filer före commit.
- Deployment: `dpl_DnH6LQbnvZn988LLSky7gMpVb3iv`,
  <https://forena-kotlin-1qaylk4pt-johkin.vercel.app>, skyddad preview.
- De 22 publicerade bygg-/runtimefilerna jämfördes byte för byte med repots
  filer efter sista kodändringen. SHA-256 per fil finns i
  [källmanifestet](evidence/vercel-probe-source-files.json). Tester och dokument
  ingick inte i den uppladdade deploymenten.
- Boot 4.1.0, Kotlin 2.4.20, Oracle JDK 26.0.2.1+1-7, Maven 3.9.11,
  Spring Modulith 2.1.0. Publicerade artefakter, Maven-plugins, byggning,
  modultest och faktisk JVM-start fungerade med dessa versioner.
- Endast nya projekten `forena-kotlin` användes. Privat schema
  `forena_probe`, syntetiska UUID:n, separat runtime- och migreringsroll.
  Ingen auth-, verksamhets- eller produktionsdata flyttades.
- Databas: Supabase PostgreSQL 17.11 i eu-central-1, session pooler port 5432.
  JDBC och observationsklienten använde `verify-full` med Supabases offentliga
  rotcertifikat. Direktanslutningen var inte tillgänglig från testklienten.
- **Vercels runtime-loggar visar iad1**, trots önskat fra1 i deploymentkonfiguration.
  Databas och separat testklient låg i Frankfurt. Senare sattes testprojektets
  standardregion till fra1, men detta har inte verifierats med en ny deployment.
  Mätningarna gäller således inte samlokaliserad JVM och databas.

## Observerade resultat

Alla tider nedan är UTC. Klienten läste hela 202-svaret och skrev därefter en
kvittensmarkör direkt i PostgreSQL. Under observationsfönstren gjordes inga
ytterligare HTTP-anrop till appen. Vercel Sandbox var endast testklient.

| Prov | Utfall | Bevis |
| --- | --- | --- |
| NORMAL 10 s | Godkänt i denna körning | ID `e06d1404-1cca-45ff-a03e-6eed850c3c68`. Svar mottaget 12:03:09.724591; effekt sparad 12:03:20.955593, efter DB-kvittensen. HTTP-tid 19 045 ms inklusive eventuell uppstart. |
| NORMAL 60 s | Misslyckat inom observationsfönstret | ID `22e40263-e8d3-451c-a7d2-e81bd9ec74b4`. Svar mottaget 12:03:22.497039, HTTP-tid 709 ms. Ingen effekt efter 90 s; beständig publicering kvar. Exakt orsak till avbruten/suspenderad lyssnare är inte belagd. |
| Verklig molnkrasch | Godkänt | ID `39a4c24a-7718-4d73-a618-0778685803e1`. Svar mottaget 12:05:10.338105. Vercels runtime-logg 12:05:21.843: `Application exited with code 137 (SIGKILL).` Koden använde avsiktligt `Runtime.halt(137)`. |
| Återtag efter krasch | Godkänt | Före återtag: 1 oavslutad publicering, 0 effekter. Autentiserat återtag tog 30 377 ms och väntade på slutförande. Efter två återtag: 1 effekt och 2 olika instans-ID:n i försöksloggen. |
| Separat Liquibase-jobb | Godkänt | JDBC-migrering lyckades. Andra körningen rapporterade aktuell databas, 0 nya changesets. Runtime saknar migreringslösenord och DDL-rättigheter. |
| Lokal Maven-verifiering | Godkänt | Sista körningen klar 12:06:24: 9 tester, 0 fel/överhoppade. Testcontainers PostgreSQL, Modulithstruktur och riktigt modultest. |
| Lokal processdöd och omstart | Godkänt | Verkligt JVM-exit 137, ny process, beständig återtagning, exakt 1 sparad effekt efter replay. |
| Befintlig frontend | Godkänt lokalt | 131 testfiler, 1 065 tester; typecheck, lint och build lyckades. Frontendens källkod och rotens vercel.json är oförändrade. |

Ett tidigare anrop till `/probe.js` träffade dessutom Vercels uppstartsgräns
(port 80 inte redo inom cirka 28 s). Senare startade containern och proven ovan
gick att köra. Kallstart och latens behöver därför egen verifiering före pilot.

## Begränsningar och städning

Detta är enstaka observationer, inte en garanti från Vercel. Ingen mätning
bevisar automatisk väckning från noll, flera konkurrerande instansers återtag,
leverans-SLO eller idempotenta externa mejlutskick. En unik DB-effekt bevisar
inte att en extern tjänst aldrig anropas två gånger.

Ett extra återtag av just 60-sekundershändelsen kördes inte: automatisk
godkännandegranskning nekade kommandots credentialöverföring till testklienten.
Kraschens återtag ovan hade redan slutförts. Inga resultat tillskrivs det nekade
kommandot. 60-sekunderspubliceringen kan därför fortfarande vara oavslutad.

Den tillfälliga testklienten är stoppad. Vercel-/Supabase-projekten och previewn
finns kvar. Deployment Protection är kvar; temporär åtkomstlänk gäller högst
23 timmar och finns inte i repot. Preview använder separat provtoken och
begränsade DB-credentials; avsiktligt kraschläge är endast aktiverat i denna
isolerade preview. Inga schemalagda jobb eller planuppgraderingar skapades.
Migreringslösenordet lagrades inte i appens runtimekonfiguration.

Testprojektets Git-inställning är nu `rootDirectory=backend`, framework
`services`. Ordinarie Vercelprojekt och rotkonfiguration ändrades inte.
Första Git-previewn byggde till READY för commit
`0e4833dbca25ae934067dc870ed6aaf437d12556`:
`dpl_72dhwj6Us79z3Z2egi52YDTgXWR8`. Den verifierar Git-bygget från backend;
livscykelmätningarna ovan avser fortfarande den tidigare API-deploymenten.
Ingen ny mätning av faktisk JVM-region är gjord.

Första CI-körningen passerade Maven och alla nio tester men visade en startrace
i processprovets väntan på PostgreSQL: initieringsserverns Unix-socket kunde
svara före den slutliga servern. Skriptet väntar nu på TCP och hanterar fel även
före skapad loggkatalog. Rättningen verifieras med samma verkliga kraschprov;
slutlig CI-status läses på PR:ens senaste commit.

## Kostnad och nästa beslut

Ingen verifierad månadsbudget följer av ett kort teknikprov. Kontot var Hobby;
Services är beta. Kontrollera planstöd, container-CPU/minne under aktiv request,
tomgång, byggtid, kallstarter, DB-anslutningar och egress innan kostnadsbeslut.
Testklienten kördes cirka 23,4 minuter med 2 vCPU/4 GiB och stoppades; detta är
inte appens normala driftkostnad. Separat Supabaseprojekt kan ge egen fast
compute-kostnad beroende på organisationens plan. Befintlig antagandebudget i
[costs-and-regions.md](costs-and-regions.md) ska inte läsas som verifierat Vercel-pris.

[M22](tasks/m22-vercel-delivery.md) ska prova beständig, begränsad återtagning
under aktiv request och säker schemalagd väckning från noll. Hostingbeslutet
för verksamhetsbackend är öppet tills leverans, region, kallstart och kostnad
är verifierade. Ingen egen generell outbox behövs för detta prov.
