// Full QA suite for Lost Pet Finder KSA (demo mode). Run: node tests/qa.js   (needs Playwright + Chromium)
// It starts its own web server on the project folder (LPF_ROOT, default: the folder above this one), so nothing else is needed.
// Writes tests/qa_results.json and prints PASS n/m plus every failure.
let chromium; try { ({chromium}=require('playwright')); } catch(e) { ({chromium}=require('/opt/node-tools/node_modules/playwright')); }
const fs=require('fs'), path=require('path'), http=require('http');
process.chdir(__dirname);
const ROOT=path.resolve(process.env.LPF_ROOT||path.join(__dirname,'..'));
const PORT=+(process.env.LPF_PORT||8765);
const BASE=`http://localhost:${PORT}/`;
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{ let u=decodeURIComponent(req.url.split('?')[0]); if(u==='/') u='/index.html';
  let f=path.join(ROOT,u); if(u==='/index.html' && fs.existsSync(path.join(ROOT,'repo','index.html'))) f=path.join(ROOT,'repo','index.html');
  if(!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end('not found'); }
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res); });
const results=[]; const R=(area,name,ok,note='')=>{results.push({area,name,ok:!!ok,note:String(note).slice(0,160)}); };
(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch();
try{
async function newPage(opts={}){ const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true,...opts}); await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:BASE.slice(0,-1)});
  const p=await ctx.newPage(); p.setDefaultTimeout(6000); p._errs=[]; p.on('pageerror',e=>p._errs.push(e.message)); p.on('dialog',d=>{p._dialog=true; d.dismiss();});
  await p.route(/^https:\/\//,r=>r.abort()); return p; }
const go=async(p,h,wait=600)=>{ await p.goto(BASE+h); await p.waitForTimeout(wait); };
const H=p=>p.evaluate(()=>location.hash);
async function fresh(p,lang='en'){ await go(p,'#home',100); await p.evaluate(l=>{localStorage.clear();sessionStorage.clear();localStorage.setItem('lpf-lang',l)},lang); await p.reload(); await p.waitForTimeout(500); }
async function signin(p){ await go(p,'#signin',300); await p.click('#gBtn'); await p.waitForTimeout(400); for(const id of ['#cPrivacy','#cTerms','#cAdult']) await p.check(id); await p.click('#cOk'); await p.waitForTimeout(400); }
async function post(p,kind,{file='c2.jpg',name='',colour='cream / beige',district='Hittin',wa='',desc=''}={}){
  await go(p,'#report-'+kind,400); await p.setInputFiles('#photos',file); await p.click('#nextBtn'); await p.waitForTimeout(150);
  if(name && await p.$('#pet_name')) await p.fill('#pet_name',name);
  await p.click(`label.chip:has-text("${colour}")`); await p.click('#nextBtn'); await p.waitForTimeout(150);
  await p.fill('#district',district); await p.click('#nextBtn'); await p.waitForTimeout(150);
  if(desc) await p.fill('#description',desc); if(wa){ await p.fill('#public_whatsapp',wa); await p.check('#waOk'); }
  await p.check('#consent'); await p.click('#nextBtn'); await p.waitForTimeout(2200); return (await H(p)).slice(6); }

// ---------- 1. Routing & rendering (signed out) ----------
let p=await newPage(); await fresh(p);
const routes=['#home','#browse-lost','#browse-found','#case-ex1','#case-ex2','#privacy','#terms','#signin','#poster'];
for(const r of routes){ await go(p,r); const h1=await p.$$eval('h1',e=>e.length); R('Routing',`${r} renders`, p._errs.length===0 && h1===1, `h1=${h1} errs=${p._errs.join(';')}`); }
await go(p,'#case-doesnotexist'); R('Routing','unknown post shows friendly message', (await p.textContent('main')).includes('no longer exists'));
await go(p,'#nonsense'); R('Routing','unknown page falls back to home', !!(await p.$('.hero')));
for(const r of ['#report-lost','#report-found','#mine','#account','#admin','#edit-ex1']){ await go(p,r); R('Access control',`${r} asks signed-out visitor to sign in`, (await H(p))==='#signin'); }
await go(p,'#consent'); R('Access control','#consent without sign-in goes to sign-in', (await H(p))==='#signin');

// ---------- 2. Languages ----------
const keys=Object.keys((await import('file://'+path.join(ROOT,'i18n.js'))).STRINGS.en);
for(const lang of ['en','ar']){ await fresh(p,lang);
  for(const r of ['#home','#browse-found','#case-ex2','#privacy','#signin','#poster']){ await go(p,r,500);
    const txt=await p.evaluate(()=>document.body.innerText); const leaked=keys.filter(k=>k.length>5 && /[A-Z]/.test(k) && new RegExp('\\b'+k+'\\b').test(txt));
    const dir=await p.evaluate(()=>document.documentElement.dir);
    R('Language',`${lang} ${r}: direction + no raw text keys`, dir===(lang==='ar'?'rtl':'ltr') && !leaked.length, leaked.join(',')); } }
await fresh(p,'en');

// ---------- 3. Layout: no sideways scrolling ----------
for(const w of [360,390,768,1280]){ await p.setViewportSize({width:w,height:900});
  let bad=[]; for(const r of ['#home','#browse-lost','#case-ex2','#privacy','#signin','#poster']){ await go(p,r,350); if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)) bad.push(r); }
  R('Layout',`width ${w}px: no horizontal scroll`, !bad.length, bad.join(',')); }
await p.setViewportSize({width:390,height:844});
await go(p,'#home'); R('Layout','phone shows bottom tab bar with Found pets', await p.isVisible('.tabbar a[data-nav="browse-found"]'));
await p.setViewportSize({width:700,height:900}); await go(p,'#home'); R('Layout','tablet width shows Lost/Found links in header', await p.isVisible('.top .nav a[data-nav="browse-found"]'));
await p.setViewportSize({width:390,height:844});

// ---------- 4. Dark mode & text size ----------
const pd=await newPage({colorScheme:'dark'}); await fresh(pd); const bg=await pd.evaluate(()=>getComputedStyle(document.body).backgroundColor);
R('Theme','dark mode uses a dark background', /rgb\((\d+), (\d+), (\d+)\)/.test(bg) && bg.match(/\d+/g).slice(0,3).every(n=>+n<60), bg); await pd.context().close();
const fs0=await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize)); await p.click('#sizeBtn'); await p.waitForTimeout(100);
const fs1=await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize)); await p.click('#sizeBtn'); await p.click('#sizeBtn');
const fs3=await p.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
R('Accessibility','text size button enlarges text and cycles back', fs1>fs0 && fs3===fs0, `${fs0}→${fs1}→${fs3}`);

// ---------- 5. Browse filters ----------
await go(p,'#browse-found'); await p.fill('#fText','cream'); await p.waitForTimeout(200);
R('Browse','search "cream" finds the cream Himalayan', (await p.textContent('#results')).includes('Himalayan'));
await p.fill('#fText',''); await p.selectOption('#fSpecies','dog'); await p.waitForTimeout(200);
R('Browse','animal filter shows only dogs', (await p.$$('#results .card')).length===1 && (await p.textContent('#results')).includes('Dog'));
await p.selectOption('#fSpecies',''); await p.selectOption('#fCity','abha'); await p.waitForTimeout(200);
R('Browse','no results shows a helpful empty state', !!(await p.$('#results .empty')));
R('Browse','results count is announced', (await p.textContent('#count')).includes('0'));

// ---------- 6. Sign-in / registration ----------
await go(p,'#signin'); R('Sign-up','sign-in page explains it also creates an account', (await p.textContent('main')).includes('creates your free account'));
await p.click('#gBtn'); await p.waitForTimeout(400); R('Sign-up','first-time user sees "Create your account"', (await p.textContent('h1')).includes('Create your account'));
await p.click('#cOk'); R('Sign-up','cannot continue without ticking the boxes', await p.isVisible('#cErr'));
await p.check('#cPrivacy'); await p.check('#cTerms'); await p.click('#cOk'); R('Sign-up','18+ box is required too', await p.isVisible('#cErr'));
await p.check('#cAdult'); await p.click('#cOk'); await p.waitForTimeout(400); R('Sign-up','after consent goes to home (or the page they wanted)', (await H(p))==='#home');
await go(p,'#account'); R('Header','account button shows when signed in', (await p.getAttribute('#acctBtn','href'))==='#account');

// ---------- 7. Report form validation ----------
await go(p,'#report-lost'); await p.click('#nextBtn'); R('Report form','step 1 requires a photo', (await p.textContent('[data-err="1"]')).includes('photo'));
await p.setInputFiles('#photos',['c1.jpg','c2.jpg','cat.jpg','c1.jpg','c2.jpg']); R('Report form','maximum 4 photos kept', (await p.$$('.pv')).length===4);
await p.click('.pv-x'); R('Report form','a photo can be removed', (await p.$$('.pv')).length===3);
await p.click('#nextBtn'); await p.click('#nextBtn'); R('Report form','step 2 requires a colour', (await p.textContent('[data-err="2"]')).toLowerCase().includes('colour'));
await p.fill('#pet_name','DraftTest'); await p.click('label.chip:has-text("white")'); await p.reload(); await p.waitForTimeout(500);
R('Report form','unfinished post is restored after reload', (await p.isVisible('.notice')) && (await p.evaluate(()=>localStorage.getItem('lpf-draft-lost')||'')).includes('DraftTest'));
await p.setInputFiles('#photos','c2.jpg'); await p.click('#nextBtn'); await p.waitForTimeout(150);
R('Report form','restored name is filled in', (await p.inputValue('#pet_name'))==='DraftTest');
await p.click('#nextBtn'); await p.waitForTimeout(150); await p.click('button.chip-btn:has-text("Yesterday")');
const y=new Date(Date.now()-864e5).toISOString().slice(0,10); R('Report form','"Yesterday" fills the date', (await p.inputValue('#event_date'))===y);
await p.click('#prevBtn'); await p.waitForTimeout(150); R('Report form','Back keeps entered data', (await p.inputValue('#pet_name'))==='DraftTest');
await p.click('#nextBtn'); await p.click('#nextBtn'); await p.waitForTimeout(150);
await p.click('#nextBtn'); R('Report form','step 4 requires public-post consent', (await p.textContent('[data-err="4"]')).includes('Tick'));
await p.check('#consent'); await p.fill('#public_whatsapp','0551234567'); await p.click('#nextBtn'); R('Report form','WhatsApp needs its own consent tick', (await p.textContent('[data-err="4"]')).includes('WhatsApp'));
R('Report form','review card shows before publishing', (await p.textContent('#review')).includes('DraftTest'));
await p.check('#waOk'); await p.click('#nextBtn'); await p.waitForTimeout(2200); const myLost=(await H(p)).slice(6);
R('Report form','post publishes and opens its page', myLost.length>2 && (await p.textContent('h1')).includes('DraftTest'));
R('Report form','draft is cleared after publishing', !(await p.evaluate(()=>localStorage.getItem('lpf-draft-lost'))));

// ---------- 8. Security: script injection ----------
const xss=await post(p,'found',{name:'',desc:'<img src=x onerror="window.__x=1"><script>window.__x=2</script>',district:'<b onmouseover=alert(1)>Olaya</b>'});
await go(p,'#case-'+xss); const pwned=await p.evaluate(()=>window.__x); const shown=(await p.textContent('main')).includes('<img src=x');
R('Security','typed HTML/script is shown as text, never run', !pwned && shown && !p._dialog);
await go(p,'#browse-found'); R('Security','browse cards also safe', !(await p.evaluate(()=>window.__x)));

// ---------- 9. Post page actions ----------
await go(p,'#case-'+myLost,1500);
R('Post page','"What to do now" checklist shown to owner', (await p.$$('.todo li')).length===7);
R('Post page','WhatsApp share link is correct', ((await p.getAttribute('.action-row a','href'))||'').startsWith('https://wa.me/?text='));
await p.click('#copyBtn'); await p.waitForTimeout(200); const clip=await p.evaluate(()=>navigator.clipboard.readText().catch(()=>'' ));
R('Post page','Copy link copies the post address', clip.includes('#case-'+myLost), clip);
await p.click('#posterBtn'); await p.waitForTimeout(900); R('Post page','"Make a poster" opens the poster maker filled from the post', (await H(p))==='#poster-'+myLost && (await p.inputValue('#pm_name'))==='DraftTest');
const [pdl]=await Promise.all([p.waitForEvent('download',{timeout:8000}).catch(()=>null), p.click('#pmDl')]); await go(p,'#case-'+myLost,1500);
let posterOk=false; if(pdl){ const f='qa_poster.png'; await pdl.saveAs(f); posterOk=fs.statSync(f).size>20000; } R('Post page','poster downloads as an image', posterOk);
R('Matching','found posts appear as matches with reasons', (await p.$$('#matches .match')).length>=1 && /Match \d+%/.test(await p.textContent('#matches')), (await p.textContent('#matches')).slice(0,150));
R('Matching','AI status explains fallback when AI cannot load', (await p.textContent('#aiStatus')).length>10, await p.textContent('#aiStatus'));
await p.click('[data-mark="possible"]'); await p.waitForTimeout(200); await p.reload(); await p.waitForTimeout(1200);
R('Matching','"Possible!" mark is remembered', !!(await p.$('.match.possible')));
await p.click('[data-mark="possible"]'); await p.click('[data-mark="not"]'); await p.waitForTimeout(200);
const hiddenNow=!(await p.$('.match.not')); await p.check('#showHidden'); await p.waitForTimeout(200);
R('Matching','"Not mine" hides it; "Show ruled out" brings it back', hiddenNow && !!(await p.$('.match.not')));
await p.click('a:has-text("Edit post")'); await p.waitForTimeout(400); await p.fill('#e_public_whatsapp','0551234567'); await p.uncheck('#e_waOk'); await p.click('button:has-text("Save changes")');
R('Edit','WhatsApp consent enforced when editing', (await p.textContent('#eErr')).includes('WhatsApp'));
await p.check('#e_waOk'); await p.fill('#e_colors','white, grey ears'); await p.click('button:has-text("Save changes")'); await p.waitForTimeout(600);
R('Edit','edited details saved', (await p.textContent('.facts')).includes('grey ears'));
await p.click('[data-status="reunited"]'); await p.waitForTimeout(600); R('Owner','"We are reunited" marks the post', (await p.textContent('.case-head')).includes('Reunited'));
await go(p,'#home',700); R('Owner','reunited counter goes up on home', (await p.textContent('.stat.reunited b'))==='1');
await go(p,'#case-'+myLost); await p.click('[data-status="open"]'); await p.waitForTimeout(500); R('Owner','post can be reopened', (await p.textContent('.case-head')).includes('Lost'));

// ---------- 10. Other people's posts, messages, reports, moderation ----------
await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('lpf-demo-v1')); d.cases.push({id:'other1',owner_id:'someone-else',kind:'found',species:'cat',pet_name:null,breed:'Persian',sex:'male',age_group:'adult',colors:'white',eye_color:'blue',markings:'',description:'Found near park',city:'riyadh',district:'Hittin',lat:null,lng:null,event_date:new Date().toISOString().slice(0,10),photos:[],public_whatsapp:'0559998888',reward:null,status:'open',created_at:new Date().toISOString()}); localStorage.setItem('lpf-demo-v1',JSON.stringify(d)); }); await p.reload();
await go(p,'#case-other1'); R('Contact','other people\'s posts show a private message box', !!(await p.$('#msgBody')));
R('Contact','public WhatsApp button converts 05… to 9665…', ((await p.$$eval('a[href*="wa.me/"]',a=>a.map(x=>x.href).join(' ')))).includes('wa.me/966559998888'));
await p.fill('#msgBody','Hello, is this cat still with you?'); await p.click('#msgBtn'); await p.waitForTimeout(300);
await go(p,'#mine',900); R('Contact','sent message appears in My posts inbox', (await p.textContent('#inbox')).includes('still with you'));
await go(p,'#case-other1'); await p.click('summary:has-text("Report")'); await p.fill('#flagBody','Asking for money'); await p.click('#flagBtn'); await p.waitForTimeout(300);
await go(p,'#admin',700); R('Moderation','report appears on Moderation page', (await p.textContent('main')).includes('Asking for money'));
await p.click('[data-hide]'); await p.waitForTimeout(700); await go(p,'#browse-found'); R('Moderation','hidden post disappears from public lists', !(await p.textContent('#results')).includes('Found near park') );

// ---------- 11. Alerts badge ----------
await go(p,'#mine',800); await p.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('lpf-demo-v1')); d.cases.push({id:'other2',owner_id:'someone-else',kind:'found',species:'cat',breed:'',sex:'unknown',age_group:'unknown',colors:'white, grey ears',eye_color:'',markings:'',description:'',city:'riyadh',district:'Hittin',lat:null,lng:null,event_date:new Date().toISOString().slice(0,10),photos:[],status:'open',created_at:new Date().toISOString()}); localStorage.setItem('lpf-demo-v1',JSON.stringify(d)); }); await go(p,'#home',100); await p.reload();
await go(p,'#home',1200); R('Alerts','badge appears for a new matching post', !!(await p.$('[data-nav="mine"] .badge')), await p.evaluate(()=>[...document.querySelectorAll('.badge')].map(b=>b.textContent).join()));
await go(p,'#mine',1200); R('Alerts','"since your last visit" banner on My posts', !!(await p.$('#newsBanner')));
await go(p,'#home',900); R('Alerts','badge clears after visiting My posts', !(await p.$('[data-nav="mine"] .badge')));

// ---------- 12. Privacy rights ----------
await go(p,'#account',700); R('PDPL','consents listed with dates', (await p.$$('.consent-list li')).length>=4);
const [dl]=await Promise.all([p.waitForEvent('download'), p.click('#dlBtn')]); await dl.saveAs('qa_export.json'); const ex=JSON.parse(fs.readFileSync('qa_export.json','utf8'));
R('PDPL','"Download my data" includes posts, messages, consents', ex.posts.length>=2 && ex.messages.length>=1 && ex.consents.length>=4, `posts=${ex.posts.length} msgs=${ex.messages.length} consents=${ex.consents.length}`);
await go(p,'#privacy'); const priv=await p.textContent('main');
R('PDPL','privacy notice covers purposes, basis, transfers, retention, rights, 30 days, SDAIA, 72h, age', ['Legal basis','outside the Kingdom','120 days','30 days','SDAIA','72 hours','18'].every(s=>priv.includes(s)));
await go(p,'#account'); await p.click('#delAcc'); R('PDPL','delete account asks to confirm', (await p.textContent('#delAcc')).includes('again'));
await p.click('#delAcc'); await p.waitForTimeout(800);
const left=await p.evaluate(()=>{const d=JSON.parse(localStorage.getItem('lpf-demo-v1'));return d.cases.filter(c=>c.owner_id==='demo-me').length+'/'+(d.profile?'profile':'none')});
R('PDPL','delete account removes posts and profile, signs out', left==='0/none' && (await p.getAttribute('#acctBtn','href'))==='#signin', left);

// ---------- 13. Accessibility checks ----------
await fresh(p); await signin(p);
const a11y=async(r)=>{ await go(p,r,700); return p.evaluate(()=>{ const issues=[];
  document.querySelectorAll('img').forEach(i=>{ if(!i.hasAttribute('alt')) issues.push('img without alt'); });
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(el=>{ const lab=el.closest('label')||(el.id&&document.querySelector(`label[for="${el.id}"]`)); if(!lab && !el.getAttribute('aria-label')) issues.push('unlabelled '+el.id); });
  document.querySelectorAll('button,a[href]').forEach(el=>{ if(el.offsetParent!==null && getComputedStyle(el).visibility!=='hidden' && !(el.innerText.trim()||el.getAttribute('aria-label'))) issues.push('nameless '+el.outerHTML.slice(0,40)); });
  const lum=c=>{const m=c.match(/\d+(\.\d+)?/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2]);};
  const bgOf=el=>{while(el){const b=getComputedStyle(el).backgroundColor; if(b && !b.endsWith(', 0)') && b!=='transparent') return b; el=el.parentElement;} return 'rgb(255,255,255)';};
  let low=0; document.querySelectorAll('p,span,a,b,li,dt,dd,h1,h2,h3,label,button').forEach(el=>{ if(!el.offsetParent||!el.innerText.trim()||el.children.length>2) return; const cs=getComputedStyle(el); const L1=lum(cs.color),L2=lum(bgOf(el)); const r=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05); const big=parseFloat(cs.fontSize)>=24||(parseFloat(cs.fontSize)>=18.6&&+cs.fontWeight>=700); if(r<(big?3:4.5)) {low++; if(low<4) issues.push('contrast '+r.toFixed(2)+' "'+el.innerText.trim().slice(0,25)+'"');} });
  const small=[...document.querySelectorAll('button,a.btn,.chip span,.tabbar a')].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<40)).length; if(small) issues.push(small+' tap targets under 40px');
  return issues; }); };
for(const r of ['#home','#browse-found','#case-ex2','#report-lost','#account','#signin','#privacy','#poster']){ const iss=await a11y(r); R('Accessibility',`${r}: alt text, labels, names, contrast, tap size`, !iss.length, iss.join(' | ')); }
await go(p,'#home'); await p.reload(); await p.waitForTimeout(500); await p.keyboard.press('Tab'); const firstFocus=await p.evaluate(()=>document.activeElement.className);
R('Accessibility','first Tab reaches "Skip to content"', firstFocus.includes('skip'), firstFocus);


// ---------- 15. Poster maker ----------
{ const q=await newPage(); await fresh(q);
  await go(q,'#poster',1200); R('Poster','open to visitors without signing in', (await H(q))==='#poster' && (await q.$$eval('h1',e=>e.length))===1);
  const dims=async()=>{ await q.waitForTimeout(700); return q.$eval('#pmCanvas canvas',c=>c.width+'x'+c.height); };
  R('Poster','A4 preview drawn by default', (await dims())==='1240x1754');
  R('Poster','warns when there is no phone or QR', await q.isVisible('#pmWarn'));
  await q.setInputFiles('#pmPhotos',['cat.jpg','c1.jpg']); await q.waitForTimeout(900);
  R('Poster','photos added, first marked as main', (await q.$$('#pmPrev .pv')).length===2 && !!(await q.$('#pmPrev .pv.main')));
  const before=await q.$eval('#pmPrev .pv.main img',i=>i.src.length); await q.click('[data-main="1"]'); await q.waitForTimeout(300);
  R('Poster','tap a photo to make it the main one', (await q.$eval('#pmPrev .pv.main img',i=>i.src.length))!==before);
  await q.fill('#pm_name','Coco'); await q.fill('#pm_phone','0551234567'); await q.fill('#pm_district','Al Malqa'); await q.fill('#pm_reward','1000 SAR'); await q.waitForTimeout(600);
  R('Poster','phone removes the warning', !(await q.isVisible('#pmWarn')));
  await q.check('input[name=size][value=square]',{force:true}); R('Poster','square size', (await dims())==='1080x1080' && !(await q.isVisible('#pm_tear')));
  await q.check('input[name=size][value=story]',{force:true}); R('Poster','status/story size', (await dims())==='1080x1920');
  await q.check('input[name=size][value=a4]',{force:true}); await dims();
  const [d1]=await Promise.all([q.waitForEvent('download',{timeout:8000}).catch(()=>null), q.click('#pmDl')]);
  let ok=false, nm=''; if(d1){ nm=d1.suggestedFilename(); await d1.saveAs('qa_pm.png'); ok=fs.statSync('qa_pm.png').size>50000; } R('Poster','download gives a PNG image', ok && nm.endsWith('.png'), nm);
  await q.reload(); await q.waitForTimeout(1200); R('Poster','details kept after reload (photos are not stored)', (await q.inputValue('#pm_name'))==='Coco' && (await q.$$('#pmPrev .pv')).length===0);
  await q.evaluate(()=>{ window.print=()=>{ window.__printed=1; }; }); await q.click('#pmPrint'); await q.waitForTimeout(500);
  await q.emulateMedia({media:'print'}); const pv=await q.evaluate(()=>{ const a=document.getElementById('printArea'); return !!window.__printed && !!a && getComputedStyle(a).display==='block' && !!a.querySelector('img') && getComputedStyle(document.getElementById('app')).display==='none'; });
  await q.emulateMedia({media:'screen'}); R('Poster','print shows only the poster', pv);
  await q.click('#pmReset'); await q.waitForTimeout(800); R('Poster','"Start again" clears the form', (await q.inputValue('#pm_name'))==='' && !((await q.evaluate(()=>localStorage.getItem('lpf-poster-draft')||'')).includes('Coco')));
  await go(q,'#case-ex2',800); await q.click('#posterBtn'); await q.waitForTimeout(1000);
  R('Poster','from a post: details filled in, QR points to the post', (await q.inputValue('#pm_breed')).length>0 && await q.isChecked('input[name=qr][value=post]') && await q.isVisible('.pm .notice'));
  await go(q,'#home',600); R('Poster','home page links to the poster maker', !!(await q.$('.hero a[href="#poster"]')));
  R('Poster','no page errors', q._errs.length===0, q._errs.join(';'));
}


// ---------- 16. Launch hardening ----------
{ const q=await newPage(); await fresh(q); await signin(q);
  // phone numbers in public text
  await go(q,'#report-lost',400); await q.setInputFiles('#photos','c2.jpg'); await q.click('#nextBtn'); await q.waitForTimeout(150);
  await q.click('label.chip:has-text("white")'); await q.fill('#markings','call 055 123 4567'); await q.click('#nextBtn'); await q.waitForTimeout(150);
  R('Anti-spam','phone number in "special marks" is refused with a clear message', (await q.textContent('[data-err="2"]')).includes('phone number'));
  await q.fill('#markings','white sock on left paw'); await q.click('#nextBtn'); await q.waitForTimeout(150); await q.fill('#district','Hittin'); await q.click('#nextBtn'); await q.waitForTimeout(150);
  await q.fill('#description','Seen 24/11/2026 10:30. WhatsApp me ٠٥٥١٢٣٤٥٦٧'); await q.check('#consent'); await q.click('#nextBtn'); await q.waitForTimeout(200);
  R('Anti-spam','Arabic-digit phone number in description is refused', (await q.textContent('[data-err="4"]')).includes('phone number'));
  await q.fill('#description','Seen 24/11/2026 10:30 near the park. Microchip 900123456789012.'); await q.click('#nextBtn'); await q.waitForTimeout(2200);
  const first=(await H(q)).slice(6); R('Anti-spam','dates, times and microchip numbers are allowed', first.length>2, await H(q));
  await go(q,'#edit-'+first,500); await q.fill('#e_description','new number 0551234567'); await q.click('button:has-text("Save changes")'); await q.waitForTimeout(300);
  R('Anti-spam','editing a post also refuses phone numbers', (await q.textContent('#eErr')).includes('phone number'));
  // daily post limit (5)
  for(let i=0;i<4;i++){ await post(q,'found',{district:'Olaya'}); }
  const mineCount=await q.evaluate(()=>JSON.parse(localStorage.getItem('lpf-demo-v1')).cases.filter(c=>c.owner_id==='demo-me').length);
  await go(q,'#report-found',400); await q.setInputFiles('#photos','c2.jpg'); await q.click('#nextBtn'); await q.waitForTimeout(150); await q.click('label.chip:has-text("cream / beige")'); await q.click('#nextBtn'); await q.waitForTimeout(150); await q.fill('#district','Olaya'); await q.click('#nextBtn'); await q.waitForTimeout(150); await q.check('#consent'); await q.click('#nextBtn'); await q.waitForTimeout(1500);
  R('Anti-spam','6th post in 24 hours is stopped with a friendly message', mineCount===5 && (await q.textContent('[data-err="4"]')).includes("today's limit"), 'posts='+mineCount);
  // message limit (40)
  await q.evaluate(()=>{ const d=JSON.parse(localStorage.getItem('lpf-demo-v1')); d.cases.push({id:'other9',owner_id:'someone-else',kind:'found',species:'cat',colors:'white',city:'riyadh',district:'Hittin',event_date:new Date().toISOString().slice(0,10),photos:[],status:'open',sex:'unknown',age_group:'unknown',created_at:new Date().toISOString()});
    for(let i=0;i<40;i++) d.messages.push({id:'mm'+i,case_id:'other9',from_id:'demo-me',to_id:'someone-else',body:'x',created_at:new Date().toISOString()}); localStorage.setItem('lpf-demo-v1',JSON.stringify(d)); });
  await go(q,'#home',100); await q.reload(); await go(q,'#case-other9',800); await q.fill('#msgBody','41st message'); await q.click('#msgBtn'); await q.waitForTimeout(300);
  R('Anti-spam','41st message in 24 hours is stopped', (await q.textContent('#toast')).includes("today's limit"));
  // share buttons
  const hrefs=await q.$$eval('.share-more a',a=>a.map(x=>x.href));
  R('Share','Telegram, X and Facebook buttons carry the post link', hrefs.length===3 && hrefs[0].startsWith('https://t.me/share/url?url=') && hrefs[1].startsWith('https://x.com/intent/post?') && hrefs[2].startsWith('https://www.facebook.com/sharer/sharer.php?u=') && hrefs.every(h=>decodeURIComponent(h).includes('#case-other9')), hrefs.join(' '));
  R('Share','share buttons are big enough to tap', await q.$$eval('.share-more .btn',b=>b.filter(x=>x.offsetParent).every(x=>x.getBoundingClientRect().height>=44)));
  // install as app
  await go(q,'#home',600); R('Install','install card stays hidden until the phone offers installing', !(await q.isVisible('#installCard')));
  await q.evaluate(()=>{ const e=new Event('beforeinstallprompt'); e.prompt=()=>{ window.__prompted=1; }; e.userChoice=Promise.resolve({outcome:'accepted'}); window.dispatchEvent(e); }); await go(q,'#browse-lost',200); await go(q,'#home',600);
  R('Install','install card appears when the phone offers it', await q.isVisible('#installCard'));
  await q.click('#installBtn'); await q.waitForTimeout(200); R('Install','"Install" opens the phone\'s install prompt', await q.evaluate(()=>window.__prompted===1));
  const man=await q.evaluate(async()=>{ const m=await (await fetch('manifest.webmanifest')).json(); const ok=await Promise.all(m.icons.map(async i=>(await fetch(i.src)).ok)); return {n:m.icons.length, ok:ok.every(Boolean), maskable:m.icons.some(i=>i.purpose==='maskable'), short:m.shortcuts.length}; });
  R('Install','app manifest valid with 192/512/maskable icons and shortcuts', man.ok && man.maskable && man.n>=3 && man.short===3, JSON.stringify(man));
  const sw=await q.evaluate(async()=>{ const r=await fetch('sw.js'); return r.ok && (await r.text()).includes('addEventListener("fetch"'); }); R('Install','offline helper (service worker) is published', sw);
  // link preview
  const og=await q.evaluate(()=>({img:document.querySelector('meta[property="og:image"]')?.content, title:document.querySelector('meta[property="og:title"]')?.content, card:document.querySelector('meta[name="twitter:card"]')?.content}));
  const ogOk=await q.evaluate(async()=>{ const r=await fetch('og.png'); return r.ok && (await r.blob()).size>50000; });
  R('Preview','link-preview tags and 1200×630 image present', !!og.title && og.img==='/og.png' && og.card==='summary_large_image' && ogOk, JSON.stringify(og));
  R('Preview','demo share links stay as #case- links (live site uses /p/<id>)', (await q.evaluate(()=>navigator.clipboard ? 1 : 1)) && hrefs.every(h=>!decodeURIComponent(h).includes('/p/')));
  R('Anti-spam','no page errors', q._errs.length===0, q._errs.join(';'));
}
// analytics only when switched on
{ const q=await newPage(); let beacon=false; q.on('request',r=>{ if(r.url().includes('cloudflareinsights')) beacon=true; });
  await go(q,'#home',800); R('Analytics','no statistics script while switched off', !beacon && !(await q.$('script[src*="cloudflareinsights"]')));
  await q.route('**/config.js',async r=>{ const res=await r.fetch(); const txt=(await res.text()).replace('analyticsToken: ""','analyticsToken: "tok123"'); r.fulfill({response:res, body:txt}); });
  await q.reload(); await q.waitForTimeout(800); const tag=await q.$eval('script[src*="cloudflareinsights"]',s=>s.getAttribute('data-cf-beacon')).catch(()=>'');
  R('Analytics','statistics script added (no cookies) when a token is set', tag.includes('tok123'), tag);
  const cookies=await q.context().cookies(); R('Analytics','site sets no cookies', cookies.length===0, cookies.map(c=>c.name).join());
}

// ---------- 14. AI fallback for a fresh visitor ----------
R('AI','pages never crash when AI model is unavailable', p._errs.length===0, p._errs.join(';'));

}catch(e){ console.log('CRASH',e.message.split('\n').slice(0,3).join(' ')); }
// ---------- report ----------
const pass=results.filter(r=>r.ok).length; console.log(`PASS ${pass}/${results.length}`);
results.filter(r=>!r.ok).forEach(r=>console.log('FAIL',r.area,'|',r.name,'|',r.note));
fs.writeFileSync('qa_results.json',JSON.stringify(results,null,1));
await b.close(); server.close(); process.exit(results.every(r=>r.ok)?0:1); })();
