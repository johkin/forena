# M06/M10: beständiga kallelser och kontrollerad e-post

M06 och M10 implementeras tillsammans på `feat/m06-m10-delivery`, från main
`88dce8e`. Leveransen gäller den nya Kotlin-appens privata Liquibase-schema.
Extern leverans är avstängd som standard och kan endast aktiveras med en
uttrycklig lista av testmottagare. Ingen schemaläggare eller molnresurs aktiveras
av kodändringen. Web Push ligger fortsatt i M15A.

## Ansvar och transaktionsgränser

1. Aktivitetskommandot sparar aktiviteten och `activity_schedule` atomärt.
   För direktval finns kallelsen redan i appen; för schemalagda målgrupper
   materialiseras kallelsen först när schemat förfaller.
2. `ScheduledInvitationService` låser aktivitet före schemapost, med samma
   låsordning som redigering, inställning och svar. Aktuellt datumgiltigt
   lagmedlemskap avgränsar roller, personer, grupper och ansvarsgrupper.
   Inställda/påbörjade aktiviteter och passerade svarstider för påminnelser
   stoppas. Påminnelser kräver en befintlig obesvarad kallelse.
3. Identity lämnar endast verifierade, aktiva konton med aktiv explicit egen
   eller delegerad personåtkomst. Beslutet sparar adress och färdigt meddelande
   i `invitation_notification`. Checkpointens unika
   `(schedule_id, invitation_id, recipient_subject)` hindrar nya beslut vid replay.
   Schemakvittens, kallelser, checkpoints och Moduliths JDBC-register delar
   transaktion: ett sent fel rullar tillbaka allt.
4. Händelsen `InvitationNotificationRequested(id, version=1)` innehåller bara
   beslutets ID och payloadversion. Spring Modulith registrerar lyssnaren
   `invitation-email-v1`. `@TransactionalEventListener` med `REQUIRES_NEW`
   kopierar den oföränderliga snapshoten till `invitation_email`. En unik INSERT
   gör överlämningen idempotent även efter effekt men före registerkvittens.
   Inga externa HTTP-anrop görs i denna lyssnare och ingen `@Async` krävs.
5. Transporten sparar försöksnummer, första försöksdatum och en 120 sekunders
   lease **före HTTP**, i en separat transaktion. Inget databaslås eller
   databasanslutning hålls under Resend-anropet. Kvittensen binds till
   försöksnumret så att ett äldre försök inte skriver över ett senare.

Mottagarens behörighet och kallelsens svar prövas vid beslutet. Transporten
omprövar inte verksamhetsregler eller bygger om meddelandet efteråt. Adress,
innehåll och nyckel är desamma även om aktiviteten eller kontot senare ändras.
Den separata testmottagarspärren kontrolleras däremot inför varje sändning.

## Spring-komponenter och avgränsad egen kod

Spring Data JDBC äger verksamhetsrepositories och Spring äger transaktioner,
HTTP-routing och Bearer-autentisering. Modulith 2.1.0 äger samtliga
registerskrivningar och claims. Liquibase migration 016 inför dess v2-tabell;
runtime får inga DDL-rättigheter och inga tabeller exponeras för Data API.

Moduliths standardläsning materialiserar hela det ofärdiga registret.
En dekorator av dess publika `EventPublicationRepository` begränsar de två
återtagsläsningarna till 20 rader med två sekunders lästimeout. Dekoratorn
vidarebefordrar även Java-interfaceets defaultmetoder uttryckligen; annars kan
Kotlin-delegering tappa stateövergångar. Den ändrar inga registerrader med egen
SQL. Shutdown-diagnostiken visar därmed högst 20 väntande kallelsehändelser;
statusvägens aggregat är källan för fullständiga köantal. Andra eventtyper
behöver en uttrycklig utvidgning av denna begränsade läsmodell.

Arbetaren återtar publiceringar som varit inaktiva i minst 120 sekunder.
Modulith markerar övergivna försök som misslyckade och gör resubmission/kvittens.
Äldsta senaste försök väljs först, så att misslyckade poster inte för alltid
tränger undan resten. Upprepade modulreaktioner får samma transport-ID.

Resend använder Springs HTTP Service Client: `ResendHttpApi` deklarerar
`@HttpExchange`/`@PostExchange` och registreras via `@ImportHttpServices`.
`RestClientHttpServiceGroupConfigurer` sätter Bearer-header, timeout och
statushantering för gruppen `resend`. Spring hanterar klientproxyn, inklusive
AOT-registreringen. Adaptern översätter Resends svar till `Accepted`, `Retry`
eller `Rejected`. Rå svarskropp behålls endast lokalt för att skilja felaktig
2xx-JSON och olika 409-svar; kroppar och transportundantag loggas inte.

## Återförsök och kvittens

- Resend-nyckeln är alltid `invitation/<notification-id>`.
- `accepted` betyder att leverantören accepterat anropet, inte att mottagarens
  brevlåda verifierats. Provider-ID och accepttid sparas.
- Timeout, 408, 429, 5xx och samtidig idempotent begäran ger beständig backoff:
  minst 30, 60, 120, 240 sekunder, med numeriskt `Retry-After` som nedre gräns.
- Permanenta fel och payloadkonflikter blir `failed`. Adress utanför
  testlistan blir `suppressed` utan HTTP.
- Högst fem transportförsök tillåts. Resends idempotensfönster är 24 timmar;
  återförsök stoppas efter 23 timmar från **det första sparade försöket**.
  Okänd accept, slut på försök eller passerat fönster blir `uncertain`.
  Ingen automatisk nyckelrotation eller omstart av försöksräknaren sker.
- Scheman har separat backoff och blir `failed` efter fem materialiseringsfel.

Automatiskt återtag ger inte en transaktion över PostgreSQL och Resend eller
en garanti om exactly-once e-post. Operatören måste utreda `uncertain` hos
leverantören före ett nytt beslut. Återställ inte accepterade poster och radera
inte transportkvitton: registerreplay måste fortfarande hitta det ursprungliga
ID:t. Retention med beständiga tombstones och leveranswebhooks ingår inte här.

## Konfiguration och testkörning

Följande backendvariabler krävs för att aktivera testkedjan:

| Variabel | Betydelse |
| --- | --- |
| `FORENA_NOTIFICATIONS_ENABLED` | `false` som standard; `true` aktiverar arbetare och statusväg |
| `FORENA_NOTIFICATION_WORKER_TOKEN` | Separat hemlig token med minst 32 tecken; aldrig browser-/OAuth-token |
| `FORENA_NOTIFICATION_TEST_RECIPIENTS` | Kommaseparerade verifierade testkontoadresser; tom lista blockerar start |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Befintlig Resend-konfiguration; verifierad avsändardomän krävs vid riktigt prov |
| `FORENA_WEB_ORIGIN` | Befintlig exakt app-origin för länken `/activities/<id>` |

Local-profilen använder samma loggsändare som auth och gör inga externa utskick.
Använd bara syntetiska konton. Övriga profiler använder Resends HTTP-interface.
Testlistan omdirigerar inte medlemmars meddelanden till ett gemensamt konto;
adresser utanför listan blockeras.

Schemaläggaren skickar `POST /internal/notifications/run` med
`Authorization: Bearer <worker-token>`, utan query-token eller browsercookies.
Spring Security har en separat stateless filterkedja för dessa endpoints;
webbens och MCP:s autentisering gäller inte där. Svaret är `no-store` och
innehåller bara antal scheman, återtagskandidater och behandlade mejlposter.
Behandlade poster kan vara accepterade, misslyckade, uppskjutna eller spärrade.
Vercels befintliga Build Output-routing vidarebefordrar dessa paths till backend.

En körning behandlar högst 20 scheman, 20 återtagskandidater och 50 mejlposter.
Varje schema är begränsat till 1 000 personer och 1 000 mottagarbeslut; större
urval får ett beständigt fel i stället för ett delvis lyckat utskick. Körningen
har en mjuk budget på 45 sekunder och lämnar 16 sekunder före nästa mejlanrop
för transportens 5 sekunders connect-/10 sekunders read-timeout. En långsam
domäntransaktion kan överskrida den mjuka budgeten; det är inte en hård deadline.
Kökapacitet och flerinstansbeteende i målmiljön ska mätas i M22G.

## Schemaläggning, övervakning och överlämning

M22G ska ansluta en **oberoende** väckning, exempelvis Supabase Cron varje minut.
Ingen `@Scheduled` i denna leverans krävs för verksamhetens kallelser. Befintlig
auth-mejlkö har ett separat ansvar och ändras inte till denna arbetare.

Före ett målmiljöprov: välj scheduler-tillitsgräns, skydda previewn, skapa endast
syntetiska mottagare, sätt uttryckligt maxantal anrop och sluttid samt verifiera
startstädningen. Token i pg_net/Vault delar SQL-kontonas dokumenterade
credentialtillit; avstängt Data API ersätter inte detta beslut. Aktivera inte
ett jobb innan dessa M22G-punkter har avgjorts. Avsluta provet genom att stoppa
jobbet, kontrollera pg_net-kön, återkalla tillfällig token och verifiera städning.

`GET /internal/notifications/status`, med samma separata Bearer, lämnar
antal väntande/misslyckade scheman, väntande/misslyckade/osäkra/spärrade mejl,
ofärdiga publiceringar, äldsta väntande mejlets beslutsålder och arbetarnas
senaste start/slutförande. Inga adresser eller meddelanden lämnas ut. Oberoende
övervakning ska larma på missad tick, ökande köålder, `failed` och `uncertain`;
den är ännu inte konfigurerad i en molnmiljö.

Gamla Next/Supabase-köer fortsätter endast ansvara för gamla appens data.
Kotlin läser aldrig `public.notification_outbox` eller gamla `private.scheduled_tasks`.
Ingen gammal trigger eller worker producerar samma privata Kotlin-kallelse.
Ren-start-beslutet gäller: inga aktiviteter eller konton kopieras mellan systemen
i denna leverans. Vid pilot ska ägarskapet verifieras innan samma verksamhetsflöde
flyttas och den gamla producenten stängas av för just det flödet.

Kvar före driftacceptans: aktuell native-/OCI-artefakt, riktigt kontrollerat
Resend-prov, verifierad avsändardomän, Vercel/Supabase-väckning, larm och M22G:s
kapacitets-/tillitsgrindar. Telegram, Web Push, disciplinernas signalworker och
produktionens fullständiga notifieringspolicy är separata leveranser.
