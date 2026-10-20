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
let current=null, revoked=false, platformDenied=false, requests=0, privateRequests=0, directProviderRequests=0;
let invitations=[{id,person_id:users[0],name:'Alex Exempel med ett längre familjenamn',response:'pending',response_comment:null}];
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
 if(current===null||revoked)return route.fulfill({status:401,json:{error:'Sessionen är inte aktiv.'}});
 if(path==='/api/auth/session')return route.fulfill({json:view()});
 privateRequests++;
 assert.ok(headers.cookie?.includes('forena-local-session='));
 if(platformDenied)return route.fulfill({status:401,contentType:'text/html',body:'<html>Vercel Authentication</html>'});
 if(req.method()==='PUT'){const body=req.postDataJSON();invitations=invitations.map(i=>({...i,response:body.response,response_comment:body.comment}));return route.fulfill({json:{ok:true}});}
 return route.fulfill({json:{invitations:current===0?invitations:[]}});
});
const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
try{
 await page.goto(new URL(`/activities/${id}`,base).href);
 await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();assert.equal(privateRequests,0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('forena-kotlin-browser-auth')),null);
 await page.evaluate(()=>{window.documentInstance='same-document';});
 await page.getByLabel('E-postadress',{exact:true}).fill('family@example.invalid');
 await page.getByLabel('Lösenord',{exact:true}).fill('wrong-password');
 await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'Logga in',exact:true}).click();
 const row=page.locator('.personal-invitation-response');await expect(row).toHaveCount(1);
 assert.equal(await page.evaluate(()=>window.documentInstance),'same-document');
 assert.ok(!await page.evaluate(()=>document.cookie.includes('forena-local-session')));
 await row.getByLabel('Kommentar').fill('Hämtas senare');await row.getByRole('button',{name:'Kommer',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'har sparats'})).toBeVisible();assert.equal(invitations[0].response,'accepted');
 await page.reload();await expect(row.getByLabel('Kommentar')).toHaveValue('Hämtas senare');
 for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:'frontend/.evidence/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'frontend/.evidence/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await expect(page.getByRole('dialog',{name:'Huvudmeny'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 platformDenied=true;await page.reload();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('heading',{name:'Familjens kallelser'})).toBeVisible();
 platformDenied=false;await page.reload();await expect(row).toHaveCount(1);
 revoked=true;await page.reload();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();await expect(row).toHaveCount(0);
 await page.getByLabel('E-postadress',{exact:true}).fill('other@example.invalid');await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('heading',{name:'Familjens kallelser'})).toBeVisible();await expect(row).toHaveCount(0);
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Logga ut från Förena'}).click();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();
 // Real browser WebAuthn call with a virtual discoverable credential; mocked provider verifies the wire contract only.
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await cdp.send('WebAuthn.addCredential',{authenticatorId,credential:{credentialId:Buffer.from('synthetic-credential').toString('base64'),isResidentCredential:true,rpId:base.hostname,privateKey:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),userHandle:Buffer.from(users[0]).toString('base64'),signCount:0}});
 await page.evaluate(()=>{window.documentInstance='passkey-document';});
 await page.getByRole('button',{name:'Logga in med passkey'}).click();await expect(row).toHaveCount(1);
 assert.equal(await page.evaluate(()=>window.documentInstance),'passkey-document');
 assert.ok(!await page.evaluate(()=>document.cookie.includes('forena-local-session')));
 assert.equal(await page.evaluate(()=>localStorage.length),0);
 await page.goto(new URL('/components',base).href);await expect(page.getByRole('heading',{name:'Komponenter',exact:true})).toBeVisible();await expect(page.getByText('Alex Exempel',{exact:true})).toBeVisible();assert.deepEqual(errors,[]);assert.equal(directProviderRequests,0);
 assert.ok(requests>0);console.log('PASS: HttpOnly session, CSRF header, legacy cleanup, no browser/provider tokens, password and WebAuthn without reload, save/reload, revocation, account switch, logout, public gallery, responsive layout and keyboard menu');
}finally{await browser.close();}
