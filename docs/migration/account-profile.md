# Mitt konto i React/Kotlin

Kontoplatsen är `/account` (`/profile` är en kompatibel ingång). Menyn skiljer
Mitt konto från `/account/security`. Next behåller sin äldre Supabase-baserade
profil; dess markup, gemensamma formulär, sidskal och CSS är förlagan för de
nya delade komponenterna. `/components#account-example` visar samma
produktionskomponenter i båda apparna.

## Data och behörighet

Liquibase `api-029-account-profile` lägger till globalt namn/telefon,
klubbavgränsade kontaktuppgifter, revisioner, historik, uttryckliga barnlänkar,
vårdnadshavarförslag, följarförfrågningar och kontolivscykel. Inga personnummer
samlas in. Privata tabeller ärver runtime-rollen; klienterna får inga grants.

`AccountProfileService` sparar konto och berörda personposter i en transaktion.
Klienten skickar det granskade personurvalet och varje revision. Personrader
låses i UUID-ordning; relation, ålder, session och revision kontrolleras igen
efter låsväntan. Kontots egen profil påverkar endast egna personposter.
Barnposter sprids bara genom kontots uttryckliga sammankoppling och aktuell
vårdnadshavaråtkomst. En annan vårdnadshavare använder samma personrevisioner.
Klientutkast ligger endast i komponentens minne och försvinner vid kontobyte.

18-årsgränsen utvärderas med databasens väggklocka i klubbens tidszon.
`PersonAccessService` och mottagarurvalet för notiser filtrerar myndiga barn.
Äldre godkända relationer utan registrerat födelsedatum behåller sitt befintliga
beteende tills klubben eller en fortfarande behörig vårdnadshavare anger datum.
Efter förlorad åtkomst lämnas endast relationens namn och klubb för begäran om
följaråtkomst/rättelse; kontaktuppgifter och födelsedatum lämnas inte ut.

Klubbens personhistorik och vårdnadshavarförslag nås genom truppens befintliga
`roster.manage`-mandat, med samma klubb-/sektions-/lagavgränsning som övrig
medlemshantering. Födelsedatumsrättelse loggas och åldersregler räknas om direkt.
Ett förslag ändrar inte relationen innan klubben godkänner det.

Följaråtkomst läggs aldrig i `person_access`. Den myndiga godkänner en förfrågan
per klubb genom sitt verifierade konto. Förfrågningar gäller i 30 dagar.
Matchprojektionen innehåller endast lagets publicerade tävlingsaktiviteter,
tid och plats, oberoende av personlig kallelse, svar och faktisk närvaro.
Aktuell lagtillhörighet bestämmer urvalet. Inga personliga kallelser, kommentarer,
närvarouppgifter eller interna disciplinvärden ingår.

**Återstående resultatkälla:** resultatregistrering är uttryckligen undantagen i
[fotbollsspecen](../specs/fotboll.md). Matchkontraktet har ett nullable `result`,
men dagens källa saknar registrerade resultat. Gränssnittet säger ”Resultat ej
registrerat”. Koppling till en godkänd resultatkälla återstår; interna
matchanteckningar får inte användas som ersättning.

## Kontosäkerhet

Spring Security autentiserar lösenord och passkeys. Lösenords-/passkeyinloggning
och särskild lösenordsverifiering ger en kontobunden verifiering i fem minuter;
magic link gör det inte. Säkerhetskommandon och passkeyfiltren kontrollerar denna
verifiering, aktuell kontogeneration, session och ägare. Passkeyändringar delar
kontolåset med lösenordsbyte, e-postbyte och lösenordsåterställning.
Verifierat konto har fortsatt fungerande magic link/lösenord när sista passkeyn
tas bort. Kontaktuppgifter för barn ger aldrig kontroll över barnets inloggning.

E-postbyte använder ett HMAC-fingeravtryck, kontolås och en 30-minuterslänk
bunden till konto, generation och den begärande sessionen. Ny begäran ersätter
länken; avbrott och förbrukning tar bort den. Databasens unika e-postindex skyddar
även samtidiga försök mellan konton. Gamla adressen gäller till verifiering.
Efter bytet köas säkerhetsmeddelandet till gamla adressen i samma transaktion.
Leveransfel återställer inte bytet. Andra sessioner återkallas; aktuell session
får den nya generationen. Lösenordsåterställning ogiltigförklarar alla tidigare
sessioner genom generationen.

Sessionslistan visar endast giltiga generationer och ej återkallade sessioner.
Webbläsare/enhet hämtas från User-Agent och markeras som uppskattad/okänd.
Återkallning fungerar utan extra verifiering. En beständig återkallelse hindrar
ett samtidigt anrop från att återspara en borttagen session.

## Aktivering och kontolivscykel

Verifierad teknisk förregistrering tillåter kontohantering och acceptans av
inbjudan. Verksamhetsanrop kräver godkänd personkoppling, organisationsmedlemskap,
administratörsroll eller följaråtkomst; plattformsadministratören är undantagen.
En godkänd egen personkoppling är klubbkopplingen i den befintliga datamodellen;
lagmedlemskapet är separat. Att lämna ett lag bryter alltså inte ensamt en
fortfarande godkänd egen klubbkoppling. Befintliga ansökans-/inbjudningsflöden
äger godkännandet; denna implementation ersätter inte ansökningsspecen.

När sista kopplingen försvinner sparas tidpunkten och exakt `30 × 24 timmar`
till borttagning. Kända ålders-/rollslut använder sparad sluttid även när
arbetaren kör senare. Administratörsändringar, vårdnadshavargodkännande och
födelsedatumsändringar uppdaterar livscykeln i samma transaktion. Startmejl och
påminnelse efter 23 dygn ligger i den krypterade auth-mejlkön. Återförsök ändrar
inte tidsgränsen. Ny godkänd koppling stoppar borttagningen.

Borttagningen rensar native login, passkeys, browser-/OAuth-sessioner och
samtycken, engångslänkar, Telegram-koppling, privata assistentsamtal/minnen,
e-postbyteslänkar och pushhemligheter. En inaktiverad, tömd UUID-rad i `account`
behålls för klubbhistoriens främmande nycklar. Den ger ingen inloggning eller
återanvändning av rättigheter. Klubbpersoner, medlemskap och delad historik/minnen
behålls. Pushleveranshistorik behåller endast en inaktiverad prenumerationsrad
utan endpointnycklar. Ny registrering får nytt konto-ID.

### Arbetare och aktivering i drift

Den lokala schemaläggningen kör varje minut. Det befintliga, autentiserade
`POST /internal/notifications/run` driver också kontolivscykeln. Den nya
`POST /internal/notifications/accounts/run` driver både livscykel och auth-mejlkö
under själva HTTP-begäran, med befintlig notification-worker-autentisering.
Varje svep tar högst 100 konton och prioriterar borttagning/påminnelser och
kända slutdatum framför vanlig omläsning. Konton behandlas i separata
transaktioner, så ett tillfälligt databasfel inte stoppar resten av svepet.

En extern väckning måste anropa arbetaren återkommande i serverless-drift.
Detta arbete ändrar inga produktionshemligheter eller molnscheman och gör inga
produktionsraderingar. Exakt tidsgräns i data innebär inte att en avstängd
server kör arbete; driftens väckning och mejlleverans behöver aktiveras och
provas separat enligt den befintliga arbetarmodellen.

## Verifiering

- `AuthTest`: konto över två klubbar, isolerade barn, atomär rollback,
  revisionskonflikt, explicit länkning/uppbrytning, 18-årsgräns, klubbmandat,
  följaråtkomst, verifierade e-postlänkar, sessionshantering och kontoborttagning.
- `ArchitectureTest`: Modulith, lager och typkonventioner.
- `frontend/src/api.test.ts`: kontobunden, tillåten transport och nekade vägar.
- `scripts/migration/account-browser.mjs`: samma produktionskomponenter i Next
  och Vite på 390/1280 px, geometri, sparande, barnformulär/historik, bevarat
  utkast, tomt läge, laddning, fel och övergångstid.
- `scripts/migration/account-e2e.mjs`: verklig lokal browser → API → PostgreSQL,
  inklusive felaktig ny verifiering utan utloggning av giltig session.
- Fulla befintliga frontend-/backendkontroller samt kvarvarande driftprov
  redovisas i Mitt konto-specens implementationsmatris.
