import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = new URL(process.env.FORENA_BROWSER_BASE_URL ?? 'http://127.0.0.1:3000');
assert.ok(base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname));
await mkdir('frontend/.evidence', { recursive: true });
const id='11111111-1111-4111-8111-111111111111';
const users=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const browser=await chromium.launch({...(process.env.FORENA_BROWSER_EXECUTABLE ? { executablePath: process.env.FORENA_BROWSER_EXECUTABLE } : {}),headless:true,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('FORENA_')))});
const context=await browser.newContext({viewport:{width:390,height:844}});
let revoked=false, requests=0;
let invitations=[{id,person_id:users[0],name:'Alex Exempel med ett längre familjenamn',response:'pending',response_comment:null}];
const token=index=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:users[index],aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'synthetic_signature'].join('.');
const tokens=[token(0),token(1)];
await context.route('**/config.json',r=>r.fulfill({json:{supabaseUrl:'https://ckzrtxqjskosqzoitymc.supabase.co',publishableKey:'sb_publishable_synthetic',version:id}}));
await context.route('https://ckzrtxqjskosqzoitymc.supabase.co/auth/v1/**',async route=>{
 const req=route.request();const url=new URL(req.url());
 if(url.pathname.endsWith('/token')){
  const body=req.postDataJSON();if(body.password!=='synthetic-password')return route.fulfill({status:400,json:{code:'invalid_credentials',message:'Invalid login credentials'}});
  revoked=false;const i=body.email==='other@example.invalid'?1:0;
  return route.fulfill({json:{access_token:tokens[i],token_type:'bearer',expires_in:3600,refresh_token:'synthetic_refresh',user:{id:users[i],aud:'authenticated',role:'authenticated',email:body.email,app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()}}});
 }
 if(url.pathname.endsWith('/logout')){revoked=true;return route.fulfill({status:204});}
 return route.fulfill({status:404,json:{error:'unsupported'}});
});
await context.route('**/api/**',async route=>{
 requests++;const req=route.request();const headers=req.headers();assert.ok(!headers.cookie);const auth=headers.authorization;
 if(revoked||!tokens.some(t=>auth===`Bearer ${t}`))return route.fulfill({status:401,json:{error:'Inloggning krävs.'}});
 if(req.method()==='PUT'){const body=req.postDataJSON();invitations=invitations.map(i=>({...i,response:body.response,response_comment:body.comment}));return route.fulfill({json:{ok:true}});}
 return route.fulfill({json:{invitations:auth===`Bearer ${tokens[0]}`?invitations:[]}});
});
const page=await context.newPage();const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
try{
 await page.goto(new URL(`/activities/${id}`,base).href);
 await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();assert.equal(requests,0);
 await page.getByLabel('E-postadress',{exact:true}).fill('family@example.invalid');
 await page.getByLabel('Lösenord',{exact:true}).fill('wrong-password');
 await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
 await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');
 await page.getByRole('button',{name:'Logga in',exact:true}).click();
 const row=page.locator('.personal-invitation-response');await expect(row).toHaveCount(1);
 await row.getByLabel('Kommentar').fill('Hämtas senare');await row.getByRole('button',{name:'Kommer',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'har sparats'})).toBeVisible();assert.equal(invitations[0].response,'accepted');
 await page.reload();await expect(row.getByLabel('Kommentar')).toHaveValue('Hämtas senare');
 for(const width of [320,375,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:'frontend/.evidence/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'frontend/.evidence/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await expect(page.getByRole('dialog',{name:'Huvudmeny'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 revoked=true;await page.reload();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();await expect(row).toHaveCount(0);
 await page.getByLabel('E-postadress',{exact:true}).fill('other@example.invalid');await page.getByLabel('Lösenord',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Logga in',exact:true}).click();await expect(page.getByRole('heading',{name:'Familjens kallelser'})).toBeVisible();await expect(row).toHaveCount(0);
 await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Logga ut från Förena'}).click();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();
 await page.goto(new URL('/components',base).href);await expect(page.getByRole('heading',{name:'Komponenter',exact:true})).toBeVisible();await expect(page.getByText('Alex Exempel',{exact:true})).toBeVisible();assert.deepEqual(errors,[]);
 console.log('PASS: controlled Auth/API browser login, validation, JWT-only API, save/reload, revoked session, account switch, logout, gallery, 320/375/390/768/1440px and keyboard menu');
}finally{await browser.close();}
