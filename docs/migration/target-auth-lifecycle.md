# Ren målmiljö och Auth-livscykel

Status 2026-10-19: bootstrap verifierad i `forena-kotlin`; Auth-adapter och
lokala tester implementerade. Verkligt Auth-adminanrop har körts men nekats
med **401 `no_authorization`**: `FORENA_TEST_AUTH_SECRET_KEY` innehåller en
publishable key, inte en adminnyckel. Verklig inloggning och moln-JDBC är **inte körda**.
Detta fortsätter M02/M03, inte godkänd driftaktivering eller hela M07.

## Fortsättning från PR #113

På branch `feat/target-auth-lifecycle`, källcommit `291b95c`, är projektets
HTTPS-adress nåbar. Både adminanrop med nyckeln enbart i `apikey` och det äldre
provets dubbla headers gav 401 `no_authorization`. Nyckelvärdet har inte loggats.
Körmiljöns status rapporterar ingen verifierad credential-readiness. Uppdatera
`FORENA_TEST_AUTH_SECRET_KEY` i miljökonfigurationen till testprojektets
`sb_secret_…`; lägg aldrig nyckeln i chatten eller Git.

Oberoende SQL-läsning bekräftar noll syntetiska Auth-provkonton och noll tabeller
i `forena`. Båda rollerna är fortsatt NOLOGIN utan superuser/BYPASSRLS.
Bootstrap har inte körts igen. JDBC-URL och båda rollernas credentials saknas;
exekverarens nätpolicy har inga TCP-grants. Fullt `TargetAuthIT` kräver därför
fortfarande credential-/nätkonfiguration och separat Liquibase-release.
Se [det blockerade körförsöket](evidence/target-auth-attempt.json).

Ett separat [Auth-prov utan databas](../../backend/api/scripts/target-auth-probe.py)
kan köras först, med Python 3 och `cryptography` tillgängligt:

```sh
FORENA_TEST_TARGET_REF=ckzrtxqjskosqzoitymc python3 backend/api/scripts/target-auth-probe.py
```

Det använder bara testprojektets Auth-API och nya syntetiska konton utan utskick.
Det verifierar JWT-signaturen mot riktiga JWKS samt issuer/audience/claims,
refresh, tidigare JWT och refresh efter lokal/global logout, annan kvarvarande
session, ny inloggning, spärr/återöppning och soft delete. En hard delete och
efterföljande 404 bekräftar städning. Publishable key i adminvariabeln nekas
före nätanrop; okända opaka nätsecret-placeholders lämnas åt miljöns proxy.
API-nycklar skickas i `apikey`, bearer-header används endast för användar-JWT.
Redirect följs inte och TLS-verifiering behålls.

Resultatet skrivs till `backend/api/target/target-auth-provider-results.json`
först efter avslutade prov och bekräftad städning. Filen har scope
`auth-provider-only`; den kan aldrig ersätta resultatet från `TargetAuthIT`.
Utebliven fil eller `passed: false` är inte ett godkänt prov. Inte heller
ett godkänt Auth-prov bevisar familjeåtkomst eller nekade databasändringar.

## Avsedd miljö och utförd bootstrap

- Projekt: `forena-kotlin`, `ckzrtxqjskosqzoitymc`, eu-central-1.
- Privat nytt schema `forena`, ägare `forena_api_owner`.
- Ägare och `forena_api_runtime` är separata, **NOLOGIN**, utan superuser,
  BYPASSRLS, CREATEDB eller CREATEROLE. Inga lösenord har satts.
- Runtime är inte medlem i ägarrollen. `anon`, `authenticated` och `service_role`
  saknar schemaåtkomst. Supabases säkerhetsrådgivare gav inga anmärkningar.
- Schemat är tomt: Liquibase, konton och verksamhetsdata återstår. Teknikprovets
  scheman finns kvar separat. Gamla Förena-projektet ändras inte.

[Bootstrap](../../backend/api/scripts/bootstrap.sql) kördes genom Supabases
administrativa bootstrap-migration `forena_api_bootstrap`. Den äger bara
roller/schema, inga verksamhetstabeller. Liquibase äger verksamhetsobjekt och
sin egen historik. Begränsad CREATEROLE kräver tillfällig SET-rätt för
schemaägartilldelningen; scriptet stänger därefter av SET/INHERIT igen.
Runtime får aldrig sådant medlemskap. Verifierad observation och källhashar
finns i [readiness-underlaget](evidence/target-auth-readiness.json).

## Aktuell sessionskontroll

API:t verifierar JWT lokalt med oförändrade krav på signatur, issuer, audience,
kanal och claims. Lokal konto-/sessionsspärr kontrolleras som tidigare.
`SupabaseSessionService` anropar därefter samma issuers `GET /user` med aktuell
verifierad bearer-token och projektets **publishable key**. Leverantörssvaret
måste avse samma konto och en icke-anonym användare. Metadata ger inga rättigheter.

Varje verksamhetsläsning kontrollerar aktuell Auth-status. Skrivningar gör det
före verksamhetsåtkomst och efter aktivitetens/kallelsens radlås. Ett avslut som
blivit synligt under låsväntan kan därmed stoppa den väntande skrivningen.
Det finns ingen gemensam transaktion med Auth: revokering efter sista kontrollen
kan inte återkalla ett redan pågående eller committat kommando.

Kända 401/403-koder för ogiltig token, saknad session/användare, spärr och utgången
session ger lokal 401. Tekniska fel, felaktig konfiguration, 429, 5xx, redirect,
felaktig JSON och timeout ger generiskt 503 med `Cache-Control: no-store`.
Ingen retry, positiv sessionscache eller fallback används. Anslutnings- och
lästimeout är två sekunder vardera, ingen totaldeadline. Redirect följs inte.

Bearer-tokenen finns bara i anropets aktör, utan genererad `toString`, och sparas
inte i historik. Runtime behöver varken Auth-adminnyckel, service-role,
Auth-tabellgrants, databasfunktioner eller ändrad Auth-RLS. Leverantörens
timebox/inaktivitets-/single-session-inställningar antas inte verkställas
proaktivt av `/user`; de behöver verifieras separat tillsammans med refresh.

Nuvarande offentliga Auth-källa laddar konto och `session_id` för `/user` och
nekar saknade sessioner/spärrade konton. **Det bevisar inte vilken revision det
driftade projektet kör.** Verkligt målmiljöprov blockerar därför pilot:

- [Auth-kontroll](https://github.com/supabase/auth/blob/master/internal/api/auth.go)
- [UserGet](https://github.com/supabase/auth/blob/master/internal/api/user.go)
- [Felkontrakt](https://github.com/supabase/auth/blob/master/internal/api/apierrors/apierrors.go)
- [Supabases sessionsdokumentation](https://supabase.com/docs/guides/auth/sessions)

Changelog-indexet kunde inte läsas som Markdown av webbverktyget;
[HTML-indexet](https://supabase.com/changelog) kontrollerades i stället. Dess
aviserade HTTP/TLS-ändring kräver moderna TLS-klienter; TLS-verifiering behålls.

## Färdigställ credentials och migrering

Publika issuer/JWKS/key-värden finns i
[exempelkonfigurationen](../../backend/api/.env.target.example).
Det nya obligatoriska runtime-värdet är `FORENA_AUTH_PUBLISHABLE_KEY`.

1. Sätt separata starka rollösenord genom administrativ credentialhantering.
   En administrativ `psql`-session kan använda `\password forena_api_owner`
   respektive `\password forena_api_runtime` utan klartextlösenord i shellargument.
   Aktivera därefter LOGIN för respektive roll. Ägarkontot används endast för
   release/migrering och testfixturering.
2. Hämta den faktiska JDBC-kompatibla session-pooler-adressen från projektets
   Connect-panel. Verifiera `sslmode=verify-full`, betrodd CA och poolerns
   rollnamn med projektsuffix. Hostnamn/credentials gissas inte från regionen.
   Körmiljön behöver godkänd TCP-åtkomst till adressen; Auth-HTTPS ger inte JDBC-åtkomst.
3. Kör paketerad migrering enligt [API-README](../../backend/api/README.md).
   Kör igen och kontrollera att fem Liquibase-steg är oförändrade. Ingen
   Supabase-migration ska skapa/modifiera verksamhetstabellerna.
4. Kör Auth-/API-provet nedan. Ingen import av gamla testdata behövs. Provet
   städar sina fixturer; det lämnar inte en permanent demo-inloggning.
   Beständiga frontend-testdata behöver en dokumenterad seed när ID-läsningen kopplas in.

## Verkligt Auth-/API-prov

`TargetAuthIT` är opt-in och körs inte av ordinarie Maven `verify` eller CI med
admincredentials. Det kompileras med vanliga testkällor. Provet låser projektref
och ägar-/runtimerollnamn, kräver TLS-hostname-verifiering och skapar nya slumpade
syntetiska UUID:n/adresser under `example.invalid`. Auth-admin create/ban/delete
används bara av provprocessen. Inga mejl skickas.

Konfigurera följande i testkörmiljön; lägg inte credentials i chatten, Git eller
kommandoradsargument:

| Namn | Värde/ändamål |
| --- | --- |
| `FORENA_TEST_TARGET_REF` | `ckzrtxqjskosqzoitymc` |
| `FORENA_TEST_AUTH_SECRET_KEY` | Testprojektets `sb_secret_…`, network secret för `ckzrtxqjskosqzoitymc.supabase.co` |
| `FORENA_TEST_PUBLISHABLE_KEY` | Publishable key från exempelkonfigurationen |
| `FORENA_TEST_JDBC_URL` | Verifierad JDBC-URL med TLS/CA, utan lösenord |
| `FORENA_TEST_OWNER_USERNAME` | `forena_api_owner.<projektref>` för session-pooler |
| `FORENA_TEST_OWNER_PASSWORD` | Ägarrollens lösenord som skyddad direkt variabel |
| `FORENA_TEST_RUNTIME_USERNAME` | `forena_api_runtime.<projektref>` för session-pooler |
| `FORENA_TEST_RUNTIME_PASSWORD` | Runtimerollens lösenord som skyddad direkt variabel |

Med låst JDK och Maven Wrapper:

```sh
backend/mvnw -f backend/api/pom.xml --batch-mode --no-transfer-progress -Dtest=TargetAuthIT test
```

En miljö med HTTP-proxy behöver normal Java-proxy-/CA-konfiguration också för
Spring/Nimbus. Behåll miljöns proxy och certifikatverifiering. Network secrets
är placeholders som proxyn byter mot credential för rätt HTTPS-destination;
databaslösenord behöver däremot vara direkt läsbara av JDBC.

Provet omfattar riktig lösenordsinloggning/signatur, familjeavgränsning, refresh,
lokal utloggning (annan session kvar), global utloggning, ny inloggning, spärr och
soft delete. Tidigare JWT provas mot läsning och skrivning. Nekade kommandon får
inte skapa historik. Fixturer och Auth-konton städas i `finally`; endast efter
godkänd kontroll **och** städning skrivs
`backend/api/target/target-auth-results.json`, utan tokens/lösenord.
Vid avbruten process kan fixturer kräva avgränsad städning, aldrig generell DELETE.

Mejlleverans/magic-link, browser-PKCE, passkeys, OAuth/MCP, full signalworker och
Vercel-runtime är separata, ej verifierade grindar. Avsaknad av resultatfil eller
enbart gröna lokala tester räknas inte som godkänt målmiljöprov.
