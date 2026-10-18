# Inventering av befintlig implementation

Källkodsgranskning på `c379a96719490bc4edbfcb0a4ee7a1947684ddce`, 2026-10-18.
Ingen produktionsdatabas, dashboard eller leverantörsinställning har lästs.
”Finns” betyder implementation i repot; det betyder inte verifierad drift.

## Funktioner och transportvägar

| Område | Konkreta ingångar | Vad nästa uppgift ska bevara |
| --- | --- | --- |
| Klubb, sektion, lag och administratörer | `src/app/system/`, `src/app/section-team-administration-actions.ts`, `src/lib/section-team-administration.ts` | Plattformroll separat från klubbroller, explicita sektionsgränser, skyddad radering |
| Medlemsansökan och konto | `src/app/o/[organizationSlug]/join/actions.ts`, `src/lib/membership/verification.ts`, `src/app/api/membership-applications/[applicationId]/review/route.ts` | Verifiering, granskningsordning, begränsning av mejl, aktuella familjekopplingar |
| Familjens och lagets arbetsyta | `src/data/personal-dashboard.ts`, `src/data/team-dashboard.ts`, `src/data/general-workspace.ts` | Familjefilter utöver bredare ledarbehörighet, datumgiltighet, sidindelning, explicit publik fallback |
| Aktivitet, serie och tider | `src/app/api/activities/route.ts`, `src/app/api/activity-series/route.ts`, `src/lib/activity-series.ts`, `src/lib/activity-time-rules.ts` | Tidszoner, deltagare, historik, utkast/granskning, serieidentiteter |
| Kallelser, svar och närvaro | `src/app/api/invitations/[invitationId]/respond/route.ts`, `src/app/api/activities/[activityId]/attendance/route.ts`, `src/lib/invitation-availability.ts` | Egen/familj/lagåtkomst, inte före utskick eller efter avslut, kommentarens fältsemantik |
| Arbetspass | `src/lib/activity-duty-schedule.ts`, `src/lib/duty-fairness.ts`, `src/app/api/activities/[activityId]/duty-schedule/route.ts` | Platser, revisioner, låsta genomförda pass, bekräftade ändringsförslag, atomära batcher |
| Discipliner och signaler | `src/disciplines/`, `src/lib/disciplines/`, `src/lib/capability-signals.ts`, `supabase/functions/_shared/` | Versionerade paket, sektionsarv, begränsade jobb, deduplicerade notifieringar |
| Assistent och minne | `src/lib/ai/`, `src/app/api/ai/`, `docs/assistant-memory.md` | Samma serverkontroller, dataminimering, separat bekräftelse före skrivning |
| Publika sidor och PWA | `src/app/o/[organizationSlug]/page.tsx`, `src/app/o/[organizationSlug]/t/[teamSlug]/page.tsx`, `public/sw.js` | Serverrendering och publik fallback, inga privata offlinecacher, AppShell och komponentreferens |

En viktig skillnad mot målarkitekturen: det befintliga aktivitetsskapandet gör
flera Supabase-anrop för aktivitet, historik, kallelser och köläggning. Anta inte
att hela kommandot redan är atomärt. Att samla det i en skrivtransaktion är en
föreslagen förbättring som kräver egna tester i M09.

## Integrationer och autentisering

| Beroende | Verifierade filer | Flyttkonsekvens / obesvarat |
| --- | --- | --- |
| Supabase Auth | `src/app/login/actions.ts`, `src/app/auth/callback/route.ts`, `src/lib/supabase/` | Callback använder `claim_person_account`; bevara UUID och kontolivscykel |
| Inbyggda passkeys | `src/components/passkey-sign-in.tsx`, `src/components/passkey-enrollment.tsx` | Supabase-API används direkt. Lokal `[auth.passkey]`/WebAuthn är kommenterad; driftens RP-ID och origins okända |
| MCP OAuth | `src/lib/mcp/auth.ts`, `src/lib/mcp/oauth.ts`, `src/lib/mcp/consent.ts`, `src/lib/mcp/server.ts` | Bearer, `getClaims` + `getUser`, klient-/audiencevillkor vid OAuth-aktivering. Lokal OAuth-server avstängd; externa klientflödet inte driftverifierat |
| Resend | `src/lib/email/`, `supabase/functions/notification-worker/index.ts` | Även omedelbara administrations-/verifieringsmejl finns; inventera dem utöver outbox |
| Web Push | `src/app/api/push-subscriptions/route.ts`, `src/lib/push-subscription.ts`, `public/sw.js` | VAPID-nycklar, prenumerationsägarskap, invalidation 404/410, originbundna prenumerationer |
| Telegram | `src/app/api/telegram/`, `src/lib/telegram.ts`, `src/lib/telegram-assistant.ts`, `docs/telegram.md` | Samtycke + engångsbevis, hemlig webhookheader, privata svar och gruppkontroller, deduplicering |
| WhatsApp | `src/app/api/whatsapp/`, `src/lib/whatsapp.ts`, `docs/whatsapp.md` | Signerad ingress, Meta-mallar, snapshots och idempotenta barnsvar måste bevaras |
| AI Gateway / extern sökning | `src/lib/ai/`, `README.md` | Vercel OIDC och Perplexity-sökning är ytterligare flyttberoenden. Cloud Run kan inte antas få samma Vercel-identitet |
| Edge Functions och cron | `supabase/functions/scheduled-task-worker/index.ts`, `supabase/functions/notification-worker/index.ts`, `docs/scheduled-tasks.md` | Separata domän- och transportjobb; dagens återförsök/checkpoints kan inte bara tas bort |
| Storage / Realtime | `supabase/config.toml` | Aktiverade lokalt. Inga appanrop till Storage-buckets eller Realtime-prenumerationer hittades vid textsökning; drift och ej versionshanterade policies återstår att kontrollera |

Telegram-assistenten skapar i dag ett kortlivat Supabase-JWT för användarens RLS
med en särskild signeringshemlighet. Detta är verifierat befintligt beteende,
inte målarkitektur. Den nya monoliten ska använda en intern verifierad
användarkontext och undvika detta beroende enligt ADR-004.

Transportworkern försöker Telegram, WhatsApp, push och sedan e-post. Bevara
kanalernas faktiska fallback- och kvittensregler med testfall; anta inte att alla
kanaler får samma meddelande eller att transporten bara är Resend.

## Databasens säkerhets- och migreringsberoenden

98 SQL-migrationsfiler och 43 SQL-testfiler finns vid inventeringsbasen.
Lokal PostgreSQL-major är 17. Domänobjekt finns i `public`, privata köer och
regler även i `private`, `administration` och `messaging`.

[SQL-referenserna](sql-references.tsv) är en statisk sökinventering med fil och
matchande radnummer grupperade per kategori för deklarationer och Supabase-beroenden. Den beskriver migrationshistorik,
inklusive ersatta/droppade objekt, inte den slutliga databasens katalog. M04
måste återskapa databasen och exportera effektiva policies, funktioner, triggers,
grants och cronjobb innan de får markeras som översatta.

| Beroende | Exempel att börja med | Krav vid flytt |
| --- | --- | --- |
| `auth.users`, auth-trigger och kontoanspråk | `supabase/migrations/`, `src/app/auth/callback/route.ts` | Bevara UUID, borttagning/blockering och kontokoppling; ersätt extern FK |
| `auth.uid()`, JWT-kontext, RLS/grants | `20260930223000_team_access_permissions.sql`, `supabase/tests/team_access_permissions_test.sql` | Översätt roller, permissions och giltighetsdatum; kör negativa tenant/familjeprov |
| `SECURITY DEFINER` och privata RPC:er | `20261013063846_section_team_administration.sql` | Kartlägg anropare, EXECUTE, search_path och explicita auth-kontroller |
| Svar, historik och signalhändelser | `20260923211000_activity_events.sql`, `20261008183546_capability_signals.sql`, `20261011231144_lock_completed_invitation_responses.sql` | Samma transaktion/lås och exakt en producent för varje sidoeffekt |
| Pass och atomära batcher | `supabase/tests/activity_duty_slots_test.sql`, `supabase/tests/activity_duty_batch_test.sql` | Konflikttest för sista plats, revisionsvillkor och upprepade kommandon |
| Schemaläggning och transport | `20261008093333_separate_scheduled_tasks_from_outbox.sql`, `docs/scheduled-tasks.md` | Skilj domänbeslut, färdig payload, leveransförsök och revisionshistorik |
| pg_cron, pg_net och Vault | migrationsfilerna och SQL-referenserna | Scheduler/Jobs + tjänstekonto/Secrets ersätter beroendena; kartlägg alla jobb inklusive retention |
| Storage policies | konfiguration + avsedd miljös katalog i M04 | Inget hittat är inte bevis för att driftens buckets saknar data/policies |

Testmatrisen i M04 ska per regel ange: källobjekt, tillåtna/nekade roller,
organisation/sektion/lag/familj, målmodul, målimplementation, test och status.
Driftens inventering ska ske med uttryckligen avsedd läsbehörighet och utan
export av persondata eller hemligheter till dokumentationen.

## Befintliga tester och CI

131 TS/TSX-testfiler hittades under `src/`. Vitest testar rena regler, komponent-
rendering och HTTP-/MCP-adaptrar; flera beroenden mockas. En fil som heter
`integration.test.ts` är inte i sig bevis för en verklig extern integration.
43 SQL-filer använder Supabase/pgTAP för bland annat RLS, familjeisolering,
livscykel, bemanning, Telegram/WhatsApp och cronköer. Inga Playwright-/Cypress-
konfigurationer hittades. Inget av detta har körts om för dokumentationsändringen.

`.github/workflows/ci.yml` kör appjobb (`npm ci`, test, typecheck, lint, build)
och separat databasjobb (CLI 2.118.0, `supabase db start`, `supabase test db`,
typgenerering). `verify` kräver båda. Den genererade typfilen kontrolleras som
icke-tom, inte för identitet med den incheckade filen.

`.github/workflows/deploy-production.yml` migrerar Supabase, publicerar båda
arbetarna och bygger/driftsätter Vercel från verifierad commit. README beskriver
fortfarande även automatisk Git-integration som inte väntar på migrationerna.
Vilka automatiska Vercel-triggers som faktiskt är aktiva kan inte avgöras från
repot. M08 ska kartlägga dessa och ge exakt en samordnad releaseväg.

## Ej verifierat i denna leverans

Driftens schemaavvikelser, användarvolymer, region, JWT-signering, RP-ID,
OAuth-klienter/grants, faktisk kanalaktivering, backups, SLO, trafik och kostnader
är okända. Ingen dataexport, produktionsändring eller molnprovisionering har gjorts.
