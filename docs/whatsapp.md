# WhatsApp-notifieringar och kallelsesvar

Första implementationen för [#69](https://github.com/johkin/forena/issues/69)
använder Meta Cloud API och ett gemensamt Förena-nummer. Kanalen är personligt
valbar och avstängd i en ny installation. Grupper, egna föreningsnummer,
assistentdialog och tolkning av fritext ingår inte.

## Användarflöde

1. Öppna Min profil → WhatsApp, lämna samtycke och välj Koppla WhatsApp.
2. Öppna länken och **skicka** det förifyllda engångsmeddelandet från det nummer
   som ska kopplas. Att bara öppna chatten verifierar ingenting. Länken gäller
   tio minuter, är personlig och ska inte delas.
3. Välj Jag har skickat meddelandet i Förena för att kontrollera anslutningen.
4. Kallelser och påminnelser får **ett meddelande per person/barn**, med namn,
   lag, aktivitet, tid, plats, samling och sista svarstid. Varje meddelande har
   **Kommer**, **Kan inte** och **Öppna Förena**. En förälder med två kallade barn
   får två meddelanden med två svarsknappar i varje.
5. Knappsvaret sparas i samma `invitations.response` som appen använder. Vanliga
   triggers publicerar ändringen till övriga vyer och bakgrundsarbete. Ett nytt
   knapptryck kan ändra svaret. Befintlig kommentar bevaras; kommentarer redigeras
   i Förena. En kort bekräftelse skickas i WhatsApp efter databasens kvittens.
6. Stäng av i profilen eller skicka exakt STOP, STOPP eller AVREGISTRERA.
   Numret raderas från anslutningen och gamla knappar slutar fungera.

Övriga notifieringar använder en generell mall med en länk, utan personnamn,
aktivitetstext eller plats. Utgående affärsbeslut ligger fortsatt i befintliga
schemaläggare. Privata meddelandesnapshots skapas i samma transaktion som outbox
för personer som redan har aktiverat WhatsApp. Äldre köposter utan snapshot
använder den generella mallen.

Leveransordning: WhatsApp för anslutna konton, annars push och därefter e-post.
Om Meta-anropet misslyckas används samma reservordning. Vid partiellt utskick
för flera barn kan mottagaren få både en WhatsApp-kallelse och en reservnotis.
Sparade lyckade barnmeddelanden skickas inte igen vid transportåterförsök.
Om alla kanaler misslyckas gäller outboxens befintliga backoff och fem försök.

`sent` betyder att leverantören accepterat meddelandet, precis som befintlig
leveranshistorik; det är ingen garanti för leverans eller läsning. Asynkrona
leveransstatusar från Meta ignoreras i denna version. Reservkanalen aktiveras
vid misslyckat API-anrop, inte vid ett senare leveransfel hos Meta. Precis som
övrig outbox-leverans är utskick minst en gång: avbrott mellan API-accept och
databaskvittens kan ge dubbletter. Svar är idempotenta oavsett transportdubbletter.
Bekräftelser efter svar skickas som ett direkt försök; ett bekräftelsefel ändrar
inte ett sparat svar och duplicerade webhooks skickar inte en ny bekräftelse.

## Meta-konfiguration

Skapa en Meta-app med WhatsApp Business Platform, ett registrerat avsändarnummer
och en serveråtkomsttoken med nödvändiga meddelandebehörigheter. Onboarding,
verksamhetsverifiering och mallgranskning görs hos Meta. Konfigurera installationens
publika HTTPS-adress och prenumerera på WhatsApp-fältet `messages` med callback
`https://<Förena-domän>/api/whatsapp/webhook`.

Skapa och invänta godkännande för **båda** mallarna, med språk `sv` (eller ändra
språkkoden så den exakt matchar den godkända mallen):

| Mall | Innehåll och komponenter |
| --- | --- |
| `forena_notification` | Statisk text: ”Du har ny information i Förena. Öppna Förena för att läsa.” En URL-knapp på index 0: Öppna Förena. |
| `forena_invitation` | Body med sju textparametrar i ordning: person, lag, aktivitet, starttid, plats, samlingstid, sista svarstid. Två quick reply-knappar på index 0 och 1: Kommer / Kan inte. URL-knapp på index 2: Öppna Förena. |

Exempel på kallelsemallens body:

```text
Kallelse för {{1}}
Lag: {{2}}
Aktivitet: {{3}}
När: {{4}}
Plats: {{5}}
Samling: {{6}}
Svara senast: {{7}}
Du kan ändra ditt svar med knapparna. Öppna Förena för kommentarer.
```

Båda URL-knapparna ska ha installationens kanoniska origin följt av `/{{1}}`,
exempelvis `https://forena.example/{{1}}`. API:t tillför endast
`activities/<uuid>` eller `?notification=1`. Använd ett syntetiskt aktivitets-ID
som exempelsuffix vid mallgranskningen. Tider formateras i föreningens tidszon.
Meta avgör mallkategori och godkännande; notifieringsmallen är inte automatiskt
godkänd bara för att namnet finns i konfigurationen.

Ange följande servervariabler i **webbappen**:

- `WHATSAPP_ENABLED=false` tills hela installationen testats.
- `WHATSAPP_BUSINESS_NUMBER`: numret för `wa.me`, internationellt med landskod,
  bara siffror. Detta är telefonnumret, inte Meta-ID:t.
- `WHATSAPP_PHONE_NUMBER_ID`: det numeriska Meta-ID:t för samma avsändare.
- `WHATSAPP_APP_SECRET`: Meta-appens hemlighet för HMAC-verifiering.
- `WHATSAPP_VERIFY_TOKEN`: en separat slumpmässig hemlighet för callback-verifiering.
- `WHATSAPP_ACCESS_TOKEN` och `WHATSAPP_API_VERSION`: för svarsbekräftelser.

Ange följande som **Supabase Edge Function secrets** för `notification-worker`:

- `WHATSAPP_ENABLED`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` och
  `WHATSAPP_API_VERSION`, med samma värden som i webbappen.
- `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_INVITATION_TEMPLATE_NAME` och
  `WHATSAPP_TEMPLATE_LANGUAGE`, exakt enligt de godkända mallarna.

API-version måste anges explicit, exempelvis `v23.0` endast om den fortfarande
stöds av er Meta-app. Det finns inget flytande förval. Inga credentials får
prefixas med `NEXT_PUBLIC_`. Appens service key används endast efter verifierad
webhook-signatur; användarinställningar använder användarens ordinarie klient.

Applicera migrationen och publicera worker och webbapp innan flaggan aktiveras
i båda miljöerna. Prova i en separat testinstallation med syntetiska barn och
Metas testnummer: koppling, två barn/två meddelanden, ja/nej/ändring, dubbel webhook,
återkallad målsmanskoppling, inställning, utgången svarstid, STOPP och reservkanal.
Utan konton, hemligheter, godkända mallar och verkliga API-anrop är integrationen
lokalt verifierad med testdubblar, inte verifierad mot Meta.

## Säkerhet och livscykel

Kontot måste vara inloggat med verifierad e-post. En slumpmässig 256-bitarskod
kopplar WhatsApp-numret till just detta konto; bara SHA-256-hash lagras.
Högst ett nytt kopplingsförsök per minut och fem per timme/konto tillåts.
Ett telefonnummer kan inte överföras från ett anslutet konto med en ny kod.
Nummer, samtyckestid och version, kodhashar och knappkopplingar ligger i
`messaging`, med RLS utan klientgrants. Profilen får enbart eget maskerat nummer.
Avstängning invaliderar även väntande koder.

Webhook verifieras med `X-Hub-Signature-256` över kroppen innan administrativ
klient skapas. Fel avsändar-ID, okända payloads och annan fritext ignoreras.
Högst 256 kB accepteras. Inkommande meddelande-ID dedupliceras transaktionellt.
Gamla/för långt framtida händelser avvisas. Telefonnummer, koder, meddelandetext
och leverantörens svarskropp loggas inte.

Varje knapp bär en opak referens till ett bestämt meddelande, konto och kallelse;
referensen ensam ger ingen behörighet. Webhookens signerade avsändarnummer måste
fortfarande tillhöra mottagarkontot. Kontot måste fortfarande vara personen själv
eller aktuell målsman. Ingen ledar-/administratörsroll ger rätt att använda andras
knappar. Vanliga appbehörigheter ändras inte.

Svar kontrolleras mot aktuell aktivitet under samma aktivitetslås som befintligt
svarsskydd. Inställda, avslutade, ännu ej skickade, ändrade eller för gamla kallelser
nekas. WhatsApp-knappar stängs vid den tidigare av sista svarstid och aktivitetens
slut; appen kan ha andra regler för sena svar. Gamla webhookhändelser får inte
skriva över senare app- eller WhatsApp-svar. Samtycke och opt-out serialiseras med
inkommande svar. Redan pågående nätverksanrop kan inte återkallas.

Kodhashar och webhookkvittens-ID:n rensas efter ett dygn i begränsade batcher
varje timme; ovanligt stora köer kan kräva flera körningar. Meddelandesnapshots
följer outboxens befintliga 90-dagarsrensning via FK-cascade. Telefonnummer raderas
direkt vid avregistrering eller kontoborttagning.

## Avgränsning mot utredningen i #69

Mallutskick används även utanför 24-timmarsfönstret. Inkommande svarsknappar
öppnar kundtjänstfönstret för den direkta textbekräftelsen; läsning eller öppnande
av chatten används aldrig som bevis för ett öppet fönster. Inga AI-anrop görs.

Denna ändring ersätter inte ärendets efterfrågade fullständiga jämförelse med
Twilio, avtals-/grupputredning eller kostnadsunderlag. Aktuella svenska priser,
mallkategorier och ändringar från oktober 2026 är **inte verifierade** här och
inga fria kvoter eller kostnadsfria svar förutsätts. Ett meddelande per barn
innebär separata mallutskick och kan därmed påverka kostnaden.

Officiella referenser för driftens fortsatta kontroll:

- https://developers.facebook.com/documentation/business-messaging/whatsapp/
- https://business.whatsapp.com/products/platform-pricing
- https://www.twilio.com/docs/whatsapp/buttons
- https://www.twilio.com/docs/whatsapp/key-concepts
- https://www.twilio.com/en-us/whatsapp/pricing

Återstående arbete: asynkrona leveranskvittens/fel med reservkanal, beständiga
svarsbekräftelser, organisationsvis konto-/kostnadsmodell, kostnadstak och separat
bedömning av grupper och eventuell föreningsassistent. Ärende #69 hålls öppet för
det återstående beslutsunderlaget.
