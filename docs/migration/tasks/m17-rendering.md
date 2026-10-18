# M17: Avgör SSR och förgenerering före Vite

Status: planerad. Beroenden: M00. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Nuvarande publika klubb-/lagsidor serverrenderas och kan falla tillbaka till separat anonym klient. En SPA får inte tappa publik åtkomst eller indexerbart innehåll.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/app/o/[organizationSlug]/page.tsx, src/app/o/[organizationSlug]/t/[teamSlug]/page.tsx, src/data/general-workspace.ts, next.config.ts, docs/design-spec.md. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inventera publika rutter, metadata/OpenGraph, sitemap, canonical, dynamik, 404, sociala länkförhandsvisningar och sökbehov. Jämför Vite SPA, förgenerering och avgränsad SSR med mätbart innehåll, cacheinvalidering och hostingkostnad. Gör region/same-origin-prov med M08 om möjligt.

## Acceptanskriterier

ADR väljer renderingsstrategi med testbara krav och accepterad datafärskhet. Visa HTML utan JS, delningspreview, ändrad klubbinfo, 404 och att privat innehåll aldrig hamnar i publik cache.

## Verifiering

Representativ klubb/lag/okänd slug, inloggad och anonym; mobilnät/prestanda och verklig HTML. Dokumentera användar-/produktbeslut som saknas.

## Lämnas till senare

Ingen Next.js-avveckling eller repoombrytning innan renderingsbeslutet är verifierat.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
