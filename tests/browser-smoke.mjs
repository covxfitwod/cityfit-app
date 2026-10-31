import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const server=spawn(process.execPath,['tests/serve-static.mjs'],{stdio:'inherit'});
const base='http://127.0.0.1:8765';
async function waitForServer(){
 for(let i=0;i<40;i++){try{const r=await fetch(base);if(r.ok)return;}catch{} await new Promise(r=>setTimeout(r,250));}
 throw new Error('Local preview server did not start');
}
const browser=await chromium.launch({headless:true});
let failed=false;
try {
 await waitForServer();
 for(const [name,settings] of [['desktop',{viewport:{width:1280,height:800}}],['mobile',devices['iPhone 13']]]){
   const context=await browser.newContext(settings);
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.getByRole('button',{name:/Reviews/}).click();
   await page.getByRole('heading',{name:'Workout Reviews'}).waitFor({timeout:20000});
   await page.getByLabel('Scheduled workout').waitFor();
   await page.getByRole('button',{name:'Sign in with Google'}).waitFor();
   assert.equal(await page.locator('#review-form').count(),0,'Review form must be hidden when signed out');
   assert.equal(await page.locator('#review-admin-form').count(),0,'Admin controls must be hidden when signed out');
   const options=await page.locator('#review-date-picker option').count();
   assert.ok(options>=2,'Expected at least two scheduled workouts');
   assert.equal(await page.getByRole('button',{name:/Previous/}).isDisabled(),true);
   const originalDate=await page.locator('#review-date-picker').inputValue();
   await page.getByRole('button',{name:/Next/}).click();
   await page.getByRole('heading',{name:'Workout Reviews'}).waitFor();
   const nextDate=await page.locator('#review-date-picker').inputValue();
   assert.notEqual(nextDate,originalDate,'Next must change selected workout');
   await page.getByRole('button',{name:/Previous/}).click();
   assert.equal(await page.locator('#review-date-picker').inputValue(),originalDate,'Previous must restore original workout');
   await page.locator('#review-date-picker').selectOption(nextDate);
   assert.equal(await page.locator('#review-date-picker').inputValue(),nextDate,'Date picker must change workout');
   await page.getByRole('button',{name:/Calendar/}).click();
   await page.getByRole('heading',{name:'Workout Calendar'}).waitFor();
   await page.getByRole('button',{name:/Today/}).click();
   await page.getByRole('heading',{name:'Workout of the Day'}).waitFor();
   await page.getByRole('button',{name:/My Log/}).click();
   await page.getByRole('heading',{name:'My Workout Log'}).waitFor({timeout:20000});
   assert.equal(errors.length,0, 'Browser JavaScript errors: '+errors.join(' | '));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,name+' has horizontal overflow');
   console.log('PASS browser smoke: '+name);
   await context.close();
 }
} catch(e){failed=true;console.error(e);}
finally{await browser.close();server.kill();}
if(failed)process.exitCode=1;
