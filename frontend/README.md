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
