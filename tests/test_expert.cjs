// Run: NODE_PATH=/path/to/node_modules node tests/test_expert.cjs
// Requires Playwright and Chrome. Start a static server first.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const base=process.env.QUIZ_BASE_URL||'http://127.0.0.1:8765/';
const out=process.env.QUIZ_TEST_OUTPUT||path.resolve(root,'../output');
fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'quizzes.json')));
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const ctx=await browser.newContext();const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});
 const state=async q=>page.evaluate(k=>JSON.parse(localStorage.getItem(k+':session:v1')),q.storagePrefix);
 async function boot(q){await page.goto(base+'quizzes/'+q.slug+'/');await page.locator('#home-play').click();}
 async function play(q,wrong=false){
  await boot(q);let n=0;
  while(true){
   const s=await state(q);
   if(s.status==='finished')break;
   if(s.status==='between'){await page.locator('#between-continue').click();continue;}
   if(s.status==='revealed'){await page.locator('#next-question').click();continue;}
   const x=q.rounds[s.round].questions[s.question];
   assert(await page.locator('#check-answer').isDisabled());
   if(x.type==='choice')await page.locator('#choice-list input[value="'+(wrong?(x.correct+1)%4:x.correct)+'"]').locator('..').click();
   else await page.locator('#free-answer').fill(wrong?'неверный ответ':x.answers[0]);
   await page.locator('#check-answer').click();
   assert(await page.locator('#answer-reveal').isVisible());
   const reveal=await state(q);assert.equal(reveal.wasCorrect,!wrong);
   n++;
   if(q.slug==='ekspertny-uroven'){
    assert((await page.locator('#answer-explanation').innerText()).includes('Источник:'));
    if(n===1&&!wrong){await page.locator('.source-details summary').click();await page.screenshot({path:path.join(out,'expert-answer.png'),fullPage:true});}
   }
   if(n===5){await page.reload();await page.locator('#home-play').click();assert(await page.locator('#answer-reveal').isVisible());assert.equal((await state(q)).score,reveal.score);}
  }
  assert.equal(n,25);assert.equal((await state(q)).score,wrong?0:30);
  assert(await page.locator('#view-finish').isVisible());
  console.log('PASS full game:',q.slug,wrong?'0/30':'30/30');
 }
 for(const width of [320,375,390,768,1280]){
  await page.setViewportSize({width,height:850});await page.goto(base);await page.locator('.quiz-tile').last().waitFor();
  assert.equal(await page.locator('.quiz-tile').count(),3);
  for(const e of catalog.quizzes)assert.equal(await page.locator('a[href="./quizzes/'+e.slug+'/"]').count(),1);
  assert((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1);
  if(width===390)await page.screenshot({path:path.join(out,'catalog-mobile.png'),fullPage:true});
  await page.goto(base+'quizzes/ekspertny-uroven/');await page.locator('#home-title').filter({hasText:'Экспертный'.toUpperCase()}).waitFor();
  const clipped=await page.locator('#home-title').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert(!clipped,'title clips at '+width);
  if(width===390)await page.screenshot({path:path.join(out,'expert-home.png'),fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});
 for(const e of catalog.quizzes){const q=JSON.parse(fs.readFileSync(path.join(root,'quizzes',e.slug,'questions.json')));await play(q);}
 await page.screenshot({path:path.join(out,'expert-finish.png'),fullPage:true});
 await page.goto(base);await page.locator('.quiz-tile').last().waitFor();
 assert.equal(await page.getByText('ВАШ РЕКОРД: 30 / 30').count(),3);
 const q=JSON.parse(fs.readFileSync(path.join(root,'quizzes/ekspertny-uroven/questions.json')));
 await page.evaluate(k=>localStorage.removeItem(k+':session:v1'),q.storagePrefix);
 await play(q,true);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k+':best:v1'),q.storagePrefix),'30');
 // Manual credit is available only on free answers and must never award twice.
 await page.evaluate(k=>localStorage.removeItem(k+':session:v1'),q.storagePrefix);await boot(q);
 await page.locator('#free-answer').fill('ошибка');await page.locator('#check-answer').click();
 await page.locator('#manual-credit').click();assert.equal((await state(q)).score,1);
 assert(await page.locator('#manual-credit').isHidden());
 await page.reload();await page.locator('#home-play').click();assert.equal((await state(q)).score,1);
 // Check all accepted aliases in the real game, including normalized spelling.
 for(let r=0;r<q.rounds.length;r++)for(let i=0;i<q.rounds[r].questions.length;i++){
  const x=q.rounds[r].questions[i];if(x.type!=='text')continue;
  for(const answer of x.answers){
   let s=await state(q);Object.assign(s,{round:r,question:i,status:'question',pending:'',selected:null,credited:false,wasCorrect:false,score:0,roundScores:[0,0,0,0,0]});
   await page.evaluate(({k,s})=>localStorage.setItem(k+':session:v1',JSON.stringify(s)),{k:q.storagePrefix,s});
   await page.reload();await page.locator('#home-play').click();await page.locator('#free-answer').fill('  '+answer.toUpperCase().replaceAll('Ё','Е')+'  ');await page.locator('#check-answer').click();assert((await state(q)).wasCorrect,answer);
  }
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'browser-verification.json'),JSON.stringify({passed:true,fullGames:4,answersSubmittedInFullGames:100,widths:[320,375,390,768,1280],allExpertAliases:true,restores:true,separateRecords:true,manualCredit:true,errors},null,2));
 console.log('PASS: responsive catalog/home, all aliases, restores, separate records, wrong answers, manual credit, no page errors');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
