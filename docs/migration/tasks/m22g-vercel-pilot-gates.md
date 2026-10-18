# M22G: verifiera Vercel- och schedulergrindar före pilot

Status: planerad; ingen separat agent/session eller GitHub Issue startad.
Beroenden: M22E för underlag, M22F för slutligt kapacitetsprov. Egen PR från main.

## Bakgrund och relevanta filer

Läs AGENTS.md, [M22E](../m22-load-cost-results.md), [kostnadsbilden](../m22-costs.md),
ADR-009 i [besluten](../decisions.md), M22A–D:s rapporter och status.
Filer: backend/Dockerfile.vercel, vercel.json, application.properties,
ProbeWorker och delivery/internal, ProbeController, ProbeSecurity,
scripts/probe/scheduler-*.sql och local-capacity.py.
En förening först. Supabase PostgreSQL/Auth och Supabase Cron är huvudspåret;
Vercel Pro är inte ett obligatoriskt krav för cron från Supabase.

## Avgränsat mål och acceptans

1. Verifiera aktuella container-beta-/planvillkor för faktisk föreningsdrift,
   skalningsstyrning, tidsgränser, loggar/larm och same-origin-routing. Skilj
   dokumenterat stöd, kontokonfiguration och observerat beteende. Ett automatiskt
   Functions-concurrencytak bevisar inte en inställning för exakt två JVM:er.
   Ingen betalplan/betald funktion aktiveras utan separat auktorisation.
2. Formulera ett konkret schedulerbeslut: pg_net:s credentials delas med alla
   direkta SQL-loginroller, även runtime. Dokumentera vilka konton som ingår
   i tillitsgränsen. Om den gränsen inte godtas, jämför extern scheduler utan
   databaslagrad HTTP-hemlighet. Vercels egen cron använder GET, medan proben
   idag använder POST; den är inget färdigt byte. Avstängt Data API behålls.
3. Ersätt/avgränsa manuellt återtag, kraschfunktioner och Moduliths obegränsade
   shutdown-diagnostik inför produktionsmodellen. Stäng inte av registrering/
   transaktionell säkerhet för att dölja obegränsad läsning. Uppföljning av
   backlog/ålder, missade ticks och fel ska vara oberoende av användartrafik.
4. Kör begränsat prov endast i forena-kotlin med syntetiska data, uttryckligt
   maxantal anrop och sluttid, skyddad preview och verifierad startstädning.
   M22E städade M22C 2026-10-18; kontrollera nytt nuläge innan namnen återanvänds.
   Visa **två olika JVM-ID:n med överlappande arbete** om autoskalningen kan
   framkallas inom provbudgeten. Två HTTP-svar räcker inte. Om plattformen
   återanvänder en JVM, redovisa provet som ej bevisat utan obunden lastökning.
5. Bekräfta retry/krasch/effekt/kvittens med M22F-koden, uppmätt anslutningstak,
   riktiga lokala regressioner och sanerad molnevidens. Läs inte råa pg_net-
   headers/felkroppar för loggning. Återkalla tillfällig åtkomst, stäng jobb och
   rensa endast provets data efteråt. Behåll användar-/produktionssystemet.
6. Dokumentera slutlig rekommendation och kvarvarande godkännandepunkter för
   pilot i ADR/status, inklusive verkligt konto/plan, region och månadskostnad.
   Inget byte till Cloud Run eller köp får ske automatiskt om en grind faller.

## Ingår inte och överlämning

Ingen produktionsaktivering, ny OAuth/WebAuthn-server eller databasflytt.
Ingen publik last på ordinarie Förena. Ingen extern utskicksidempotens kan
påstås bevisad av en unik databasrad. Nästa verksamhetsarbete är M02/M03/M04,
svarstjänsten och M07; Cloud Run-alternativet kräver eget M08-prov vid ett nytt val.
