# M21: Isolerat Vercel-prov för Kotlin och beständiga händelser

Status: teknikprov genomfört; hostingbeslut öppet enligt resultaten. Beroende: M00 (planerings-PR #97 mergad).
Detta provar delar av M01/M02/M06 tillsammans för ett konkret hostingbeslut;
det markerar inte dessa större uppgifter som färdigimplementerade.

## Bakgrund och avgränsning

Användaren har skapat Vercel- och Supabase-projekten `forena-kotlin` och
auktoriserat nödvändiga ändringar där. Ordinarie Förena-produktion berörs inte.
Läs [AGENTS.md](../../../AGENTS.md), [beslut](../decisions.md),
[versioner](../versions.md) och [backend/README.md](../../../backend/README.md). Boot 4.1.0, Kotlin 2.4.20 och JDK 26 är
fortsatt låsta. Vercel Services är beta; Cloud Run är reservval tills provet
visar tillräckliga egenskaper och begränsningar.

## Filer och ansvar

`backend/` innehåller det isolerade Maven-/containerprovet med commands,
effects och transport. `scripts/probe/` har reproducerbara lokala process- och
molnprov. `.github/workflows/ci.yml` verifierar backend tillsammans med
befintliga kontroller. Ingen ändring av Next.js, dess drift eller rotens
Vercel-konfiguration krävs. Resultat finns i [provrapporten](../vercel-probe-results.md).

## Acceptanskriterier

1. Samma JDK-distribution/patch och låsta byggverktyg används lokalt, i CI och
   container. Maven Wrapper och arkivchecksummor verifieras. Vercel bygger JVM-
   containern; publicerad preview och faktisk källversion registreras.
2. Ett privat testschema migreras separat med Liquibase. Runtimekonto saknar
   superuser/BYPASSRLS och DDL-rättigheter. TLS med certifikat- och
   värdnamnsvalidering samt session pooler provas med faktisk JDBC.
3. REST-skrivning och beständig Modulith-leveranspost är atomära. Klienten
   tar emot hela HTTP-svaret och skriver därefter kvittensmarkör direkt i DB.
   En fördröjd lyssnare ska kunna slutföra efter markören. Ingen statuspollning
   mot appen får hålla den aktiv under observationen. Prova 10 och 60 sekunder.
4. Abrupt processdöd före eventkvittens lämnar beständigt arbete. Ny JVM och
   autentiserat återtag inom en aktiv requests livstid slutför arbetet; två
   återtag ger en sparad effekt. Lokal processdöd och verklig molnkrasch
   rapporteras separat. Kraschläge är avstängt som förval.
5. Modulithstruktur, riktigt modultest, rollback, samtidiga omförsök, felaktig
   provtoken och begränsad databasroll testas mot PostgreSQL.
6. Skilj observerad körning efter HTTP-svaret från dokumenterad runtimegaranti.
   Utan belagt stöd kan fristående Java-trådar inte vara enda leveransmekanismen.
   Återkommande säker väckning från noll, instanskonkurrens, region och kostnad
   måste verifieras före hostingbeslut, även om detta lilla prov är grönt.

## Lämnas till senare

Riktiga medlemsdata, Supabase-användar-JWT/passkeys/MCP, notifieringar och
produkt-UI ingår inte. Testsidan ersätter inte separat React-/Next.js-routing.
Ingen ny generell outbox, Pub/Sub eller Vercel Queues behövs för första provet.
Ingen produktionsmigrering, planuppgradering eller automatisk schemaflytt ingår.
Om databasnät, planstöd eller autentiserad åtkomst blockerar molnprovet ska
resultatet markeras ofullständigt; lokala tester ersätter inte molnbeviset.

## Avslut

Samla kod, tester, resultat och överlämning i en separat PR mot aktuell main.
Uppdatera status med exakt revision, godkända/misslyckade/ej körda prov och nästa
beroende uppgift. Ingen miljö- eller credentialinformation får läcka till loggar
eller repo. Stoppa tillfällig testklient efter provet och dokumentera kvarvarande
resurser; ta inte bort användarens projekt.
