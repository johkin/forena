# M22B: Data API och pg_net:s tillitsgräns

Datum: 2026-10-18. Bas: PR #100 mergad som
`e43d752e9792124bd3ec8c2aaa3ed83462afb177`. Separat branch
`test/scheduler-isolation`. [Uppgift och acceptans](tasks/m22b-scheduler-isolation.md).
Endast Supabase-projektet forena-kotlin, `ckzrtxqjskosqzoitymc`, berördes.
Ingen verksamhetskod, Kotlin-version, Vercelkonfiguration eller ordinarie
Förena-produktion ändrades. [Sanerat bevis](evidence/m22-isolation.json).

## Slutsats och fortsatt riktning

**Behåll JDBC och avstängt Data API i Kotlin-testprojektet.** Användaren
bekräftade att avstängningen var avsiktlig. Kotlin behöver inte PostgREST för
JDBC; Supabase Auth är ett separat API. Detta prov verifierar inte passkeys,
OAuth eller användar-JWT. Det befintliga Förena-projektets frontend använder
fortfarande sina befintliga integrationer; ändra inte dess Data API.

**503 i M22A var inget bevis för schemaisolering, men har nu en förklaring.**
Supabases loggar visade db-schemas=pg_pgrst_no_exposed_schemas och saknat schema
(3F000). Leverantören beskriver detta som beteendet när Data API stängts av.
Vi skapade inte det saknade plattformsschemat och införde inte dokumentationens
permanenta workaround. Avstängningen återställdes efter ett kort kontrollprov.

**Avstängt Data API isolerar inte pg_net från JDBC-/SQL-konton.** Katalogen
visar att runtime kan läsa och skriva i net.http_request_queue genom PUBLIC,
trots att kontot saknar åtkomst till Vault och scheduler-schemat. Den som kan
köra godtycklig SQL som runtime kan därför läsa credentials som en scheduler
lägger i kön och skapa HTTP-anrop. Det är en separat förmåga som inte följer
vanliga verksamhetsgrants. En normal webbanvändare får däremot ingen direkt
SQL-inloggning bara för att anon/authenticated har dessa databasprivilegier.

Detta hindrar inte nya syntetiska prov med kontrollerade SQL-konton. Det
fastställer inte en produktionsmodell: före aktivering måste vi antingen
uttryckligen acceptera att **alla SQL-inloggningar delar tillit för dessa
HTTP-credentials**, inklusive ett komprometterat runtimekonto, eller låta en
schemaläggare utanför databasen hålla credentialen. Det senare behöver inte
betyda Google Cloud; Vercels egen Cron kan utvärderas med plan-, autentiserings-
och kostnadsgränser i M22. Ingen ny leverantör, outbox eller plan är vald här.

## Verifierade kontroller

Ett tillfälligt schema, forena_probe_api_check, innehöll endast en syntetisk
rad. RLS tillät anon/authenticated att läsa just raden, och endast SELECT
beviljades. Ett tillfälligt pgrst.db_schemas-override exponerade **enbart** detta
schema. Privata scheman exponerades aldrig för att prova en negativ kontroll.

13 riktiga HTTP-anrop gick från Supabases pg_net till projektets HTTPS Data API
med projektets publishable key. Ingen service-role-nyckel, Vercelcookie eller
backendtoken användes. Pythonkontrollens fallista styrde de SQL-köade anropen;
Pythonverktygets egen HTTP-transport kördes inte från den nätbegränsade lokala
miljön. Resultaten verifierades med samma Pythonverktyg offline.

| Kontroll | Faktiskt resultat | Tolkning |
| --- | --- | --- |
| Fixtur, GET | 200 och exakt syntetisk kontrollrad | Positiv kontroll: API och anon-läsning fungerar |
| Fixtur, POST | 401 / 42501 | Skrivning nekad för oautentiserad anon; inte förväntat 403 för inloggad användare |
| net, forena_probe, forena_probe_scheduler, vault, auth, GET och POST | 10 × 406 / PGRST106 | Båda schemaheaders avvisas före relationsåtkomst |
| Scheduler-RPC, POST | 406 / PGRST106 | Privat schema inte tillgängligt via RPC-rutten |
| Före prov och efter konfigurationsåterställning | 503 / PGRST002 | Avstängt API; **inte** godkänt schemaisoleringstest |

Resultatet gäller den tillfälliga fixturkonfigurationen och HTTP-rollen anon.
Ingen autentiserad slutanvändar-JWT användes. Om Data API återaktiveras i en
framtida miljö ska dess verkliga konfiguration, användarroller, RPC:er och
exponerade vyer provas på nytt. Ett 404 för en saknad tabell eller en tom kö
räcker inte som bevis; kontrollen kräver 406/PGRST106 och fungerande positivt fall.

## SQL-rättigheter och plattformsgräns

Audit visar net-tabellernas ägare supabase_admin och PUBLIC-grants på tabellerna.
postgres saknar SELECT WITH GRANT OPTION. Inga nya REVOKE-/RLS-försök gjordes
på plattformsägda tabeller; M22A och aktuell dokumentation förklarar begränsningen.

| Roll | LOGIN | Läsa/skapa pg_net-köposter | Använda Vault | Använda/köra scheduler |
| --- | --- | --- | --- | --- |
| forena_probe_runtime | Ja | Ja / Ja | Nej | Nej / Nej |
| forena_probe_observer | Nej | Ja / Ja | Nej | Nej / Nej |
| anon | Nej | Ja / Ja | Nej | Nej / Nej |
| authenticated | Nej | Ja / Ja | Nej | Nej / Nej |

En syntetisk header skrevs i kön, lästes under SET LOCAL ROLE anon respektive
authenticated, och togs bort i samma transaktion före commit. Ingen HTTP-request
kunde skickas från denna rad och ingen riktig credential lästes.

Första försökets SET ROLE runtime nekades eftersom postgres-medlemskapets SET
är false; hela blocket rullades tillbaka. Medlemskapen utökades inte. Runtime
och observer verifierades därefter genom effektiva privilegier i katalogen,
inte faktisk JDBC-inloggning. Observer behöll NOLOGIN. Det är viktigt att
skilja faktisk SQL-rolläsning från katalogverifierade behörigheter.

Privat scheduler-schema och Vault skyddar sina egna objekt, men skyddar inte
den kopia av en dekrypterad credential som skrivs i net-kön. Rotation och kort
livslängd begränsar konsekvenserna men återställer inte rollisolering. Inte
heller SECURITY INVOKER, search_path eller NOINHERIT tar bort PUBLIC-grants.

## Reproduktion, återställning och verifiering

Se [backendens körbeskrivning](../../backend/README.md). Providerfixturen kördes
med MCP apply_migration som m22b_isolation_fixture och togs bort med
m22b_remove_isolation_fixture. Dessa två testbootstrap-poster finns kvar i
testprojektets Supabase-migrationshistorik; inga app-/Liquibasefiler ändras.
Konfigurationens återställning kördes separat före DROP, med HTTP-kontroll
medan fixturen fortfarande fanns. De ursprungliga authenticator-inställningarna
återkom utan pgrst.db_schemas-override.

Kontroller efter städning 17:08:35 UTC: fixtur saknas, 0 Cron-jobb, 0 köposter,
0 HTTP-responser, observer NOLOGIN, inga ändrade rollmedlemskap eller grants
till backend/Vault/scheduler. Bara provets dokumenterade request-ID:n raderades;
två misslyckade/avslutade SQL-markörprov kan ge sekvensluckor utan köposter.
Ingen Vercel-testklient, previewlänk eller ny hemlighet skapades. pg_net och
M22A:s tomma hjälpschema finns kvar för kommande isolerade prov.

Supabases säkerhetsrådgivare rapporterade inga lints efter städningen; det är
inte ett bevis för att pg_net-kön är privat. 13 HTTP-kontroller är godkända i
angiven testkonfiguration. Sex lokala Pythonregressionstester verifierar bland
annat att 503, tom positiv kontroll, saknad relation, lyckad skrivning och
ofullständiga kontroller aldrig ger godkänt. CI kör dem utan molncredentials.

Befintlig frontend: 131 testfiler/1 065 tester, typecheck, lint och build
godkända lokalt. Ingen separat lokal Maven-körning eller databasreset gjordes
för denna ändring av provverktyg/dokumentation; Kotlin- och verksamhetsschemat
är oförändrade. Ordinarie CI behåller samtliga app-, DB- och Kotlin-kontroller.

Nästa avgränsade uppgift är [M22C](tasks/m22c-scheduled-crash.md): faktisk
schemalagd JVM-krasch och effekt/kvittens. Begränsad registryläsning, last,
kostnader och produktionsmodell för scheduleråtkomst återstår i M22.

## Källor kontrollerade 2026-10-18

- [Avstängt Data API och pg_pgrst_no_exposed_schemas](https://supabase.com/docs/guides/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist).
- [Plattformsägda pg_net-grants](https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16).
- [Köheaders och Vault](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357).
- [Aktuell changelog](https://supabase.com/changelog): kommande TLS-ändring för
  HTTP-API gäller tidigast 2026-11-10; inga versionsbyten i denna uppgift.
  Markdownindexet gick inte att hämta via webbverktyget, HTML-indexet granskades.
