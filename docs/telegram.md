# Telegram-bot: prototyp för issue 91

Telegram är ett valbart försök med privata kallelser och två separata grupproller.
WhatsApp, push och e-post finns kvar. Kanalen är avstängd från början.

## Privata chattar med spelare och vårdnadshavare

Öppna Min profil → Telegram, lämna samtycke, öppna länken och tryck **Start** i
Telegram. Länken gäller tio minuter och får inte delas. Återvänd till profilen
och kontrollera status. Kontot måste ha verifierad e-post. Ett Telegram-konto kan
inte överföras från ett annat Förena-konto utan att först kopplas bort där.

Varje kallad person får ett eget meddelande. Vårdnadshavare med två kallade barn
får två kallelser med **Kommer**, **Kan inte** och **Öppna Förena**. Spelare med
eget kopplat konto svarar på sin egen kallelse. Knapptryck bevarar kommentarer,
skriver det ordinarie kallelsesvaret och uppdaterar meddelandet med en bekräftelse.
Kommentarer skrivs i Förena. Fritext tolkas inte av boten. Om svaret ändras i appen
blir tidigare Telegram-knappar inaktuella; fortsätt i appen eller använd en ny
kallelse. Telegrams callback har ingen egen tidpunkt, så detta skyddar mot
fördröjda knapptryck som annars kunde skriva över appsvaret.

Avsluta med **Stäng av Telegram**, `/stop` i privat chat eller blockera boten.
Avstängning förbrukar väntande bevis, raderar gamla knappkopplingar och tar bort
grupper som kontot har kopplat. Nya kallelser kan levereras efter en ny koppling;
gamla knappar återaktiveras inte.

## Lagchatt och ledarchatt

En ledare med `roster.manage` kopplar först sin privata Telegram-chatt och väljer
sedan lag samt **Lagchatt** eller **Ledarchatt** i profilen. Bekräfta att du får
administrera gruppen, öppna länken och välj rätt Telegram-grupp. Lägg till boten
som administratör; den rollen behövs för Telegrams kontroll av användarens
administratörsstatus. Den som använder länken måste vara samma kopplade ledare.
Anonyma administratörer kan inte koppla en grupp. Kopplingen gäller ett lag
och en roll, och ersätter inte en redan kopplad grupp. Koppla bort den gamla först.

Kopplade gruppmedlemmar kan använda `/forena` eller `/forena@BotensNamn` för en
länk till lagets vy. Även ledarchatten öppnar den vanliga lagvyn; appen visar
ledarverktyg efter inloggning och behörighetskontroll. Gruppen får inga namn,
kallelsesvar eller privata påminnelser. Denna första version omfattar navigering
i grupper, inte automatiska grupputskick, fri assistentdialog eller gruppbaserade
kallelsesvar. Telegrams medlemslista ger ingen Förena-behörighet. Om ledaren
förlorar behörigheten eller kopplar bort sitt konto upphör gruppintegrationen.
Ta bort boten eller välj **Koppla bort eller avbryt** i profilen för att avsluta.
En uppgradering från grupp till supergrupp kräver en ny koppling.

## Installation och hemligheter

1. Skapa en separat testbot hos `@BotFather`. Aktivera gruppstöd. Låt privacy mode
   vara på; implementationen behandlar bara exakta kommandon och svarsknappar.
2. Ange servervariabler i webbappen: `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_BOT_USERNAME` (utan `@`), `TELEGRAM_WEBHOOK_SECRET` (32–256 slumptecken
   ur A–Z, a–z, 0–9, `_`, `-`) och `SITE_URL` (kanonisk HTTPS-origin).
3. Ange `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN` och samma `SITE_URL` som secrets
   för Supabase `notification-worker`. Prefixa aldrig med `NEXT_PUBLIC_`.
4. Applicera repots migrationer, inklusive `20261016175439_telegram_bot.sql` och
   `20261016182313_scope_telegram_invitation_recipients.sql`, i testmiljön och
   publicera webbapp och worker. Aktivera kanalen där för testet.
5. Med variablerna i din säkra servermiljö, kör
   `node scripts/configure-telegram-webhook.mjs`. Scriptet verifierar botens
   användarnamn, sätter kommandon och registrerar `/api/telegram/webhook` med
   hemlig header, fyra samtidiga anslutningar samt `message`, `callback_query`
   och `my_chat_member`. Väntande uppdateringar kastas inte bort.
6. Kör testprotokollet nedan. Aktivera produktionsflaggan först efter godkänd pilot.

Använd separat bot/token för varje miljö: en bot kan bara ha en webhook.
Token förekommer i Telegrams API-URL; undvik URL-loggning i proxy/APM. Rotera
token och webhookhemlighet vid misstänkt exponering. Kopplings- och kvittensbevis
rensas i begränsade timbatcher efter ett dygn; snapshots följer outboxens retention.

## Leverans och fel

Ordning för aktiverade kanaler: Telegram → WhatsApp → push → e-post. En lyckad
Telegram-leverans hoppar över övriga kanaler. Ett misslyckat anrop stoppar inte
reservkanalerna. Vid partiell barnleverans kan även en reservnotis skickas.
Lyckade barnmeddelanden sparas var för sig och återanvänds vid ett återförsök.
API-accept följt av avbrott före databaskvittens kan ge en transportdubblett;
kallelsesvaret är ändå idempotent. `sent` betyder API-accept, inte läskvitto.

Workern sprider meddelanden till samma privata chat inom en batch. Telegram 429
sparar `retry_after` som en botgemensam paus även för kommande körningar. Under
pausen används reservkanalerna; Telegram får inget separat omskick om en reserv
lyckas. Samtidiga worker-körningar kan fortfarande nå gränsen, och hanteras på
samma sätt. 403 kopplar bort kontot. Blockering och borttagning av boten hanteras
även via `my_chat_member`. Fel i direkta hjälpsvar och gruppsvar köas inte om.
Bekräftelser efter sparade svar är ett direkt försök; ett nätverksfel eller en
dubblett kan lämna meddelandet utan ny bekräftelsetext. Svaret finns då i Förena.

## Testprotokoll och status

Automatiska tester använder syntetiska konton och testdubblar för Telegram.
Databastester omfattar två barn, eget spelarkonto, koppling/bortkoppling,
främmande avsändare, återleverans, ändrad aktivitet, förfallen svarstid,
återkallad vårdnadshavare, separata grupper, återkallad lagbehörighet,
transportpaus och blockering.

**Live-test med riktig testbot är inte utfört:** ingen Telegram-token har
tillhandahållits. Följande ska journalföras innan issue 91 kan stängas:

- Koppla ett testkonto med två syntetiska barn och skicka en kallelse/påminnelse.
- Kontrollera två meddelanden, svara olika för barnen, ändra ett svar och jämför
  `invitations` i Förena. Kontrollera bekräftelsetext och aktivitetslänk.
- Återleverera samma webhook och tryck snabbt flera gånger. Ta bort
  målsmanskopplingen, ändra/ställ in aktiviteten och prova utgångna knappar.
- Testa lag- och ledargrupp, annan Telegram-administratör, annan förening,
  borttagen lagbehörighet och återanvänd gruppkod. Kontrollera att grupper
  aldrig får barnens kallelser eller svar.
- Testa `/stop`, profilens avstängning, blockering, återanslutning och gamla
  knappar. Simulera 429/403 och kontrollera reservnotis samt leveranshistorik.
- Anteckna installationstid, missade steg och behov av hjälp för pilotfamiljer.

## Utvärdering och rekommendation

Teknisk bedömning 2026-10-16: färre leverantörssteg än WhatsApps mallflöde,
men familjer behöver Telegram och måste själva starta boten. Den faktiska
installationsfriktionen är ännu inte mätt i en pilot. Gruppkoppling har fler
steg eftersom både Förena-behörighet och Telegram-administratör krävs.

Enligt [Telegrams officiella FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)
kostar vanliga botutskick inget, med riktvärden omkring ett meddelande/sekund
per chat, 20/minut per grupp och 30/sekund totalt. Betalda massutskick är ett
separat tillval; prototypen aktiverar dem inte. Drift och support kan fortfarande
kosta. Kontrollera aktuella villkor före produktionsbeslut.
[Bot API-dokumentationen](https://core.telegram.org/bots/api#setwebhook)
beskriver webhookens hemliga header, återförsök och callback-funktionerna.

Rekommendation: behåll Telegram som frivilligt pilotval. Ersätt inte WhatsApp
och flytta inte befintliga användare innan liveflödet och en familjepilot har
godkänts. Följ upp anslutningsgrad, faktisk svarsfrekvens, leveransfel,
reservnotiser och supportbehov. Underlaget här är tekniskt, inte ett resultat
från en genomförd användarutvärdering.
