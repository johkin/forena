import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origins=(process.env.FORENA_DISCIPLINE_ORIGINS??'http://localhost:3000').split(',');
for(const origin of origins)assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,...(process.env.FORENA_BROWSER_EXECUTABLE?{executablePath:process.env.FORENA_BROWSER_EXECUTABLE}:{})});
await mkdir('/tmp/forena-information-evidence',{recursive:true});
try{
 for(const [index,origin] of origins.entries())for(const width of [320,390,768,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(`${origin}/components`);
  const section=page.locator('#information-example');await expect(section).toBeVisible({timeout:60000});
  await section.getByLabel('Faktisk lagkapten',{exact:true}).selectOption('11111111-1111-4111-8111-111111111111');
  await section.getByRole('button',{name:'Spara matchuppföljning',exact:true}).click();
  await expect(section.getByRole('status')).toContainText('Matchuppföljningen har sparats.');
  await expect(section.getByText('Uppföljningen är ofullständig.',{exact:false})).toBeVisible();
  await section.getByLabel('Delades Gröna kortet ut?',{exact:true}).selectOption('awarded');
  await section.getByRole('checkbox',{name:'Alex Exempel',exact:true}).check();
  await section.getByRole('checkbox',{name:'Robin Exempel',exact:true}).check();
  await section.getByRole('button',{name:'Spara matchuppföljning',exact:true}).click();
  await expect(section.getByText('Inga obesvarade uppföljningspunkter.',{exact:true})).toBeVisible();
  await section.getByLabel('Uppföljningsläge').selectOption('conflict');
  await section.getByLabel('Faktisk lagkapten',{exact:true}).selectOption('22222222-2222-4222-8222-222222222222');
  await section.getByRole('button',{name:'Spara matchuppföljning',exact:true}).click();
  await expect(section.getByRole('alert')).toContainText('Ditt utkast finns kvar');
  await expect(section.getByLabel('Faktisk lagkapten',{exact:true})).toHaveValue('22222222-2222-4222-8222-222222222222');
  await section.getByLabel('Uppföljningsläge').selectOption('attendance');
  await expect(section.getByRole('button',{name:'Spara matchuppföljning',exact:true})).toBeDisabled();
  await section.getByLabel('Uppföljningsläge').selectOption('readonly');
  await expect(section.getByRole('button',{name:'Spara matchuppföljning',exact:true})).toHaveCount(0);
  const administration=page.locator('#discipline-administration-example');await expect(administration).toBeVisible();
  await administration.getByRole('button',{name:'Avfärda för laget',exact:true}).click();
  await expect(administration.getByRole('group',{name:'Granska åtgärd'})).toBeVisible();
  await administration.getByRole('button',{name:'Bekräfta',exact:true}).click();
  await expect(administration.getByRole('button',{name:'Avfärda för laget',exact:true})).toHaveCount(0);
  await administration.getByText('Spelarhistorik och rapport',{exact:true}).click();
  await expect(administration.getByText('0 spelade matcher i perioden.',{exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
  await section.screenshot({path:`/tmp/forena-information-evidence/information-${index}-${width}.png`});
  await administration.screenshot({path:`/tmp/forena-information-evidence/administration-${index}-${width}.png`});
  assert.deepEqual(errors,[]);await context.close();console.log(`${origin} ${width}px: partial/full save, multi-player, conflict, attendance, read-only, signals, report, layout OK`);
 }
}finally{await browser.close();}
