import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { generateKeyPairSync } from 'node:crypto';
const base = new URL(process.env.FORENA_BROWSER_BASE_URL ?? 'http://localhost:3000');
assert.ok(base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname));
await mkdir('frontend/.evidence', { recursive: true });
const id='11111111-1111-4111-8111-111111111111';
const users=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const browser=await chromium.launch({...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),headless:true,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('FORENA_')))});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addCookies([{name:'_vercel_jwt',value:'synthetic-protection-cookie',url:base.origin}]);
await context.addInitScript(()=>{if(!sessionStorage.getItem('migration-seeded')){localStorage.setItem('forena-kotlin-browser-auth','{"access_token":"obsolete-private-token"}');sessionStorage.setItem('migration-seeded','true');}});
let current=null, revoked=false, platformDenied=false, sessionUnavailable=false, overviewUnavailable=false, sessionReads=0, requests=0, privateRequests=0, directProviderRequests=0, detailReads=0, answerUnavailable=false, holdAnswer=false, releaseAnswer;
let invitations=[{id,person_id:users[0],name:'Alex Exempel med ett längre familjenamn',response:'pending',response_comment:null},
 {id:'44444444-4444-4444-8444-444444444444',person_id:users[1],name:'Tilda Exempel',response:'pending',response_comment:null}];
const organization={id:'55555555-5555-4555-8555-555555555555',name:'Exempelföreningen med ett långt namn',time_zone:'Europe/Stockholm',role:'owner'};
const team={id:'66666666-6666-4666-8666-666666666666',organization_id:organization.id,name:'Ungdomslaget',roles:['guardian','leader','team_access']};
const activities=()=>[{id,title:'Träning med laget',starts_at:'2030-10-26T16:00:00Z',ends_at:'2030-10-26T17:30:00Z',gathering_at:null,response_due_at:null,location:'Örvallen',description:'Ta med vattenflaska.',status:'scheduled',organization,team,
 people:invitations.map(invitation=>({id:invitation.person_id,name:invitation.name,invitation}))},
 {id:users[1],title:'Nästa aktivitet',starts_at:'2030-10-27T16:00:00Z',ends_at:'2030-10-27T17:30:00Z',gathering_at:null,response_due_at:null,location:'Uip',description:'',status:'scheduled',organization,team,people:invitations.map(invitation=>({id:invitation.person_id,name:invitation.name,invitation:null}))}];
const view=()=>({user:{id:users[current],email:current===0?'family@example.invalid':'other@example.invalid'}});
await context.route('**/config.json',r=>r.fulfill({json:{supabaseUrl:'https://ckzrtxqjskosqzoitymc.supabase.co',publishableKey:'sb_publishable_synthetic',activityId:id,version:id}}));
await context.route('https://*.supabase.co/**',r=>{directProviderRequests++;return r.abort();});
await context.route('**/api/**',async route=>{
 requests++;const req=route.request();const headers=await req.allHeaders();const path=new URL(req.url()).pathname;
 assert.ok(headers.cookie?.includes('_vercel_jwt=synthetic-protection-cookie'));assert.equal(headers.authorization,undefined);
 if(req.method()!=='GET'){assert.equal(headers['x-forena-request'],'1');assert.equal(headers.origin,base.origin);}
 if(path==='/api/auth/login'){
  const body=req.postDataJSON();if(body.password!=='synthetic-password')return route.fulfill({status:401,json:{error:'Sessionen är inte aktiv.'}});
  current=body.email==='other@example.invalid'?1:0;revoked=false;
  return route.fulfill({headers:{'content-type':'application/json','set-cookie':'forena-local-session=synthetic-opaque-session; HttpOnly; SameSite=Lax; Path=/'},body:JSON.stringify(view())});
 }
 if(path==='/api/auth/logout'){current=null;return route.fulfill({headers:{'content-type':'application/json','set-cookie':'forena-local-session=; HttpOnly; Max-Age=0; Path=/'},body:'{"ok":true}'});}
 if(path==='/api/auth/passkey/options')return route.fulfill({json:{challenge_id:id,expires_at:Math.floor(Date.now()/1000)+300,options:{challenge:'c3ludGhldGlj',rpId:base.hostname,userVerification:'required'}}});
 if(path==='/api/auth/passkey/verify'){
  assert.equal(req.postDataJSON().challenge_id,id);assert.ok(req.postDataJSON().credential.response.signature);
  current=0;revoked=false;
  return route.fulfill({headers:{'content-type':'application/json','set-cookie':'forena-local-session=synthetic-passkey-session; HttpOnly; SameSite=Lax; Path=/'},body:JSON.stringify(view())});
 }
 if(path==='/api/auth/session'){sessionReads++;if(sessionUnavailable)return route.fulfill({status:503,json:{error:'Sessionen kan inte verifieras just nu.'}});}
 if(current===null||revoked)return route.fulfill({status:401,json:{error:'Sessionen är inte aktiv.'}});
 if(path==='/api/auth/session')return route.fulfill({json:view()});
 privateRequests++;
 assert.ok(headers.cookie?.includes('forena-local-session='));
 if(platformDenied)return route.fulfill({status:401,contentType:'text/html',body:'<html>Vercel Authentication</html>'});
 if(path==='/api/me/overview'){
  if(overviewUnavailable)return route.fulfill({status:503,json:{error:'Tillfälligt fel'}});
  return route.fulfill({json:{reference_time:'2030-10-20T00:00:00Z',activities:current===0?activities():[],organizations:current===0?[organization]:[],teams:current===0?[team]:[]}});
 }
 if(path===`/api/activities/${id}` || path===`/api/activities/${users[1]}`){
  if(current!==0)return route.fulfill({status:404,json:{error:'Aktiviteten är inte tillgänglig.'}});
  return route.fulfill({json:activities().find(activity=>path.endsWith(activity.id))});
 }
 if(req.method()==='PUT'){if(holdAnswer)await new Promise(resolve=>{releaseAnswer=resolve;});if(answerUnavailable)return route.fulfill({status:503,json:{error:'Tillfälligt skrivfel'}});const body=req.postDataJSON();invitations=invitations.map(i=>path===`/api/invitations/${i.id}/respond`?{...i,response:body.response,...(Object.hasOwn(body,'comment')?{response_comment:body.comment}:{})}:i);return route.fulfill({json:{ok:true}});}
 if(path.endsWith('/my-invitations'))detailReads++;
 return route.fulfill({json:{invitations:current===0?invitations:[]}});
});
const page=await context.newPage();const upcoming=page.locator('section[aria-labelledby="upcoming-activities-title"]');const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
try{
 await page.goto(base.href);
 await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();assert.equal(privateRequests,0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('forena-kotlin-browser-auth')),null);
 await page.evaluate(()=>{window.documentInstance='same-document';});
 await page.getByLabel('E-postadress',{exact:true}).fill('family@example.invalid');
 await page.getByLabel('Lösenord',{exact:true}).fill('wrong-password');
 await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');
 const beforeLoginReads=sessionReads;sessionUnavailable=true;
 await page.getByRole('button',{name:'Logga in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toBeVisible();
 await expect(upcoming.getByRole('button',{name:/Nästa aktivitet/})).toBeVisible();
 await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toHaveCount(1);
 // Invitations arrive in the overview response: no per-activity waterfall or navigation.
 assert.equal(detailReads,0);
 await expect(upcoming.getByText('Ingen kallelse ännu',{exact:true})).toHaveCount(2);
 const overviewAnswer=upcoming.getByRole('group',{name:'Kallelsesvar för Alex Exempel med ett längre familjenamn'});
 answerUnavailable=true;await overviewAnswer.getByRole('button',{name:/Kommer:/}).click();
 await expect(page.getByRole('alert')).toHaveText('Svaret kunde inte sparas. Försök igen.');
 await expect(overviewAnswer.getByRole('button',{name:/Kommer:/})).toHaveAttribute('aria-pressed','false');
 answerUnavailable=false;holdAnswer=true;await overviewAnswer.getByRole('button',{name:/Kommer:/}).click();
 for(const button of await page.getByRole('button',{name:/Kommer: Alex/}).all())await expect(button).toBeDisabled();
 await expect.poll(()=>typeof releaseAnswer).toBe('function');holdAnswer=false;releaseAnswer();
 await expect(overviewAnswer.getByRole('button',{name:/Kommer:/})).toHaveAttribute('aria-pressed','true');
 assert.equal(invitations[0].response,'accepted');assert.equal(invitations[1].response,'pending');assert.equal(page.url(),base.href);
 // A same-tab self-notification must not erase the accepted login.
 await page.waitForTimeout(200);assert.equal(sessionReads,beforeLoginReads);
 assert.equal(await page.evaluate(()=>window.documentInstance),'same-document');sessionUnavailable=false;
 const pendingSection=page.locator('section[aria-labelledby="pending-activities-title"]');
 await expect(pendingSection.locator('.badge')).toHaveText('1');await expect(upcoming.locator('.badge')).toHaveText('2');
 await expect(pendingSection.getByRole('button',{name:/Kommer: Alex/})).toHaveAttribute('aria-pressed','true');
 await expect(pendingSection.getByRole('button',{name:'Kommer: Tilda Exempel',exact:true})).toHaveAttribute('aria-pressed','false');
 await page.getByRole('button',{name:'Kalender',exact:true}).click();await expect(page.getByRole('heading',{name:'oktober 2030'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Träning med laget.*Exempelföreningen/})).toHaveCount(1);
 await page.getByRole('button',{name:'Agenda',exact:true}).click();
 await page.getByRole('link',{name:'Visa kallelser som behöver svar'}).click();await expect(page.getByRole('heading',{name:'Dina kallelser'})).toBeVisible();
 await page.getByRole('link',{name:'Till min översikt',exact:true}).click();
 await page.getByRole('link',{name:organization.name,exact:true}).click();await expect(page.getByRole('heading',{name:organization.name,exact:true,level:1})).toBeVisible();
 await page.getByRole('link',{name:'Till min översikt',exact:true}).click();
 await page.getByRole('link',{name:/Ungdomslaget.*Målsman/}).click();await expect(page.getByRole('heading',{name:'Ungdomslaget',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Till min översikt',exact:true}).click();
 // A legitimate activity without invitations still has readable details and named people.
 await upcoming.getByRole('button',{name:/Nästa aktivitet/}).click();await expect(page.getByRole('heading',{name:'Nästa aktivitet',exact:true})).toBeVisible();
 await expect(page.getByText(/Tilda Exempel/)).toBeVisible();await expect(page.locator('.personal-invitation-response')).toHaveCount(0);
 await page.getByRole('link',{name:'Till min översikt',exact:true}).click();
 const navigationReads=sessionReads;
 await page.evaluate(()=>{window.preservedHeader=document.querySelector('header');});
 await upcoming.getByRole('button',{name:/Träning med laget/}).focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(new URL(`/activities/${id}`,base).href);
 const row=page.locator('.personal-invitation-response').first();await expect(row).toHaveCount(1);
 await expect(row).toHaveCount(1);
 assert.equal(await page.evaluate(()=>window.documentInstance),'same-document');
 assert.ok(await page.evaluate(()=>window.preservedHeader===document.querySelector('header')));
 assert.equal(sessionReads,navigationReads);await expect(page.locator('main')).toBeFocused();
 await page.goBack();await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 await page.goForward();await expect(row).toHaveCount(1);
 await page.getByRole('link',{name:'Till min översikt',exact:true}).click();
 await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toBeVisible();
 // Header/menu links use the same router adapter as the activity list.
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();
 await page.getByRole('dialog').getByRole('link',{name:'Min översikt',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await upcoming.getByRole('button',{name:/Träning med laget/}).click();await expect(row).toHaveCount(1);
 assert.equal(await page.evaluate(()=>window.documentInstance),'same-document');
 assert.ok(await page.evaluate(()=>window.preservedHeader===document.querySelector('header')));
 assert.equal(sessionReads,navigationReads);
 assert.ok(!await page.evaluate(()=>document.cookie.includes('forena-local-session')));
 await row.getByLabel('Kommentar').fill('Hämtas senare');await row.getByRole('button',{name:'Kommer',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'har sparats'})).toBeVisible();assert.equal(invitations[0].response,'accepted');
 await page.reload();await expect(row.getByLabel('Kommentar')).toHaveValue('Hämtas senare');
 await page.goto(base.href);await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toBeVisible();
 await overviewAnswer.getByRole('button',{name:/Kan ej:/}).click();
 await expect(overviewAnswer.getByRole('button',{name:/Kan ej:/})).toHaveAttribute('aria-pressed','true');
 assert.equal(invitations[0].response_comment,'Hämtas senare');
 await page.reload();await expect(overviewAnswer.getByRole('button',{name:/Kan ej:/})).toHaveAttribute('aria-pressed','true');
 overviewUnavailable=true;await page.reload();await expect(page.getByRole('alert')).toBeVisible();
 overviewUnavailable=false;await page.getByRole('button',{name:'Försök igen',exact:true}).click();await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toBeVisible();
 for(const width of [320,375,390,768,1440]){
  await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const person=upcoming.locator('.personal-activity-person').first();
  const name=await person.locator('.overview-person-copy strong').boundingBox();
  await expect(person.locator('.overview-person-copy strong [aria-hidden]')).toHaveText('Alex');
  await expect(person.locator('.overview-person-copy strong .sr-only')).toHaveText(invitations[0].name);
  const buttons=await person.locator('.overview-response-actions button').all();
  for(const button of buttons){const box=await button.boundingBox();assert.ok(box.width>=44 && box.height>=44);assert.ok(box.x>=name.x+name.width-1);assert.ok(box.y<=name.y+name.height && box.y+box.height>=name.y);}
 }
 await page.screenshot({path:'frontend/.evidence/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'frontend/.evidence/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await expect(page.getByRole('dialog',{name:'Huvudmeny'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await upcoming.getByRole('button',{name:'Kommer: Tilda Exempel',exact:true}).click();
 await expect(page.locator('section[aria-labelledby="pending-activities-title"]').getByText('Alla aktuella kallelser är besvarade.',{exact:true})).toBeVisible();
 await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toHaveCount(1);await expect(upcoming.locator('.badge')).toHaveText('2');
 await page.reload();await expect(page.getByText('Alla aktuella kallelser är besvarade.',{exact:true})).toBeVisible();
 await page.goto(new URL(`/activities/${id}`,base).href);
 platformDenied=true;await page.reload();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('heading',{name:'Kallelser'})).toBeVisible();
 platformDenied=false;await page.reload();await expect(row).toHaveCount(1);
 revoked=true;await page.reload();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();await expect(row).toHaveCount(0);
 await page.getByLabel('E-postadress',{exact:true}).fill('other@example.invalid');await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('heading',{name:'Kallelser'})).toBeVisible();await expect(row).toHaveCount(0);
 await page.goto(base.href);await expect(page.getByText('Inga kommande aktiviteter i dina eller barnens lag.',{exact:true})).toBeVisible();await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toHaveCount(0);
 const secondTab=await context.newPage();await secondTab.goto(new URL(`/activities/${id}`,base).href);await expect(secondTab.getByRole('heading',{name:'Kallelser'})).toBeVisible();await page.bringToFront();
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Logga ut från Förena'}).click();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();
 await expect(secondTab.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();await secondTab.close();
 // Real browser WebAuthn call with a virtual discoverable credential; mocked provider verifies the wire contract only.
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:{credentialId:Buffer.from('synthetic-credential').toString('base64'),isResidentCredential:true,rpId:base.hostname,privateKey:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),userHandle:Buffer.from(users[0]).toString('base64'),signCount:0}});
 await page.evaluate(()=>{window.documentInstance='passkey-document';});
 await page.getByRole('button',{name:'Logga in med passkey'}).click();await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();await expect(upcoming.getByRole('button',{name:/Träning med laget/})).toBeVisible();
 assert.equal(await page.evaluate(()=>window.documentInstance),'passkey-document');
 assert.ok(!await page.evaluate(()=>document.cookie.includes('forena-local-session')));
 assert.equal(await page.evaluate(()=>localStorage.length),0);
 await page.goto(new URL('/components',base).href);await expect(page.getByRole('heading',{name:'Komponenter',exact:true})).toBeVisible();assert.deepEqual(errors,[]);assert.equal(directProviderRequests,0);
 const homeExample=page.getByRole('region',{name:'Min översikt – interaktivt exempel'});
 await expect(homeExample.locator('.overview-person-copy strong [aria-hidden]').filter({hasText:/^Johan E$/})).toHaveCount(3);
 await expect(homeExample.locator('.overview-person-copy strong [aria-hidden]').filter({hasText:/^Tilda$/})).toHaveCount(3);
 await expect(homeExample.locator('.overview-person-copy strong').filter({hasText:/^Alex Exempel$/})).toHaveCount(3);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});
 await homeExample.screenshot({path:'frontend/.evidence/compact-invitations.png'});
 await page.addStyleTag({content:'html { font-size:200% !important; } .overview-person-copy strong, .overview-person-copy > span, .overview-response-actions button { font-size:1rem !important; }'});
 for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});
 await page.reload();
 const galleryReads=sessionReads;
 await page.reload();await expect(page.getByRole('heading',{name:'Komponenter',exact:true})).toBeVisible();
 assert.equal(sessionReads,galleryReads);
 await page.evaluate(()=>{window.documentInstance='gallery-document';});
 await page.getByRole('link',{name:'Förena startsida',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 await expect.poll(()=>sessionReads).toBeGreaterThan(galleryReads);
 assert.equal(await page.evaluate(()=>window.documentInstance),'gallery-document');
 // Explicit login redirect also follows the router without starting a new document.
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Logga ut från Förena'}).click();
 await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();
 await page.goto(new URL(`/login?next=/activities/${id}`,base).href);
 await page.getByLabel('E-postadress',{exact:true}).fill('family@example.invalid');
 await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');
 await page.evaluate(()=>{window.documentInstance='redirect-document';});
 await page.getByRole('button',{name:'Logga in',exact:true}).click();
 await expect(page).toHaveURL(new URL(`/activities/${id}`,base).href);await expect(row).toHaveCount(1);
 assert.equal(await page.evaluate(()=>window.documentInstance),'redirect-document');
 assert.deepEqual(errors,[]);
 assert.ok(requests>0);console.log('PASS: overview invitations without per-activity reads; direct answers without navigation, isolated save failure, persisted answers and preserved comments; client navigation and persistent header without session refetch; back/forward, menu links and gallery-to-private session initialization; HttpOnly session, CSRF header, legacy cleanup, no browser/provider tokens, password and WebAuthn without reload, save/reload, revocation, account switch, logout, public gallery, complete overview counters, independent participant rows without invitations, synchronized sections and write locks, calendar, workspace links, responsive overview, retry, private-data isolation and keyboard menu');
}finally{await browser.close();}
