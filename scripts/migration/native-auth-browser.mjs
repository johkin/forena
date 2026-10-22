import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const app = 'https://app.example.invalid';
const backend = process.env.FORENA_NATIVE_API;
const mailbox = process.env.FORENA_NATIVE_MAILBOX;
const frontend = process.env.FORENA_NATIVE_FRONTEND ?? 'http://127.0.0.1:3002';
for (const endpoint of [backend, mailbox, frontend]) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname));
const email = process.env.FORENA_NATIVE_TEST_EMAIL;
const password = 'synthetic-password-for-native-test';
const browser = await chromium.launch({executablePath:process.env.FORENA_BROWSER_EXECUTABLE ?? '/usr/bin/chromium',headless:true,
  env:Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('FORENA_')))});
const context = await browser.newContext({viewport:{width:390,height:844}});
let externalRequests=0, oauthCallback;
await context.route('**/*',async route=>{
  const request=route.request(), url=new URL(request.url());
  if(url.origin==='https://client.example.invalid'&&url.pathname==='/callback'){
    oauthCallback=url;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>OAuth test client</title><p>OAuth callback received</p>'});
  }
  if(url.origin!==app){externalRequests++;return route.abort();}
  const api=url.pathname.startsWith('/api/')||url.pathname.startsWith('/oauth2/')||url.pathname.startsWith('/.well-known/');
  const headers={...await request.allHeaders()};delete headers.host;delete headers['content-length'];
  const response=await fetch(new URL(url.pathname+url.search,api?backend:frontend),{method:request.method(),headers,
    body:['GET','HEAD'].includes(request.method())?undefined:request.postDataBuffer(),redirect:'manual'});
  if(api && response.status>=400) console.log("native_api_status",request.method(),url.pathname,response.status,headers.origin ?? "absent");
  const output=Object.fromEntries(response.headers.entries());delete output['content-encoding'];delete output['content-length'];delete output['transfer-encoding'];
  if(response.headers.getSetCookie().length)output['set-cookie']=response.headers.getSetCookie().join('\n');
  if(output.location?.startsWith(backend))output.location=app+output.location.slice(backend.length);
  if(response.status>=300&&response.status<400&&output.location){
    const destination=new URL(output.location,app);
    assert.ok([app,'https://client.example.invalid'].includes(destination.origin));
    const target=JSON.stringify(destination.href).replaceAll('<','\\u003c');
    delete output.location;output['content-type']='text/html; charset=utf-8';
    // Start a fresh intercepted browser navigation; redirect chains otherwise escape
    // Playwright's synthetic HTTPS-origin transport and try to resolve .invalid.
    return route.fulfill({status:200,headers:output,body:'<!doctype html><script>location.replace('+target+')</script>'});
  }
  await route.fulfill({status:response.status,headers:output,body:Buffer.from(await response.arrayBuffer())});
});
const page=await context.newPage(), errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function budget(){assert.equal((await fetch(mailbox+'/reset-limits',{method:'POST'})).status,200);}
async function code(kind){const response=await fetch(mailbox+'/?kind='+kind);assert.equal(response.status,200);return (await response.json()).code;}
async function logout(){await page.getByRole('button',{name:'Öppna meny',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Logga ut från Förena'}).click();await expect(page.getByRole('heading',{name:'Logga in',exact:true})).toBeVisible();}
try{
 await mkdir('frontend/.evidence',{recursive:true});
 await page.goto(app+'/register');await page.getByLabel('E-postadress',{exact:true}).fill(email);await page.getByLabel('Nytt lösenord',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Skapa konto',exact:true}).click();await expect(page.getByRole('status')).toContainText('verifieringslänk');
 await budget();await page.goto(app+'/auth/verify?code='+encodeURIComponent(await code('verify')));
 await page.getByRole('button',{name:'Verifiera e-postadress',exact:true}).click();await expect(page.getByRole('status')).toContainText('verifierad');
 await page.goto(app+'/login');await page.getByLabel('E-postadress',{exact:true}).fill(email);await page.getByLabel('Lösenord',{exact:true}).fill(password);await page.getByRole('button',{name:'Logga in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
 await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await budget();await page.goto(app+'/account/security');await page.getByRole('button',{name:'Skapa passkey',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Din passkey har skapats'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ta bort passkey',exact:true})).toBeVisible();
 await page.screenshot({path:'frontend/.evidence/native-passkeys.png',fullPage:true});
 await logout();await budget();await page.getByRole('button',{name:'Logga in med passkey',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 await budget();
 const verifier='native-browser-code-verifier-at-least-forty-three-characters';
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 const oauth=new URLSearchParams({response_type:'code',client_id:'native-mcp-test',redirect_uri:'https://client.example.invalid/callback',scope:'mcp:read',state:'browser-oauth-state',code_challenge:challenge,code_challenge_method:'S256',resource:app+'/api/mcp'});
 await page.goto(app+'/oauth2/authorize?'+oauth);
 await expect(page.getByRole('button',{name:'Godkänn läsåtkomst',exact:true})).toBeVisible();
 await page.screenshot({path:'frontend/.evidence/native-oauth-consent.png',fullPage:true});
 await page.getByRole('button',{name:'Godkänn läsåtkomst',exact:true}).click();
 await expect(page).toHaveURL(/https:\/\/client\.example\.invalid\/callback\?/);
 assert.equal(oauthCallback.searchParams.get('state'),'browser-oauth-state');
 const clientAuthorization='Basic '+Buffer.from('native-mcp-test:synthetic-oauth-client-secret-for-native-test').toString('base64');
 const issued=await fetch(backend+'/oauth2/token',{method:'POST',headers:{authorization:clientAuthorization,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'authorization_code',code:oauthCallback.searchParams.get('code'),redirect_uri:'https://client.example.invalid/callback',code_verifier:verifier,resource:app+'/api/mcp'})});
 assert.equal(issued.status,200);const initialTokens=await issued.json();assert.ok(initialTokens.access_token);assert.ok(initialTokens.refresh_token);
 const refreshed=await fetch(backend+'/oauth2/token',{method:'POST',headers:{authorization:clientAuthorization,'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',refresh_token:initialTokens.refresh_token,resource:app+'/api/mcp'})});
 assert.equal(refreshed.status,200);const rotated=await refreshed.json();assert.notEqual(rotated.refresh_token,initialTokens.refresh_token);
 const access=rotated.access_token;assert.ok(access);
 const mcp=()=>fetch(backend+'/api/mcp',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal((await mcp()).status,200);
 const revoked=await fetch(backend+'/oauth2/revoke',{method:'POST',headers:{authorization:clientAuthorization,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:access,token_type_hint:'access_token'})});
 assert.equal(revoked.status,200);assert.equal((await mcp()).status,401);
 await page.goto(app+'/');await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 await logout();await budget();await page.getByLabel('E-postadress för inloggningslänk' ,{exact:true}).fill(email);await page.getByRole('button',{name:'Skicka inloggningslänk',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Om adressen har ett konto');
 await page.goto(app+'/auth/callback?code='+encodeURIComponent(await code('login')));await page.getByRole('button',{name:'Fortsätt och logga in',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Min översikt',exact:true})).toBeVisible();
 const cookies=await context.cookies(app);assert.ok(cookies.some(cookie=>cookie.name==='__Host-forena-session'&&cookie.httpOnly&&cookie.secure));
 assert.equal(await page.evaluate(()=>localStorage.length),0);assert.ok(!await page.evaluate(()=>document.cookie.includes('forena-session')));
 await logout();await budget();await page.goto(app+'/password/forgot');await page.getByLabel('E-postadress',{exact:true}).fill(email);await page.getByRole('button',{name:'Skicka återställningslänk',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('återställningslänk');
 await page.goto(app+'/auth/reset?code='+encodeURIComponent(await code('reset')));await page.getByLabel('Nytt lösenord',{exact:true}).fill('changed-native-browser-password');await page.getByRole('button',{name:'Välj ett nytt lösenord',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Lösenordet är ändrat');
 await page.screenshot({path:'frontend/.evidence/native-password-reset.png',fullPage:true});
 await page.goto(app+'/components');await expect(page.getByRole('heading',{name:'Komponenter',exact:true})).toBeVisible();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);assert.equal(externalRequests,0);
 console.log('PASS: real browser → Spring Security → PostgreSQL: signup, email verification, password login, virtual WebAuthn registration and discoverable login, magic link, password reset, browser OAuth consent/PKCE, refresh rotation, MCP and token revocation, shared gallery, HttpOnly/Secure cookie, no browser tokens and no external identity provider.');
}finally{await browser.close();}
