# AI-assistent och Telegram i React/Kotlin

Gemensam implementation för [AI-specen](../specs/ai-assistent.md) och
[Telegram-specen](../specs/telegram-bot.md). Befintliga Next-flöden och den gamla
webhooken ändras inte genom en deployment av den nya appen.

## Ansvar och datagränser

`assistant` äger privata samtal, klubb-/sektionsprofiler, kontobundna och delade
minnen samt granskbara förslag. `identity` verifierar browser-sessioner och
Telegram-kopplingar. `activities` äger samma domänkommandon för båda kanalerna.
`telegram` är en transportadapter; den skapar inga browser-sessioner, interna
Supabase-JWT:n eller privilegierade reservklienter.

Migration 020 skapar privata tabeller i `forena`. Runtime använder projektets
vanliga dataroll; inga tabeller exponeras genom Supabase Data API. Främmande
klubb-/lagkopplingar skyddas även med främmande nycklar. Systemadministration
innebär ingen automatisk verksamhetsbehörighet.

Samtal och deras förslag är kontobundna. Kanal och klubb hör till samtalet.
Nytt samtal ogiltigförklarar föregående dialogs väntande förslag i samma kanal
oberoende av den andra kanalen. Radering tar bort Förenas sparade dialog,
inte Telegrams meddelandekopior. Gamla svar förblir historik även när aktuell
verksamhetsåtkomst upphör. Alla nya uppslag och bekräftelser kontrolleras på nytt.

Den personliga assistenten routar frågor till relevanta klubbassistenter.
Varje klubb får sin avgränsade fråga, sin profil, tillämpliga minnen och aktuellt
behörigt underlag. En klubb får inte den andra klubbens privata samtal eller
verksamhetsdata. Svar visas fortlöpande med tydlig avsändare; en misslyckad
klubbfråga märks som ofullständig, inte som ett tomt resultat.

Modellen får inga skrivverktyg eller webbsökning. Typade förslag lagras för
separat knappbekräftelse med ny behörighetskontroll, tidsgräns, låsning och
jämförelse mot granskat underlag. Ändrat underlag ger ny granskning. En redan
bekräftad åtgärd skrivs inte igen. Närvaropatchar ändrar bara uttryckligen
bedömda personer; andra personers okända närvaro och kallelsesvar bevaras.

## Konfiguration

Allt är avstängt från början. Hemligheter hör till serverns säkra miljö,
aldrig frontend-config, källkod, chatten eller loggarna.

| Variabel | Användning |
| --- | --- |
| `FORENA_ASSISTANT_ENABLED` | Aktivera modelladapter efter kontrollerat prov. |
| `AI_GATEWAY_MODEL` | Explicit modell-ID från aktuell Gateway-katalog. Ingen inbyggd modellgissning. |
| `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` | Gateway-autentisering i respektive runtime. |
| `FORENA_TELEGRAM_ENABLED` | Kontokoppling och verifierad webhook. |
| `FORENA_TELEGRAM_BOT_TOKEN` | Separat bots serverhemlighet. |
| `FORENA_TELEGRAM_BOT_USERNAME` | Botens namn utan `@`. |
| `FORENA_TELEGRAM_WEBHOOK_SECRET` | Separat slumpmässig hemlighet, 32–256 tillåtna tecken. |
| `FORENA_TELEGRAM_DELIVERY_ENABLED` | Privat kallelsetransport i notifieringskedjan. |
| `FORENA_TELEGRAM_VOICE_ENABLED` | Röstbehandling, avstängd tills retention verifierats. |
| `FORENA_TRANSCRIPTION_MODEL` | Explicit Gateway-transkriptionsmodell. |
| `FORENA_TRANSCRIPTION_RETENTION_VERIFIED` | Sätt först efter verifiering av vald leverantörs retention. |
| `FORENA_PUSH_ENABLED` | Push som nästa kanal efter Telegram. |
| `FORENA_VAPID_PUBLIC_KEY`, `FORENA_VAPID_PRIVATE_KEY`, `FORENA_VAPID_SUBJECT` | VAPID-konfiguration; bara publik nyckel lämnas till klienten. |
| `FORENA_WEB_ORIGIN` | Den nya appens kanoniska HTTPS-origin. |

Notifieringsarbetarens befintliga aktiveringsflagga, separata autentisering och
uttryckliga lista med testmottagare gäller fortfarande. Ordningen är Telegram,
push till aktiva enheter och därefter e-post. Faktisk kanal sparas i
`invitation_email.delivered_via`; tabellnamnet är ett kvarvarande internt namn
för det befintliga leveransjobbet. Ett osäkert Telegram-/pushförsök spelas inte
om som en ny transporteffekt. Ogiltiga push-endpoints inaktiveras vid 404/410.

Privata kallelser fryser aktuell aktivitets- och svarsrevision när mottagarbeslutet
skapas. En familj med två kallade barn får två separata meddelanden. Gamla
knappar kan inte skriva över en ändring från webben, överleva bortkoppling eller
återaktiveras genom återkoppling. Telegram 403 kopplar bort kontot och 429 ger
en beständig botgemensam transportpaus innan reservkanaler används.

## Tekniska gränser

- Fem frågor per minut och trettio per timme per konto; även misslyckade modellförsök förbrukar budget.
- Högst 4 000 tecken per fråga, 4 096 genererade token per modellförsök och begränsad kontext.
- Röster: svenska, högst 60 sekunder inklusive exakt 60, högst 5 MB tillfälligt ljud. Ingen egen beständig ljudkopia.
- Historik: högst 366 dagar och 200 detaljerade poster, med begränsningsflagga och separata exakta närvarosummeringar.
- Arbetsuppgiftsförslag: högst 100 uttryckligen valda aktiviteter, 1–50 platser per uppgift; befintligt namn hoppas över atomärt.
- Kopplingsbevis: 256 slumpbitar, enbart SHA-256 i databasen, tio minuter och engångsförbrukning.
- Privata grupper kräver Telegram-administratör och `roster.manage`; grupplänkar använder ansökan om inträde. Fri grupptext och gruppröst når inte assistenten.

## Aktivering och verifiering

1. Använd en separat testbot, kör migrationerna och driftsätt frontend/API tillsammans.
2. Konfigurera servervariablerna och låt noterade mottagargrindar vara kvar.
3. Kör `node scripts/configure-kotlin-telegram.mjs` i en säker miljö med den nya appens variabler.
4. Prova konto → Telegram Start → två privata kallelser → olika barns svar → återläst data.
5. Prova text/röst → granskning → uttrycklig knapp → återläst närvaro, med samtidiga ändringar, återkallad relation, ny dialog och bortkoppling.
6. Verifiera gruppadministration, inträdesansökan och att spelare/målsmän inte får ledarchattlänken.
7. Verifiera faktisk Gateway-routing, avsändare, klubbisolering, retention och leverans på iPhone PWA, Android och desktop.

Liveproven ovan kräver riktiga testuppgifter och är separata från automatiska
prov med syntetiska data. Ingen produktionsbot kopplas om av denna kodändring.
