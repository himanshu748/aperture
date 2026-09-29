import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://localhost:4342';
const suffix = process.env.REVIEW_ROUND || '1';
const out = '.impeccable/review';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = { environment: 'Local macOS headless Chromium; shared development machine, not a physical phone or performance guarantee', cases: [], stats: {} };
const errors = [];
async function context(options = {}) { const ctx = await browser.newContext(options); const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); return { ctx, page }; }
async function frame(page) { return page.locator('.privacy-stage').evaluate(el => ({ frames: Number(el.dataset.frames), calls: Number(el.dataset.drawCalls), triangles: Number(el.dataset.triangles), renderMs: Number(el.dataset.renderMs), dpr: Number(el.dataset.pixelRatio) })); }
async function settle(page) { await page.waitForTimeout(1100); }
async function overflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
try {
 const {ctx, page} = await context({ viewport: {width: 1440, height: 1000} });
 await page.goto(base); await page.locator('.privacy-stage[data-renderer="webgl"]').waitFor({ timeout: 60000 }); await settle(page);
 await overflow(page); await page.screenshot({ path: `${out}/3d-desktop-scope-r${suffix}.png`, fullPage:true });
 results.stats.desktop = await frame(page);
 let a = await frame(page); await page.waitForTimeout(400); let b = await frame(page); assert.equal(a.frames, b.frames, 'idle scene must not render continuously');
 await page.getByRole('button', {name: 'Private reference', exact:true}).focus(); await page.keyboard.press('Enter');
 assert.equal(await page.getByRole('button',{name:'Private reference',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('heading',{name:'The reference stays with you.'}).waitFor(); await settle(page);
 await page.screenshot({ path: `${out}/3d-desktop-reference-r${suffix}.png`, fullPage:true });
 await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Space');
 await page.getByRole('heading',{name:'One fact crosses the boundary.'}).waitFor(); await settle(page);
 await page.screenshot({ path: `${out}/3d-desktop-answer-r${suffix}.png`, fullPage:true });
 results.cases.push('All three layers work with keyboard; pressed state and live explanation match selected view; idle rendering stops.');
 // Actual frame timing during a transition, with browser rAF timestamps.
 const times = await page.evaluate(async () => { const d=[];let prev;const run=new Promise(resolve=>{const start=performance.now();function tick(t){if(prev)d.push(t-prev);prev=t;if(t-start<1000)requestAnimationFrame(tick);else resolve(d);}requestAnimationFrame(tick);});document.querySelectorAll('.privacy-switcher button')[0].click();return run; });
 times.sort((x,y)=>x-y); results.stats.transitionRaf = {samples:times.length, medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]};
 await page.locator('.public-footer').scrollIntoViewIfNeeded(); await settle(page); a=await frame(page);await page.waitForTimeout(300);b=await frame(page);assert.equal(a.frames,b.frames);
 await page.evaluate(()=>{window.__apHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__apHidden});document.dispatchEvent(new Event('visibilitychange'));document.querySelectorAll('.privacy-switcher button')[1].click();});a=await frame(page);await page.waitForTimeout(300);b=await frame(page);assert.equal(a.frames,b.frames);
 await page.evaluate(()=>{window.__apHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
 results.cases.push('Offscreen rendering stays stopped; simulated document-hidden visibility event pauses changes and resumes selected state.');
 await page.getByRole('button',{name:'Open workspace',exact:false}).click(); await page.getByRole('heading',{name:'Make room for less.'}).waitFor(); assert.equal(await page.locator('.privacy-webgl').count(),0); results.cases.push('Opening authentication removes the 3D canvas and tears down its renderer.');
 await ctx.close();
 const mobile=await context({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await mobile.page.goto(base);await mobile.page.locator('.privacy-stage').scrollIntoViewIfNeeded();try { await mobile.page.locator('.privacy-stage[data-renderer="webgl"]').waitFor({timeout:60000}); } catch (error) { console.log('MOBILE DIAGNOSTIC', await mobile.page.locator('.privacy-stage').evaluate(el=>({...el.dataset,html:el.innerHTML.slice(-300)})));await mobile.page.screenshot({path:`${out}/3d-mobile-failure-r${suffix}.png`,fullPage:true});throw error; }await settle(mobile.page);await overflow(mobile.page);
 a=await frame(mobile.page);await mobile.page.getByRole('button',{name:'Finite answer',exact:true}).click();await mobile.page.getByRole('heading',{name:'One fact crosses the boundary.'}).waitFor();await settle(mobile.page);b=await frame(mobile.page);assert.ok(b.frames-a.frames<=2,'reduced motion has no interpolated loop');assert.ok(b.dpr<=1.5);
 await mobile.page.screenshot({path:`${out}/3d-mobile-r${suffix}.png`,fullPage:true});results.stats.mobileViewport=b;results.cases.push('390px touch viewport has no overflow; DPR3 is capped at1.5; reduced motion updates the chosen view without an animation loop.');
 await mobile.page.evaluate(()=>{document.querySelector('.privacy-webgl').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();});await mobile.page.locator('.privacy-stage[data-renderer="static"]').waitFor();await mobile.page.getByRole('button',{name:'Private reference',exact:true}).click();await mobile.page.getByRole('heading',{name:'The reference stays with you.'}).waitFor();assert.equal(await mobile.page.locator('.privacy-static').isVisible(),true);await mobile.page.screenshot({path:`${out}/3d-context-loss-r${suffix}.png`,fullPage:true});results.cases.push('Real WEBGL_lose_context produces the static diagram; controls and explanations remain usable.');await mobile.ctx.close();
 const fallback=await context({viewport:{width:390,height:844}});await fallback.page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'||type==='webgl'?null:get.call(this,type,...args)};});await fallback.page.goto(base);await fallback.page.locator('.privacy-stage').scrollIntoViewIfNeeded();await fallback.page.locator('.privacy-stage[data-renderer="static"]').waitFor({timeout:60000});await fallback.page.getByRole('button',{name:'Finite answer',exact:true}).click();await fallback.page.getByRole('heading',{name:'One fact crosses the boundary.'}).waitFor();await overflow(fallback.page);await fallback.page.screenshot({path:`${out}/3d-no-webgl-r${suffix}.png`,fullPage:true});await fallback.ctx.close();results.cases.push('No-WebGL browser receives a complete SVG/DOM alternative with working controls.');
 assert.deepEqual(errors,[]); results.cases.push('No page errors in tested desktop, touch, reduced-motion, or fallback paths.');
 console.log(JSON.stringify(results,null,2));
 await writeFile(`${out}/3d-results-r${suffix}.json`,JSON.stringify(results,null,2)+'\n');
} finally { await browser.close(); }
