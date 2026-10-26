# Förena React/Vite

Den nya appen använder Spring-autentisering som enda auth-lösning.
Backend äger konton, sessioner och behörigheter. Supabase som databasleverantör
är oberoende av detta; den äldre Next-appen behåller sin autentisering.

Kör `npm ci` från reporoten, starta sedan backend enligt
[local-guiden](../backend/README.md#lokal-utveckling). I `frontend/`:

```sh
npm run dev
```

Öppna `http://localhost:3000`. Ingen `.env` eller manuell configgenerering behövs.
Vite proxar API, OAuth och metadata till `127.0.0.1:8080` med browserns Origin
bevarad. Backend kräver exakt samma origin. `npm run build` skapar statiska
filer i `dist/` och en strikt tillåten publik config med versions-ID och valfritt
provaktivitets-ID. Den innehåller inga auth-, databas- eller mejlcredentials.

Registrering, e-postverifiering, lösenord, passkeys, magic links, återställning,
logout och OAuth-consent använder [Springs flöden](../docs/migration/authentication.md).
Klienten följer Springs formulär-/WebAuthn-format. Endast ett ogenomskinligt
sessions-ID finns i HttpOnly-cookie; inga auth-token sparas i JavaScript-lagring.
Callback-URL rensas före bekräftelse. Gamla pilotens browserlagring rensas vid start.

React Router, sidskal, header, meny, sidfot, design-token, översikt och kallelsesvar
återanvänder produktionskomponenter från `src/`. `/components` visar samma
komponenter med lokala data. Delade komponenter använder vanliga ankare som
standard så att Next-appen fortsätter fungera.

Sessionen kontrolleras vid start, fokus och kontoändring. `BroadcastChannel`
skickar inga privata payloads. API använder same-origin credentials, no-store,
nekade redirects och `X-Forena-Request`. Skrivningar binds till visat konto med
`X-Forena-Account`. Endast ett uttryckligt app-401 avmonterar privata data;
plattformens 401 eller tillfälligt verifieringsfel upphäver inte sessionen.

Från reporoten körs `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build` (Next) och `npm run frontend:build` (Vite). CI kör både kontrollerade
browserprov för navigation/kontoisolering och riktiga Spring-/PostgreSQL-flöden
med virtuell WebAuthn. Se backendguiden för JVM respektive GraalVM/AOT.

## Next är den visuella förlagan

Båda apparna importerar `src/app/ui-styles.css`. Lägg gemensamma stilmallar där
i Next-appens ordning. Meny, systemöversikt, klubb-/sektionsformulär och
aktivitetsdialoger använder samma produktionskomponenter i `src/components`.
Återskapa inte funktionerna som enklare pilotsidor.

Systemadministration börjar på `/system`, med separata sidor för Klubbar och
Administratörer. Klubb-/sektionsadministratörer behåller `/administration` och
öppnar lag via Hantera lag. Kataloger och assistentminnen är inte flyttade ännu.

Kör Next på port 3004 och Vite på port 3005 och jämför dem från reporoten:

```sh
node scripts/migration/ui-parity-browser.mjs
node scripts/migration/administration-navigation-browser.mjs
```

Origin kan anges med `FORENA_PARITY_NEXT`, `FORENA_PARITY_VITE` respektive
`FORENA_NAVIGATION_FRONTEND`; endast lokala adresser accepteras. CI kör proven
mot produktionsbyggen och sparar jämförelsebilder i en separat artefakt.

## Truppen

Öppna laget från Min översikt och välj **Truppen**, eller navigera till
`/teams/{id}/members`. Länk och menyalternativ kräver serververifierad
`roster.manage`. Där finns sökbar medlemslista, gruppfilter, medlemsprofiler,
uttrycklig namnredigering och undergrupper med två personlistor (växling på
telefon). Sparande sker genom Kotlin; ett sparfel behåller utkastet.
`/components` visar samma komponenter med lokala syntetiska uppgifter.
Next-appens e-postinbjudningar och profilens disciplinfält återstår i Kotlin.
