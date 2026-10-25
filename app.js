(async function(){'use strict';
const $=id=>document.getElementById(id),C=window.PeakCore,Imp=window.PeakImport,Cloud=window.PeakCloud,cloudMode=Boolean(Cloud?.enabled);
let authMode='login',authNotice='',adminCache=null,adminSelected=null,adminDocs=null,adminProgramme=null,adminLoading=false,adminError='',programmeSyncIssue='';
const DB='peak-training-data', DBVER=2;let db,programs=[],profiles=[],profile=null,enrolled={},states={},activeId='',P=null,S=null,view='profiles',week=1,sessionId='',toastTimer=null,pendingImport=null,installPrompt=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n||0).toLocaleString('en-GB',{maximumFractionDigits:1}),f=n=>Number(n||0).toFixed(1).replace(/\.0$/,''),slug=s=>String(s||'').replace(/[^a-z0-9]+/ig,'_').slice(0,60);
const countSets=s=>s.sets.reduce((n,x)=>n+(x.kind==='ACC'?x.count:1),0);
const freshState=p=>({logs:{},config:{...JSON.parse(JSON.stringify(p.defaults)),movementMaxes:{...(p.defaults.movementMaxes||{})}},week:1,sessionId:p.sessions[0]?.id||'',history:[],readiness:{},applyRpeToAll:false});
const tx=(store,mode='readonly')=>db.transaction(store,mode).objectStore(store);
function req(r){return new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}
function openDB(){return new Promise((yes,no)=>{const r=indexedDB.open(DB,DBVER);r.onupgradeneeded=()=>{const d=r.result;for(const s of ['programmes','states','profiles','enrolments','profileStates'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}
async function get(store,id){return cloudMode?Cloud.get(store,id):req(tx(store).get(id))}
async function all(store){return cloudMode?Cloud.all(store):req(tx(store).getAll())}
async function put(store,obj){if(cloudMode)return Cloud.put(store,obj);await req(tx(store,'readwrite').put(obj))}
async function remove(store,id){if(cloudMode)return Cloud.remove(store,id);await req(tx(store,'readwrite').delete(id))}
function alertUser(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200)}
const stateKey=(profileId,programmeId)=>JSON.stringify([profileId,programmeId]);
const profileInitial=name=>({id:(cloudMode&&Cloud.user?.id)||((crypto.randomUUID?crypto.randomUUID():('local-'+Date.now()+'-'+Math.random().toString(36).slice(2)))),name,createdAt:new Date().toISOString(),activeProgramId:''});
const isEnrolled=id=>!!enrolled[id];
function activate(id){
 if(!profile||!isEnrolled(id))return false;
 const p=programs.find(x=>x.id===id);if(!p)return false;
 activeId=id;P=p;window.PROGRAM=p;S=states[id]||freshState(p);states[id]=S;
 S.config=S.config||structuredClone(p.defaults);S.config.movementMaxes=S.config.movementMaxes||{};for(const [code,v] of Object.entries(S.config.variation||{})){if(Number(v.override)>0&&!(Number(S.config.movementMaxes[code])>0))S.config.movementMaxes[code]=Number(v.override)}S.readiness=S.readiness||{};if(typeof S.applyRpeToAll!=='boolean')S.applyRpeToAll=false;
 week=Math.min(P.weeks.length,Math.max(1,Number(S.week)||1));sessionId=S.sessionId||P.sessions[0]?.id;
 profile.activeProgramId=id;
 // Record profile selection even if the user has not yet logged a set.
 put('profiles',profile).catch(console.error);
 return true;
}
async function saveState(){if(!profile||!P)return;S.week=week;S.sessionId=sessionId;await put('profileStates',{id:stateKey(profile.id,activeId),profileId:profile.id,programId:activeId,data:S})}
async function loadProfile(selected){
 profile=selected;enrolled={};states={};P=null;S=null;activeId='';
 if(!selected){localStorage.removeItem('peak-active-profile');view='profiles';return}
 localStorage.setItem('peak-active-profile',selected.id);
 for(const item of await all('enrolments'))if(item.profileId===selected.id)enrolled[item.programId]=item;
 for(const item of await all('profileStates'))if(item.profileId===selected.id)states[item.programId]=item.data;
 const ids=Object.keys(enrolled);
 if(ids.length){activate(enrolled[selected.activeProgramId]?selected.activeProgramId:ids[0]);view='profile'}
 else view='profile';
}
async function createProfile(name){
 name=String(name||'').trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>40){alertUser('Enter a name from 2 to 40 characters');return}
 const person=profileInitial(name);await put('profiles',person);profiles.push(person);
 await loadProfile(person);render();alertUser('Profile created — choose your first programme');
}
async function enrol(id){
 if(!profile)return;const p=programs.find(x=>x.id===id);if(!p)return;
 if(!enrolled[id]){const item={id:stateKey(profile.id,id),profileId:profile.id,programId:id,joinedAt:new Date().toISOString()};await put('enrolments',item);enrolled[id]=item}
 activate(id);await saveState();switchTo('home');alertUser(`${p.title} added to ${profile.name}'s profile`);
}
async function unenrol(id){
 if(!profile||!enrolled[id])return;
 const p=programs.find(x=>x.id===id);
 if(!confirm(`Remove ${p?.title||id} from ${profile.name}'s profile? This deletes their saved training logs and settings for this programme only.`))return;
 await remove('enrolments',stateKey(profile.id,id));await remove('profileStates',stateKey(profile.id,id));
 delete enrolled[id];delete states[id];
 if(activeId===id){P=null;S=null;activeId='';profile.activeProgramId='';const next=Object.keys(enrolled)[0];if(next)activate(next);else await put('profiles',profile)}
 switchTo('profile');alertUser('Programme removed from profile');
}
function switchTo(v){view=(!profile&&v!=='profiles')?'profiles':(!P&&!['profile','profiles','library'].includes(v))?'library':v;render();window.scrollTo({top:0,behavior:'instant'})}
function activeWeek(){return P.weeks.find(w=>w.week===week)}
function session(){return P.sessions.find(x=>x.id===sessionId)||P.sessions[0]}
function logsFor(s){return C.logCount(S,s)}
function updatedStatus(){const online=navigator.onLine;$('offlineBadge').textContent=online?'● ONLINE':'● OFFLINE';$('offlineBadge').classList.toggle('off',!online)}
function header(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));document.body.classList.toggle('no-profile',!profile||(cloudMode&&Cloud.recoveryPending));$('profileShortcut').textContent=profile?profile.name.slice(0,1).toUpperCase():'+';$('profileShortcut').setAttribute('aria-label',profile?'Open '+profile.name+' profile':'Choose profile')}
function loadRatio(group){return Object.values(S.config.maxes).map(Number).reduce((a,b)=>a+b,0)}
function cardProgramme(p){const added=isEnrolled(p.id);const state=added?(states[p.id]||freshState(p)):freshState(p);const total=p.sessions.reduce((n,s)=>n+countSets(s),0),logged=Object.values(state.logs||{}).filter(x=>x&&(x.done||C.hasNum(x.weight)||C.hasNum(x.rpe))).length;
 return `<article class="programme ${p.id===activeId?'is-active':''}"><div class="programmetop"><span class="programicon">${p.id===activeId?'▲':'▦'}</span><span class="version">${added?'IN YOUR PROFILE':'AVAILABLE'} · v${esc(p.version||1)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description||'Custom strength programme')}</p><div class="mutedrow"><span>${p.weeks.length} weeks</span><span>${p.sessions.length} sessions</span>${added?`<span>${logged}/${total} sets logged</span>`:''}</div>${added?`<div class="progressbar"><span style="width:${Math.min(100,100*logged/Math.max(1,total))}%"></span></div>`:''}<div class="pair"><button class="btn ${added&&p.id===activeId?'btn-outline':'btn-primary'}" data-open-programme="${esc(p.id)}">${added?(p.id===activeId?'Continue training':'Switch to programme'):'＋ Add to my profile'}</button>${added?`<button class="btn btn-danger-ghost" data-remove-programme="${esc(p.id)}" aria-label="Remove programme from your profile">Remove</button>`:''}</div></article>`}
function authView(){
 if(Cloud.recoveryPending)authMode='reset';
 if(authMode==='reset')return `<div class="profile-welcome"><span class="eyebrow">PEAK ACCOUNT RECOVERY</span><h1>Choose a new<br><span class="accent">password.</span></h1><p>Your email recovery link was accepted. Set a new password to secure your PEAK account.</p></div><div class="panel auth-panel"><h3>Reset password</h3><form id="resetPasswordForm" class="profile-form"><label for="resetPassword">New password</label><input id="resetPassword" name="password" type="password" required minlength="12" autocomplete="new-password"><label for="resetPasswordAgain">Confirm password</label><input id="resetPasswordAgain" name="confirm" type="password" required minlength="12" autocomplete="new-password"><button class="btn btn-primary" type="submit">Save new password →</button></form>${authNotice?`<p class="auth-message" role="status">${esc(authNotice)}</p>`:''}<p class="micro">If this recovery link has expired, sign out and request another from the sign-in page.</p></div>`;
 if(authMode==='forgot')return `<div class="profile-welcome"><span class="eyebrow">PEAK ACCOUNT RECOVERY</span><h1>Recover your<br><span class="accent">account.</span></h1><p>Enter your registered email address to request a password reset link.</p></div><div class="panel auth-panel"><h3>Forgot password?</h3><form id="forgotPasswordForm" class="profile-form"><label for="recoveryEmail">Account email</label><input id="recoveryEmail" name="email" type="email" autocomplete="email" required placeholder="name@example.com"><button class="btn btn-primary" type="submit">Email reset link →</button></form><button class="textlink auth-switch" data-action="authlogin">← Back to sign in</button>${authNotice?`<p class="auth-message" role="status">${esc(authNotice)}</p>`:''}<p class="micro">For your privacy, we do not confirm whether an email is registered.</p></div>`;
 const signingUp=authMode==='signup';
 const extra=signingUp?`<label for="authUsername">Username</label><input id="authUsername" name="username" required minlength="3" maxlength="30" autocomplete="username" placeholder="e.g. AlexTraining">`:'';
 return `<div class="profile-welcome"><span class="eyebrow">PEAK SECURE ACCOUNTS</span><h1>${signingUp?'Create your':'Welcome back to'}<br><span class="accent">PEAK Training.</span></h1><p>${signingUp?'Create a password-protected account to save your programmes and training across devices.':'Sign in to your private athlete account. Your training is stored in the cloud.'}</p></div><div class="panel auth-panel"><h3>${signingUp?'Create account':'Sign in'}</h3><form id="${signingUp?'signupAuthForm':'loginAuthForm'}" class="profile-form">${extra}<label for="authEmail">Email</label><input id="authEmail" name="email" type="email" autocomplete="email" required placeholder="name@example.com"><label for="authPassword">Password</label><input id="authPassword" type="password" name="password" minlength="${signingUp?'12':'1'}" autocomplete="${signingUp?'new-password':'current-password'}" required placeholder="${signingUp?'12+ characters':'Your password'}"><button class="btn btn-primary" type="submit">${signingUp?'Create account':'Sign in'} →</button></form>${!signingUp?'<button class="textlink auth-switch" data-action="authforgot">Forgot password?</button>':''}<button class="textlink auth-switch" data-action="authswitch">${signingUp?'Already have an account? Sign in':'New here? Create an account'}</button>${authNotice?`<p class="auth-message" role="status">${esc(authNotice)}</p>`:''}<p class="micro">Online accounts use Supabase authentication. Passwords are never saved in PEAK website files.</p></div>`;
}
function adminView(){
 if(!cloudMode||Cloud.account?.role!=='admin')return `<div class="empty">You do not have administrator access.</div>`;
 if(!adminCache)return `<div class="pagehead"><h1>Admin dashboard<span class="accent">.</span></h1><p>Loading authorised accounts…</p></div>`;
 const {accounts}=adminCache;
 const rows=accounts.map(a=>`<button class="admin-user ${a.id===adminSelected?'selected':''}" data-admin-user="${esc(a.id)}"><span><strong>${esc(a.username)}</strong><small>${esc(a.email)} · ${esc(a.role)}</small></span><span class="admin-numbers">View training →</span></button>`).join('');
 const person=accounts.find(a=>a.id===adminSelected);
 let details='';
 if(person){
  if(adminLoading)details=`<div class="panel admin-details"><h3>${esc(person.username)} — training history</h3><p>Loading this athlete's programmes and logs…</p></div>`;
  else if(adminError)details=`<div class="panel admin-details"><h3>Unable to load training logs</h3><p class="warn">${esc(adminError)}</p></div>`;
  else if(adminDocs){
   const docs=adminDocs,links=docs.filter(d=>d.kind==='enrolments'),states=docs.filter(d=>d.kind==='profileStates');
   const ids=[...new Set([...links.map(d=>d.content?.programId),...states.map(d=>d.content?.programId)].filter(Boolean))];
   const selected=ids.includes(adminProgramme)?adminProgramme:ids[0];
   const menu=ids.map(id=>{const programme=docs.find(d=>d.kind==='programmes'&&d.content?.id===id)?.content||programs.find(p=>p.id===id);return `<button class="btn ${selected===id?'btn-primary':'btn-outline'}" data-admin-program="${esc(id)}">${esc(programme?.title||id)}</button>`}).join('');
   const current=states.find(d=>d.content?.programId===selected)?.content?.data;
   const programme=docs.find(d=>d.kind==='programmes'&&d.content?.id===selected)?.content||programs.find(p=>p.id===selected);
   details=`<div class="panel admin-details"><h3>${esc(person.username)} — training history</h3><p class="muted">${esc(person.email)} · Joined ${esc(new Date(person.created_at).toLocaleDateString('en-GB'))}</p>${ids.length?`<div class="admin-programmes">${menu}</div>${adminTrainingDetails(programme,current)}`:'<p>This athlete has no saved programmes or training logs yet.</p>'}<p class="micro">Read-only. These are the athlete’s recorded values, not editable coaching targets.</p></div>`;
  }
 }
 return `<button class="back" data-action="profile">← My profile</button><div class="pagehead"><span class="eyebrow">AUTHORISED ADMIN ONLY</span><h1>Athlete training logs<span class="accent">.</span></h1><p>${accounts.length} registered account${accounts.length===1?'':'s'}. Select an athlete, then a programme, to inspect their logged training. Other athletes cannot view these records.</p></div><section class="panel"><h3>Publish a programme update</h3><p class="muted">Upload a PEAK Excel or JSON programme file. Keep the Programme ID and increase Version to publish revised future sessions to every athlete. Already-started sessions keep their original weights, exercise selection and logs.</p><button class="btn btn-primary" data-action="adminupload">↑ Upload programme update</button><p class="micro">Athletes receive updates when they next sign in or press Sync published programmes. Only Supabase administrators can publish.</p></section><div class="admin-list">${rows||'<p>No registered accounts found.</p>'}</div>${details}<button class="btn btn-outline" data-action="adminrefresh">↻ Refresh accounts</button>`;
}
function adminTrainingDetails(programme,state){
 if(!state)return '<p class="empty">No saved training state for this programme.</p>';
 const logs=state.logs||{}, sessions=programme?.sessions||[];
 const hasEntry=log=>log&&(log.done||log.status==='skipped'||C.hasNum(log.weight)||C.hasNum(log.rpe)||C.hasNum(log.reps));
 const sessionBlocks=[];const mapped=new Set();
 for(const session of sessions){
  const entries=[];
  for(const set of session.sets||[]){
   const count=set.kind==='ACC'?(Number(set.count)||1):1;
   for(let i=1;i<=count;i++){
    const key=set.kind==='ACC'?set.id+'_s'+i:set.id,log=logs[key];mapped.add(key);
    if(!hasEntry(log))continue;
    const prescribed=Number(set.reps),actual=C.hasNum(log.reps)?Number(log.reps):null;
    const missed=actual!==null&&Number.isFinite(prescribed)?Math.max(0,prescribed-actual):0;
    const label=set.kind==='ACC'?`Set ${i}`:`${set.step||'Set'}`;const type=set.setType||'STANDARD';const goalKg=type==='AMRAP'?set.targetKg:type==='REP_MAX'?set.goalKg:null;const achieved=goalKg!=null&&actual!==null&&C.hasNum(log.weight)?(Number(log.weight)>=goalKg&&actual>=Number(set.reps)?'Goal met':'Below goal'):'';
    const status=log.status==='skipped'?'Skipped':missed?`${missed} missed rep${missed===1?'':'s'}`:log.done?'Completed':'Logged';
    entries.push(`<div class="admin-set ${log.status==='skipped'?'is-skipped':''}"><div class="admin-set-title"><strong>${esc(set.name||set.code||'Movement')}</strong><span class="${missed?'warn':''}">${esc(status)}</span></div><div class="admin-set-values"><span>${esc(label)}${type!=='STANDARD'?' · '+esc(type.replace('_',' ')):''}</span><span>Reps: <b>${actual===null?'—':esc(actual)} / ${esc(set.repsText||set.reps||'—')}</b></span>${goalKg!=null?`<span>Target: <b>${esc(goalKg)} kg</b></span>`:''}<span>Weight: <b>${C.hasNum(log.weight)?esc(log.weight)+' kg':'—'}</b></span>${achieved?`<span><b>${achieved}</b></span>`:''}<span>RPE: <b>${C.hasNum(log.rpe)?esc(log.rpe):'—'}</b></span></div>${log.at?`<small class="admin-logged-at">Saved ${esc(new Date(log.at).toLocaleString('en-GB'))}</small>`:''}</div>`);
   }
  }
  const readiness=state.readiness?.[session.id];
  if(entries.length||readiness){
   sessionBlocks.push(`<details class="admin-session" open><summary>Week ${esc(session.week)} · Day ${esc(session.day)} — ${esc(session.title)} <span>${entries.length} sets${readiness?' · Readiness '+esc(readiness)+'/5':''}</span></summary>${entries.join('')||'<p class="muted">Readiness recorded, but no sets logged.</p>'}</details>`);
  }
 }
 const other=Object.entries(logs).filter(([key,log])=>!mapped.has(key)&&hasEntry(log));
 if(other.length)sessionBlocks.push(`<details class="admin-session"><summary>Other recorded sets (${other.length})</summary>${other.map(([key,log])=>`<div class="admin-set"><div class="admin-set-title"><strong>${esc(key)}</strong><span>${log.status==='skipped'?'Skipped':'Logged'}</span></div><div class="admin-set-values"><span>Reps: ${C.hasNum(log.reps)?esc(log.reps):'—'}</span><span>Weight: ${C.hasNum(log.weight)?esc(log.weight)+' kg':'—'}</span><span>RPE: ${C.hasNum(log.rpe)?esc(log.rpe):'—'}</span></div></div>`).join('')}</details>`);
 const count=Object.values(logs).filter(hasEntry).length,skipped=Object.values(logs).filter(l=>l?.status==='skipped').length;
 return `<div class="admin-log-summary"><b>${count} recorded set${count===1?'':'s'}</b><span>${skipped} skipped · Current week ${esc(state.week||1)}</span></div>${sessionBlocks.join('')||'<p class="empty">No logged workouts for this programme yet.</p>'}`;
}
function chooser(){if(cloudMode)return authView();return `<div class="profile-welcome"><div class="eyebrow"><span class="pulse"></span> WELCOME TO PEAK</div><h1>Your training.<br><span class="accent">Your profile.</span></h1><p>Create a profile to save your own programmes, training logs and progress on this device.</p></div>
 <div class="panel"><h3>Create a profile</h3><form id="createProfileForm" class="profile-form"><label for="profileName">Profile name</label><input required minlength="2" maxlength="40" id="profileName" name="name" placeholder="e.g. Alex" autocomplete="nickname"><button class="btn btn-primary" type="submit">Create profile →</button></form></div>
 ${profiles.length?`<section class="space"><div class="sectiontitle"><h2>Choose an existing profile</h2></div><div class="profile-grid">${profiles.map(person=>`<button class="profile-person" data-choose-profile="${esc(person.id)}"><span class="profile-initial">${esc(person.name.slice(0,1).toUpperCase())}</span><span><strong>${esc(person.name)}</strong><small>Continue training →</small></span></button>`).join('')}</div></section>`:''}
 <div class="importactions"><button class="btn btn-outline" data-action="restore">↑ Restore existing PEAK backup</button></div><p class="micro">Profiles in this version are local to this browser, not password-protected accounts. To access your training on another device, make a JSON backup and restore it there.</p>`}
function profileView(){if(!profile)return chooser();const mine=programs.filter(p=>isEnrolled(p.id)),available=programs.filter(p=>!isEnrolled(p.id));return `<div class="profile-hero"><div class="profile-initial profile-initial-large">${esc(profile.name.slice(0,1).toUpperCase())}</div><div><span class="eyebrow">YOUR ATHLETE PROFILE</span><h1>${esc(profile.name)}<span class="accent">.</span></h1><p>Joined ${esc(new Date(profile.createdAt).toLocaleDateString('en-GB',{month:'short',year:'numeric'}))}</p></div></div>
 <div class="profile-actions"><button class="btn btn-outline" data-action="renameprofile">Edit name</button>${cloudMode?`<button class="btn btn-outline" data-action="signout">Sign out</button>`:`<button class="btn btn-outline" data-action="switchprofile">Switch profile</button>`}</div>${cloudMode&&Cloud.account?.role==='admin'?`<button class="btn btn-primary admin-launch" data-action="admin">View all athlete accounts →</button>`:``}
 ${cloudMode?`<div class="account-email"><span>Sign-in email</span><strong>${esc(Cloud.user?.email||Cloud.account?.email||'Not available')}</strong><div class="pair"><button class="btn btn-outline" data-action="refreshaccount">↻ Refresh email</button><button class="btn btn-outline" data-action="changeemail">Change email</button></div></div>`:''}
 <div class="sectiontitle profile-section"><div><span class="eyebrow">SAVED TO YOUR PROFILE</span><h2>My programmes</h2></div><span class="pill">${mine.length} added</span></div>
 ${mine.length?`<div class="programme-list">${mine.map(cardProgramme).join('')}</div>`:`<div class="empty-profile"><span>▦</span><h3>No programmes yet</h3><p>Pick a programme below to add it to your profile and start tracking.</p></div>`}
 ${available.length?`<div class="sectiontitle profile-section"><div><span class="eyebrow">PROGRAMME CATALOGUE</span><h2>Explore programmes</h2></div></div><div class="programme-list">${available.map(cardProgramme).join('')}</div>`:''}
 <div class="profile-data"><strong>Keep your training safe</strong><p>Save a backup of all profiles and training history, or restore an existing backup.</p><div class="pair"><button class="btn btn-outline" data-action="backup">↓ Back up profiles</button><button class="btn btn-outline" data-action="restore">↑ Restore backup</button></div></div>
 <div class="profile-bottom"><button class="textlink" data-action="library">Browse all programmes ↗</button>${cloudMode?'':'<button class="textlink dangerlink" data-action="deleteprofile">Delete this profile</button>'}</div><p class="micro">${cloudMode?'This account syncs through your configured Supabase project; keep backups for extra protection.':'Saved on this browser only. This is not an online account or shared-device privacy barrier. Use Progress → JSON backup to transfer your data.'}</p>`}
function home(){const w=activeWeek(),sessions=P.sessions.filter(s=>s.week===week),done=sessions.reduce((n,s)=>n+logsFor(s),0),all=sessions.reduce((n,s)=>n+countSets(s),0);
 return `<section class="intro"><div class="eyebrow"><span class="pulse"></span> ACTIVE PROGRAMME <span class="sep">/</span> VERSION ${esc(P.version||1)}</div><h1>${esc(P.title)}</h1><p class="lead">${esc(P.description||'Progress built one set at a time.')}</p><div class="herostats"><div><span>Squat 1RM</span><strong>${num(S.config.maxes.SQ)}<small> kg</small></strong></div><div><span>Bench 1RM</span><strong>${num(S.config.maxes.BP)}<small> kg</small></strong></div><div><span>Deadlift 1RM</span><strong>${num(S.config.maxes.DL)}<small> kg</small></strong></div></div></section>
 <section class="space"><div class="sectiontitle"><div><span class="eyebrow">YOUR CURRENT BLOCK</span><h2>Week ${week} <small>of ${P.weeks.length}</small></h2></div><button class="textlink" data-action="library">Change programme ↗</button></div>
 <div class="weeklist" role="group" aria-label="Choose week">${P.weeks.map(w=>`<button class="week-chip ${w.week===week?'chosen':''}" data-week="${w.week}" title="${esc(w.phase)}"><b>${String(w.week).padStart(2,'0')}</b><small>${esc((w.phase||'Training').slice(0,5).toUpperCase())}</small></button>`).join('')}</div>
 <div class="week-summary"><div><strong>${esc(w?.phase||'Training')}</strong><span>${done} of ${all} sets logged this week</span></div><b>${all?Math.round(100*done/all):0}%</b></div><div class="progressbar"><span style="width:${all?100*done/all:0}%"></span></div>
 <div class="sectiontitle subheading"><h2>Training sessions</h2><span class="pill">${sessions.length} days</span></div>
 ${sessions.map(s=>{let n=logsFor(s),tot=countSets(s);return `<button class="daycard" data-session="${esc(s.id)}"><span class="daypill">D${String(s.day).padStart(2,'0')}</span><span class="dayinfo"><strong>${esc(s.title)}</strong><small>${s.rest?esc(s.rest):`${n} / ${tot} sets completed · ${esc(s.phase)}`}</small><span class="tinybar"><i style="width:${tot?n/tot*100:0}%"></i></span></span><span class="arrow">↗</span></button>`}).join('')||'<div class="empty">No sessions scheduled for this week.</div>'}</section>`}
function library(){const count=Object.keys(enrolled).length;return `<div class="pagehead"><span class="eyebrow">${profile?esc(profile.name.toUpperCase())+' / ':''}PROGRAMME LIBRARY</span><h1>Choose your programme<span class="accent">.</span></h1><p>Add a programme to your profile, switch between saved programmes, or import another training block. Each profile has its own progress.</p></div><div class="catalogue-summary"><span>${count} saved to your profile</span><button class="textlink" data-action="profile">View profile ↗</button></div>${programmeSyncIssue?`<div class="notice danger" role="alert"><strong>Programme sync needs attention</strong><p>${esc(programmeSyncIssue)}</p><p>Check the version and format of the published programme, or confirm the Supabase publishing table exists.</p></div>`:''}<div class="programme-list">${programs.map(cardProgramme).join('')}</div><div class="importactions library-import"><button class="btn btn-outline" data-action="import">＋ Import programme</button>${cloudMode?'<button class="btn btn-outline" data-action="syncprogrammes">↻ Sync published programmes</button>':''}<a class="btn btn-outline" href="PEAK_Programme_Template.xlsx" download>↓ Excel template</a></div><div class="callout"><strong>Adding and updating programmes</strong><p>Import a completed PEAK Excel template or compatible JSON file. Supports STANDARD, AMRAP and REP_MAX barbell sets. Each programme has its own maximums. Bloay can publish versioned updates to all cloud athletes; previously started sessions and all training logs are protected.</p></div>`}
function stageTag(s){return s.setType==='AMRAP'?'AMRAP':s.setType==='REP_MAX'?'Rep max':s.stage==='RAMP'?'Ramp':s.stage==='WORK'?'Working':'Accessory'}
function renderExercise(group){
 const x=group[0],classification=x.kind==='ACC'?'accessory':x.family==='SQ'?'squat':x.family==='BP'?'bench':'deadlift';
 const allSkipped=group.every(y=>y.skipped),someSkipped=group.filter(y=>y.skipped).length;
 const groupKeys=esc(JSON.stringify(group.map(y=>y.key)));
 return `<section class="exercise ${classification} ${allSkipped?'exercise-skipped':''}"><div class="exercisehead"><span class="exerciseicon">${x.kind==='ACC'?'ACC':x.family}</span><div class="exercise-title"><h3>${esc(x.name)}</h3><p>${x.kind==='ACC'?'Accessory / hypertrophy':x.stage==='RAMP'?'Technique + working sets':'Barbell loading'} · ${group.length} set${group.length>1?'s':''}${someSkipped?` · ${someSkipped} skipped`:''}</p></div><label class="skip-group"><input type="checkbox" data-skip-movement="${groupKeys}" ${allSkipped?'checked':''}><span>Skip movement</span></label></div>
 <div class="setlabels"><span>Set</span><span>Prescription</span><span>Actual kg</span><span>RPE</span></div>${group.map((s,i)=>{
 const special=['AMRAP','REP_MAX'].includes(s.setType);
 const rpeUnused=s.rpeCapEnabled===false||special;
  const target=s.kind==='BAR'?`${num(s.target)}<small>kg</small>`:(s.repsText?esc(s.repsText):'—');
  const subtitle=s.kind==='BAR'?(special?`${s.setType==='AMRAP'?'AMRAP · target':'Rep max · goal'} ${esc(s.repsText)} reps at ${num(s.original)} kg`:`${esc(s.repsText)} reps · ${f(s.applied*100)}% · ${stageTag(s)}`):`${esc(s.repsText)} reps${s.rir?' · RIR '+esc(s.rir):''}`;
  const prescribed=Number(s.reps),repsInput=Number.isFinite(prescribed)&&prescribed>=0;
  const miss=repsInput&&C.hasNum(s.log.reps)?Math.max(0,prescribed-Number(s.log.reps)):0;
  const outcome=special&&(C.hasNum(s.log.weight)||C.hasNum(s.log.reps))?`<span class="rep-summary"><strong>Outcome:</strong> ${C.hasNum(s.log.weight)?f(s.log.weight)+' kg':'— kg'} × ${C.hasNum(s.log.reps)?f(s.log.reps):'—'} reps${s.goalMet===true?' · Goal met':s.goalMet===false?' · Below goal':''}</span>`:'';
 return `<div class="setrecord ${s.skipped?'is-skipped':''}" data-setrecord="${esc(s.key)}"><div class="setrow ${s.complete?'completed':''} ${s.adjusted?'adjusted':''}" data-setrow="${esc(s.key)}"><div class="setnumber"><span>${s.kind==='ACC'?s.ordinal:String(s.step||i+1).replace(/^.*?\b(\d+)\/(\d+)$/,'$1')||i+1}</span><input type="checkbox" aria-label="Mark set complete" data-done="${esc(s.key)}" ${s.log.done?'checked':''} ${s.skipped?'disabled':''}></div><div class="setprescription"><strong>${target}</strong><small>${subtitle}</small>${s.kind==='BAR'&&s.adjusted?`<em>Adjusted from ${num(s.original)} kg</em>`:''}${rpeUnused?'<span class="rpethreshold">RPE cap: not used</span>':s.cap!==null?`<span class="rpethreshold">Expected ${f(s.expected)} · cap ${f(s.cap)}</span>`:''}${s.status?`<em class="warn">${esc(s.status)} · ${S.applyRpeToAll?'all later movements':'this movement only'}</em>`:''}${s.skipped?'<em>Skipped — not counted as completed</em>':''}${miss?`<em class="warn">${f(miss)} rep${miss===1?'':'s'} missed</em>`:''}</div><input aria-label="Actual weight in kilograms" data-log="${esc(s.key)}" data-field="weight" type="number" min="0" max="1500" step="0.5" inputmode="decimal" placeholder="kg" value="${esc(s.log.weight??'')}" ${s.skipped?'disabled':''}>${rpeUnused?'<span class="rpe-not-used" aria-label="RPE not used for this movement">N/A</span>':`<input aria-label="Actual RPE" data-log="${esc(s.key)}" data-field="rpe" type="number" min="1" max="10" step="0.5" inputmode="decimal" placeholder="RPE" value="${esc(s.log.rpe??'')}" ${s.skipped?'disabled':''}>`}</div><div class="setextras"><label class="actual-reps">Actual reps <input aria-label="Actual repetitions completed" type="number" min="0" max="${special?1000:repsInput?prescribed:1000}" step="1" inputmode="numeric" data-log="${esc(s.key)}" data-field="reps" placeholder="${repsInput?prescribed:'reps'}" value="${esc(s.log.reps??'')}" ${s.skipped?'disabled':''}></label><label class="skip-set"><input type="checkbox" data-skip-set="${esc(s.key)}" ${s.skipped?'checked':''}><span>Skipped set</span></label>${miss?`<span class="rep-summary">${f(s.log.reps)} / ${f(prescribed)} reps performed</span>`:''}${outcome}</div></div>`}).join('')}</section>`;
}
function sessionView(){const s=session();if(!s)return `<div class="empty">Session not found.</div>`;const result=C.calculateSession(s,S),groups=[];for(const set of result.sets){const prev=groups.at(-1);if(prev&&prev[0].name===set.name&&prev[0].code===set.code&&prev[0].kind===set.kind)prev.push(set);else groups.push([set])}
 const skipped=result.sets.filter(x=>x.skipped).length,readiness=C.readinessScore(S,s),off=C.readinessOffsets[readiness];
 const notes=['Significantly reduced load; leave more reps in reserve','Reduced load; keep work comfortable','Planned load; normal effort','Small load increase if form is strong','Modest load increase; never force painful reps'];
 return `<button class="back" data-action="home">← All sessions</button><section class="pagehead sessionheading"><span class="eyebrow">WEEK ${s.week} <span class="sep">/</span> DAY ${s.day} <span class="sep">/</span> ${esc(s.phase)}</span><h1>${esc(s.title)}</h1><p>${C.logCount(S,s)} of ${C.totalCount(s)} sets logged${skipped?` · ${skipped} skipped`:''}</p></section>
 <section class="panel readiness-panel"><div class="readiness-title"><div><span class="eyebrow">BEFORE YOUR SESSION</span><h3>Session readiness</h3></div><span class="readiness-current">${readiness} / 5</span></div><div class="readiness-scale">${[1,2,3,4,5].map(n=>`<button type="button" class="readiness-button ${n===readiness?'selected':''}" data-readiness="${n}" aria-pressed="${n===readiness}">${n}</button>`).join('')}</div><p class="muted">${esc(notes[readiness-1])}. Barbell targets ${off===0?'stay at plan':`${off>0?'+':''}${f(off*100)} percentage points`}; accessory sets should follow the same effort guidance. Logged loads stay fixed.</p></section>
 <section class="panel scope-panel"><label class="scope-checkbox"><input type="checkbox" data-rpe-all ${S.applyRpeToAll?'checked':''}><span><strong>Apply RPE reductions to all movements</strong><small>Off by default. When off, surpassing RPE on one movement only reduces later sets of that same movement.</small></span></label></section>
 ${s.prep?`<section class="warmup"><strong>↗ Movement preparation</strong><p>${esc(s.prep)}</p></section>`:''}
 ${s.rest?`<div class="rest"><div>☾</div><h2>${esc(s.rest)}</h2><p>Recovery is part of the programme. No working sets scheduled.</p></div>`:groups.map(renderExercise).join('')}
 ${result.drop>0?`<div class="notice"><b>RPE safeguard applied (up to ${f(result.drop*100)} percentage points)</b><p>Scope: ${S.applyRpeToAll?'all following movements':'only the movement exceeding its RPE cap'}. Completed set loads remain locked.</p></div>`:''}
 ${result.stop?'<div class="notice danger">RPE reduction limit reached for at least one movement. Review technique and recovery before continuing.</div>':''}
 <div class="btnrow"><button class="btn btn-outline" data-action="exportcsv">↓ Export logs</button><button class="btn btn-primary" data-action="nextsession">Next session →</button></div><p class="micro">Enter actual reps to track missed reps (for example, 3 of 5), or mark a set or entire movement as skipped. Data saves ${cloudMode?'to your online account':'to the selected local profile'}.</p>`;
}
function progress(){let logged=0,total=0,tonnage=0,cap=0,skipped=0,missed=0;const weeks=P.weeks.map(w=>{const stat=C.weekStats(w.week,S);logged+=stat.count;total+=stat.total;tonnage+=stat.tonnage;cap+=stat.capHits;skipped+=stat.skipped;missed+=stat.missed;return {week:w.week,...stat}});const max=Math.max(1,...weeks.map(s=>s.tonnage));return `<div class="pagehead"><span class="eyebrow">TRAINING HISTORY</span><h1>Progress in numbers<span class="accent">.</span></h1><p>Recorded results from your active programme. No planned sets are counted until logged.</p></div>
 <div class="kpis"><div><span>Sets logged</span><strong>${logged}</strong><small>of ${total} prescribed</small></div><div><span>Actual tonnage</span><strong>${f(tonnage/1000)}t</strong><small>barbell work</small></div><div><span>RPE cap hits</span><strong>${cap}</strong><small>${skipped} skipped sets · ${missed} missed reps</small></div><div><span>Weeks</span><strong>${P.weeks.length}</strong><small>programme length</small></div></div>
 <div class="panel"><h3>Completed weekly tonnage</h3><div class="barchart" role="img" aria-label="Weekly completed tonnage">${weeks.map(w=>`<div class="baritem" title="Week ${w.week}: ${f(w.tonnage)} kilograms"><div style="height:${w.tonnage?Math.max(2,100*w.tonnage/max):2}%"></div><small>${w.week===1||w.week%2===0?w.week:''}</small></div>`).join('')}</div><p class="micro">Based on actual weights × repetitions for completed barbell sets.</p></div>
 <div class="panel"><h3>Your data belongs to you</h3><p class="muted">Export this programme's set logs as CSV. Full JSON backups include all profiles, their saved programmes, settings and logs on this device; the app can restore them later.</p><div class="stack"><button class="btn btn-primary" data-action="exportcsv">↓ Export training CSV</button><button class="btn btn-outline" data-action="backup">↓ Back up all profiles</button><button class="btn btn-outline" data-action="restore">↑ Restore backup</button></div></div>`}
function settings(){const c=S.config;function inp(label,group,key,value,detail,step){return `<label class="configrow"><span><b>${esc(label)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span><input type="number" min="0" step="${step||'.1'}" value="${esc(value??0)}" data-setting="${group}" data-key="${esc(key)}"></label>`}
 const movements=[...new Map(P.sessions.flatMap(s=>s.sets).filter(s=>s.kind==='BAR'&&!['SQ','BP','DL'].includes(s.code)).map(s=>[s.code,s])).values()];
 return `<div class="pagehead"><span class="eyebrow">${esc(P.title)} / PROGRAMME SETTINGS</span><h1>Programme maxes<span class="accent">.</span></h1><p>All maximums on this page belong to <strong>${esc(P.title)}</strong> only. Switching programmes switches to that programme's independent maximums; existing workout results stay unchanged.</p></div><div class="panel"><h3>Competition maximums — ${esc(P.title)}</h3>${inp('Squat · kg','maxes','SQ',c.maxes.SQ)}${inp('Bench · kg','maxes','BP',c.maxes.BP)}${inp('Deadlift · kg','maxes','DL',c.maxes.DL)}</div>
 <div class="panel"><h3>Individual movement maximums</h3><p class="muted">Optional absolute max for each variation in <strong>${esc(P.title)}</strong>. Enter 0 to inherit the competition 1RM × movement ratio. Other programmes are unaffected.</p>${movements.map(m=>{const v=c.variation?.[m.code]||{};return inp(m.name+' ('+m.code+')','movementMaxes',m.code,c.movementMaxes?.[m.code]||0,`Estimated: ${f(C.exerciseMax({...m,code:m.code},{...c,movementMaxes:{...c.movementMaxes,[m.code]:0}}))} kg · ${f((v.ratio||1)*100)}% of ${m.family}`,'2.5')}).join('')||'<p class="muted">No variations in this programme.</p>'}</div>
 <div class="panel"><h3>RPE reduction scope</h3><label class="scope-checkbox"><input type="checkbox" data-rpe-all ${S.applyRpeToAll?'checked':''}><span><strong>Apply reductions across all movements</strong><small>Unchecked by default. Otherwise adjustments only affect the same movement.</small></span></label></div>
 <details class="panel"><summary>Advanced RPE safeguard settings</summary><div class="configlist">${Object.entries(c.settings||{}).map(([k,v])=>inp(k,'settings',k,v,'','0.025')).join('')}</div></details>
 <div class="panel"><h3>App installation & updates</h3><p class="muted">The web app receives interface improvements when the website is updated. Training programme changes can be imported as a new Excel or JSON file.</p><button class="btn btn-outline" data-action="checkupdate">Check for web app update</button><p class="micro">Current app: 5.1 · Programme: v${esc(P.version||1)}</p>${S.history?.length?`<h4>Programme update history</h4><ul class="history">${S.history.slice().reverse().map(h=>`<li>${esc(h.date?.slice(0,10))} · v${esc(h.from)} → v${esc(h.to)} · ${h.protected} started sessions preserved</li>`).join('')}</ul>`:''}</div>`}
function render(){if(!profile&&view!=='profiles')view='profiles';else if(profile&&!P&&!['profiles','profile','library','admin'].includes(view))view='profile';header();updatedStatus();$('main').innerHTML=view==='profiles'?chooser():view==='admin'?adminView():view==='profile'?profileView():view==='library'?library():view==='progress'?progress():view==='settings'?settings():view==='session'?sessionView():home()}
function download(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},2000)}
async function backup(){const ps=await all('programmes'),people=await all('profiles'),enrolments=await all('enrolments'),saved=await all('profileStates');download('PEAK_Profiles_Backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'PEAK_TRAINING_BACKUP',version:2,exported:new Date().toISOString(),activeProfileId:profile?.id||'',programmes:ps,profiles:people,enrolments,profileStates:saved},null,2),'application/json')}
function closedModal(){pendingImport=null;$('modal').classList.add('hidden');$('modalBody').innerHTML=''}
function showModal(html){$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')}
function hasEntry(log){return log&&(log.done||C.hasNum(log.weight)||C.hasNum(log.rpe)||C.hasNum(log.reps)||log.status==='skipped')}
function mergeUpdatedProgramme(oldP,newP,oldState){const prev=new Map(oldP.sessions.map(s=>[s.id,s]));let protectedCount=0;const updated=structuredClone(newP);
 const started=old=>Boolean(oldState.readiness&&Object.hasOwn(oldState.readiness,old.id))||old.sets.some(source=>source.kind==='ACC'?Array.from({length:source.count},(_,i)=>hasEntry(oldState.logs?.[source.id+'_s'+(i+1)])).some(Boolean):hasEntry(oldState.logs?.[source.id]));
 // Snapshot the complete original prescription for every session with recorded activity.
 // Changed set IDs, weights, exercises and even removed days cannot orphan logged work.
 updated.sessions=updated.sessions.map(s=>{const old=prev.get(s.id);if(!old||!started(old))return s;protectedCount++;return structuredClone(old)});
 for(const old of oldP.sessions)if(!updated.sessions.some(x=>x.id===old.id)&&started(old)){updated.sessions.push(structuredClone(old));protectedCount++}
 updated.sessions.sort((a,b)=>a.week-b.week||a.day-b.day);
 for(const oldWeek of oldP.weeks)if(updated.sessions.some(s=>s.week===oldWeek.week)&&!updated.weeks.some(w=>w.week===oldWeek.week))updated.weeks.push(structuredClone(oldWeek));
 updated.weeks.sort((a,b)=>a.week-b.week);
 return {updated,protectedCount};
}
async function importProgramme(file){try{const p=await Imp.parseFile(file);const current=programs.find(x=>x.id===p.id),oldState=states[p.id];const hasOld=!!current;
 pendingImport=p;const count=p.sessions.reduce((n,s)=>n+countSets(s),0);
 showModal(`<div class="eyebrow">${hasOld?'PROGRAMME UPDATE':'NEW PROGRAMME'}</div><h2>${esc(p.title)}</h2><p class="muted">${p.weeks.length} weeks · ${p.sessions.length} sessions · ${count} sets · Version ${esc(p.version)}</p><p>${hasOld?`This matches the existing Programme ID <b>${esc(p.id)}</b> (installed version ${esc(current.version||1)}). Started sessions and recorded logs will be preserved. Unstarted sessions will use the imported prescriptions.`:`Install <b>${esc(p.id)}</b> as a new programme? It will be added to your library.`}</p>${hasOld&&Number(p.version)<=Number(current.version)?'<div class="notice danger">Use a higher Version number for updates. Older versions cannot be published.</div>':''}<div class="btnrow"><button class="btn btn-outline" data-action="cancelmodal">Cancel</button><button class="btn btn-outline" data-action="installprogramme">${hasOld?'Install for me':'Add to my library'}</button>${cloudMode&&Cloud.account?.role==='admin'?`<button class="btn btn-primary" data-action="publishprogramme">Publish to all athletes</button>`:''}</div>`);
 }catch(e){console.error(e);showModal(`<div class="eyebrow">IMPORT NOT COMPLETED</div><h2>Could not read programme</h2><p class="notice danger" role="alert">${esc(e.message)}</p><p class="muted">Check that you uploaded a completed PEAK Excel template with Programme Info, Exercises and Sessions sheets, or a compatible programme JSON file. No existing training records were changed.</p><div class="btnrow"><button class="btn btn-primary" data-action="cancelmodal">Close</button></div>`)}}
async function applyProgramme(p,options={}){
 Imp.validate(p);
 const old=programs.find(x=>x.id===p.id);
 if(!old){await put('programmes',structuredClone(p));programs.push(structuredClone(p));if(options.enrol)await enrol(p.id);return {installed:true,protectedCount:0}}
 // No rollback on automatic cloud sync. A manual import can replace the current
 // plan only with explicit confirmation and a NEW version.
 if(Number(p.version)<=Number(old.version||1)&&options.auto)return {installed:false,protectedCount:0};
 const saved=(await all('profileStates')).filter(x=>x.programId===p.id),union={logs:{},readiness:{}};
 for(const item of saved){Object.assign(union.logs,item.data?.logs||{});Object.assign(union.readiness,item.data?.readiness||{})}
 const {updated,protectedCount}=mergeUpdatedProgramme(old,p,union);
 await put('programmes',updated);
 for(const item of saved){
  const st=item.data||freshState(old);st.history=st.history||[];
  st.history.push({date:new Date().toISOString(),from:old.version||1,to:p.version||1,protected:protectedCount,source:options.auto?'admin published':'manual import'});
  const cfg=structuredClone(updated.defaults);
  cfg.maxes={...cfg.maxes,...st.config?.maxes};
  cfg.movementMaxes={...(cfg.movementMaxes||{}),...(st.config?.movementMaxes||{})};
  for(const [key,v] of Object.entries(cfg.variation||{})){
   const oldVariation=st.config?.variation?.[key];
   if(oldVariation?.override>0){v.override=oldVariation.override;if(!(Number(cfg.movementMaxes[key])>0))cfg.movementMaxes[key]=oldVariation.override}
  }
  st.config=cfg;item.data=st;await put('profileStates',item);
  if(item.profileId===profile?.id)states[p.id]=st;
 }
 programs=programs.map(x=>x.id===p.id?updated:x);
 if(activeId===p.id&&isEnrolled(p.id))activate(p.id);
 if(options.enrol&&!isEnrolled(p.id))await enrol(p.id);
 return {installed:true,protectedCount};
}
async function syncPublishedPrograms(quiet=false){
 if(!cloudMode||!Cloud.user)return {updated:0,available:0};
 let releases=[];
 try{releases=await Cloud.publishedPrograms()}catch(error){programmeSyncIssue=error.message;throw error}
 let updated=0,available=0;const errors=[];
 for(const release of releases){
  try{
   const p=Imp.validate(release.content);
   if(p.id!==release.program_id||Number(p.version)!==Number(release.version))throw Error('Programme identity/version mismatch');
   const previous=programs.find(x=>x.id===p.id);
   if(!previous){await applyProgramme(p);available++}
   else if(Number(p.version)>Number(previous.version||1)){await applyProgramme(p,{auto:true});updated++}
  }catch(error){console.warn('Skipped invalid published programme',release.program_id,error);errors.push(`${release.program_id}: ${error.message}`)}
 }
 programmeSyncIssue=errors.join(' | ');
 if(!quiet)alertUser(errors.length?`${errors.length} published programme(s) could not sync — see Library`:`${updated} update(s) installed; ${available} new programme(s) in Library`);
 return {updated,available,errors};
}
async function installProgramme(){const p=pendingImport;if(!p)return;
 try{
  // Administrators explicitly choose global publication. A personal import never
  // silently changes another athlete's plan.
  const result=await applyProgramme(p,{enrol:true});closedModal();switchTo('home');
  alertUser(result.protectedCount?`Programme installed · ${result.protectedCount} started sessions preserved`:'Programme installed');
 }catch(error){alertUser(error.message);console.error(error)}
}
async function publishProgramme(){
 if(!pendingImport||!cloudMode||Cloud.account?.role!=='admin')return;
 const p=pendingImport;
 try{
  await Cloud.publishProgram(p);
 }catch(error){alertUser('Publishing failed: '+error.message);console.error(error);return}
 // Publishing is distinct from enrolment, but the newly published programme
 // should be visible to the publisher immediately. Apply it to the admin's own
 // catalogue without enrolling; signed-in athletes pick it up via normal sync.
 let localError='';
 try{await applyProgramme(p,{auto:true});programmeSyncIssue=''}
 catch(error){localError=error.message;programmeSyncIssue='Published successfully, but your local Library could not refresh: '+localError;console.error(error)}
 closedModal();switchTo('library');
 alertUser(localError?'Programme published; your Library needs a sync':`${p.title} v${p.version} published — select Add to my profile if you want to train it`);
}
async function restoreBackup(file){try{
 const obj=JSON.parse(await file.text());if(obj.format!=='PEAK_TRAINING_BACKUP'||!Array.isArray(obj.programmes))throw Error('Not a PEAK Training backup');
 for(const p of obj.programmes)Imp.validate(p);
 let people,links,saved;
 if(obj.version===2){if(!Array.isArray(obj.profiles)||!Array.isArray(obj.enrolments)||!Array.isArray(obj.profileStates))throw Error('Missing profile information in backup');people=obj.profiles;links=obj.enrolments;saved=obj.profileStates;
  const ids=new Set(people.map(p=>p.id)),pids=new Set(obj.programmes.map(p=>p.id));
  if(people.some(x=>typeof x.id!=='string'||typeof x.name!=='string')||links.some(x=>!ids.has(x.profileId)||!pids.has(x.programId))||saved.some(x=>!ids.has(x.profileId)||!pids.has(x.programId)||!x.data||typeof x.data!=='object'))throw Error('Invalid profile references in backup');
 }else if(obj.version===1&&Array.isArray(obj.states)){
  const restored=profileInitial('Restored profile');people=[restored];links=obj.programmes.map(p=>({id:stateKey(restored.id,p.id),profileId:restored.id,programId:p.id,joinedAt:new Date().toISOString()}));saved=obj.states.map(s=>({id:stateKey(restored.id,s.id),profileId:restored.id,programId:s.id,data:s.data}));restored.activeProgramId=obj.activeId||obj.programmes[0]?.id||'';
 }else throw Error('Unsupported backup version');
 if(cloudMode){
  // Import only the selected athlete from a local backup to this signed-in account.
  // Never silently merge several people's training into one cloud identity.
  const source=people.find(x=>x.id===obj.activeProfileId)||people[0];
  const originalId=source.id,cloudId=Cloud.user.id;
  people=[{...source,id:cloudId}];
  links=links.filter(x=>x.profileId===originalId).map(x=>({...x,profileId:cloudId,id:stateKey(cloudId,x.programId)}));
  saved=saved.filter(x=>x.profileId===originalId).map(x=>({...x,profileId:cloudId,id:stateKey(cloudId,x.programId)}));
  if(obj.profiles?.length>1)alertUser('Only the selected profile will be imported into this online account');
 }
 if(!confirm(`Restore ${people.length} profile(s) and ${obj.programmes.length} programme(s)? This will REPLACE ALL local profiles, programmes and training history on this browser.`))return;
 for(const store of ['programmes','states','profiles','enrolments','profileStates'])for(const item of await all(store))await remove(store,item.id);
 for(const p of obj.programmes)await put('programmes',p);for(const item of people)await put('profiles',item);
 for(const item of links)await put('enrolments',{...item,id:stateKey(item.profileId,item.programId)});
 for(const item of saved)await put('profileStates',{...item,id:stateKey(item.profileId,item.programId)});
 await initData(cloudMode?Cloud.user.id:(obj.activeProfileId||people[0]?.id));render();alertUser('Profiles and programmes restored');
 }catch(e){alertUser('Restore failed: '+e.message);console.error(e)}}
async function setLog(key,field,value){
 const s=session(),before=C.calculateSession(s,S).sets.find(set=>set.key===key);if(!before)return;
 let log={...(S.logs[key]||{})};
 if(field==='skip'){
  if(value)log={status:'skipped',at:new Date().toISOString()};
  else log={};
 }else{
  if(log.status==='skipped')return;
  if(field==='done')log.done=value;
  else if(value==='')delete log[field];
  else{
   const n=Number(value),prescribed=Number(before.reps);
   if(!Number.isFinite(n)||n<0||(field==='rpe'&&(n<1||n>10))||(field==='weight'&&n>1500)||(field==='reps'&&(!Number.isInteger(n)||n>(['AMRAP','REP_MAX'].includes(before.setType)?1000:Number.isFinite(prescribed)?prescribed:1000)))){alertUser('Invalid '+field+(field==='reps'?' — enter completed reps, not planned reps':' '));render();return}
   log[field]=n;
  }
  if(before.kind==='BAR'&&hasEntry(log)&&!C.hasNum(log.lockedPct)){log.lockedPct=before.applied;log.lockedKg=before.target}
 }
 if(hasEntry(log)){log.at=new Date().toISOString();S.logs[key]=log}else delete S.logs[key];
 await saveState();render();
 const after=C.calculateSession(s,S).sets.find(set=>set.key===key);
 if(field==='rpe'&&after?.status)alertUser(after.status+' · '+(S.applyRpeToAll?'all later movements':'later sets of this movement')+' adjusted');
}
async function skipMovement(keys,checked){
 const s=session(),rows=C.calculateSession(s,S).sets,matching=rows.filter(x=>keys.includes(x.key));
 if(checked&&matching.some(x=>x.complete)&&!confirm('Skip this whole movement? Existing entries for its sets will be cleared.')){render();return}
 for(const row of matching){if(checked)S.logs[row.key]={status:'skipped',at:new Date().toISOString()};else if(S.logs[row.key]?.status==='skipped')delete S.logs[row.key]}
 await saveState();render();alertUser(checked?'Movement skipped':'Movement restored');
}
async function updateSetting(group,key,value){const v=Number(value);if(!Number.isFinite(v)||v<0||v>2000){alertUser('Invalid setting');render();return}if(group==='movementMaxes'){S.config.movementMaxes=S.config.movementMaxes||{};S.config.movementMaxes[key]=v||0}else if(group==='variation'){if(!S.config.variation[key])return;S.config.variation[key].override=v||null}else if(S.config[group]&&key in S.config[group])S.config[group][key]=v;await saveState();render();alertUser('Setting saved')}
async function initData(preferredProfile){
 const builtin=await (await fetch('builtin-program.json')).json();window.PEAK_TEMPLATE_DEFAULTS=structuredClone(builtin.defaults);const records=await all('programmes');
 const savedBuiltin=records.find(p=>p.id===builtin.id);
 if(!savedBuiltin){await put('programmes',builtin);records.push(builtin)}
 else if(savedBuiltin.title==='PEAK / 105 · 20-week competition peak'){
  savedBuiltin.title='Example #1';await put('programmes',savedBuiltin);
 }
 programs=records;
 profiles=await all('profiles');
 if(!profiles.length&&cloudMode){const person=profileInitial(Cloud.account?.username||'Athlete');await put('profiles',person);profiles=[person]}
 if(!profiles.length){
  const oldStates=await all('states');
  if(oldStates.length){
   // One-time migration from v1, preserving logged work and imported programmes.
   const person=profileInitial('My training');person.activeProgramId=localStorage.getItem('peak-active-programme')||builtin.id;
   await put('profiles',person);profiles=[person];
   for(const p of records)await put('enrolments',{id:stateKey(person.id,p.id),profileId:person.id,programId:p.id,joinedAt:new Date().toISOString()});
   for(const item of oldStates)await put('profileStates',{id:stateKey(person.id,item.id),profileId:person.id,programId:item.id,data:item.data});
  }else{
   // Legacy localStorage export on older origins, if present.
   try{const legacy=JSON.parse(localStorage.getItem('peak105-state'));if(legacy?.logs){const person=profileInitial('My training');person.activeProgramId=builtin.id;await put('profiles',person);profiles=[person];await put('enrolments',{id:stateKey(person.id,builtin.id),profileId:person.id,programId:builtin.id,joinedAt:new Date().toISOString()});await put('profileStates',{id:stateKey(person.id,builtin.id),profileId:person.id,programId:builtin.id,data:{...freshState(builtin),...legacy}})}}catch(e){console.warn('Could not migrate legacy state',e)}
  }
 }
 const id=preferredProfile||localStorage.getItem('peak-active-profile');
 const selected=profiles.find(p=>p.id===id)||(profiles.length===1?profiles[0]:null);
 await loadProfile(selected);
 if(cloudMode){
  try{await syncPublishedPrograms(true)}catch(error){console.warn('Programme updates unavailable:',error.message);programmeSyncIssue=error.message;alertUser('Published programmes unavailable — see Library')}
 }
}
document.addEventListener('click',async e=>{
 const selectedAdmin=e.target.closest('[data-admin-user]');if(selectedAdmin&&cloudMode&&Cloud.account?.role==='admin'){adminSelected=selectedAdmin.dataset.adminUser;adminDocs=null;adminProgramme=null;adminLoading=true;adminError='';render();try{adminDocs=await Cloud.adminAthleteDocuments(adminSelected)}catch(err){adminError=err.message}finally{adminLoading=false;render()}return}
 const selectedProgramme=e.target.closest('[data-admin-program]');if(selectedProgramme&&cloudMode&&Cloud.account?.role==='admin'){adminProgramme=selectedProgramme.dataset.adminProgram;render();return}
 const chosen=e.target.closest('[data-choose-profile]');if(chosen){const person=profiles.find(p=>p.id===chosen.dataset.chooseProfile);if(person){await loadProfile(person);render()}return}
 const ready=e.target.closest('[data-readiness]');if(ready&&S){const n=Number(ready.dataset.readiness);S.readiness=S.readiness||{};S.readiness[sessionId]=n;await saveState();render();alertUser('Session readiness set to '+n+'/5');return}
 const nav=e.target.closest('[data-nav]');if(nav){switchTo(nav.dataset.nav);return}
 const sessionButton=e.target.closest('[data-session]');if(sessionButton&&P){sessionId=sessionButton.dataset.session;await saveState();switchTo('session');return}
 const weekButton=e.target.closest('[data-week]');if(weekButton&&P){week=Number(weekButton.dataset.week);await saveState();render();return}
 const open=e.target.closest('[data-open-programme]');if(open){if(isEnrolled(open.dataset.openProgramme)){activate(open.dataset.openProgramme);await saveState();switchTo('home')}else await enrol(open.dataset.openProgramme);return}
 const del=e.target.closest('[data-remove-programme]');if(del){await unenrol(del.dataset.removeProgramme);return}
 const a=e.target.closest('[data-action]');if(!a)return;const cmd=a.dataset.action;
 if(['home','library','progress','settings','profile','profiles'].includes(cmd)){switchTo(cmd);return}
 if(cmd==='authswitch'){authMode=authMode==='signup'?'login':'signup';authNotice='';render();return}
 if(cmd==='authforgot'){authMode='forgot';authNotice='';render();return}
 if(cmd==='authlogin'){authMode='login';authNotice='';render();return}
 if(cmd==='signout'&&cloudMode){await Cloud.signout();profile=null;profiles=[];programs=[];enrolled={};states={};activeId='';P=null;S=null;adminCache=null;adminDocs=null;adminSelected=null;authMode='login';authNotice='Signed out.';view='profiles';render();return}
 if(cmd==='admin'&&cloudMode&&Cloud.account?.role==='admin'){view='admin';adminSelected=null;adminDocs=null;adminError='';try{adminCache=await Cloud.adminOverview()}catch(err){alertUser(err.message);return}render();return}
 if(cmd==='adminrefresh'&&cloudMode&&Cloud.account?.role==='admin'){try{adminCache=await Cloud.adminOverview();adminSelected=null;adminDocs=null;render();alertUser('Account list refreshed')}catch(err){alertUser(err.message)}return}
 if(cmd==='refreshaccount'&&cloudMode){try{await Cloud.refresh();render();alertUser('Account details refreshed')}catch(err){alertUser(err.message)}return}
 if(cmd==='changeemail'&&cloudMode){showModal(`<div class="eyebrow">ACCOUNT EMAIL</div><h2>Change sign-in email</h2><p>Supabase may require confirmation at both the current and new email addresses.</p><form id="changeEmailForm" class="profile-form"><label for="newAccountEmail">New email</label><input type="email" id="newAccountEmail" name="email" required autocomplete="email"><div class="btnrow"><button type="button" class="btn btn-outline" data-action="cancelmodal">Cancel</button><button class="btn btn-primary" type="submit">Request change</button></div></form>`);return}
 if(cmd==='switchprofile'){if(cloudMode){alertUser('Sign out to change online accounts');return}await loadProfile(null);render();return}
 if(cmd==='renameprofile'&&profile){showModal(`<div class="eyebrow">EDIT PROFILE</div><h2>Change profile name</h2><form id="renameProfileForm" class="profile-form"><label for="renameName">Display name</label><input id="renameName" name="name" required minlength="2" maxlength="40" value="${esc(profile.name)}"><div class="btnrow"><button type="button" class="btn btn-outline" data-action="cancelmodal">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></form>`);return}
 if(cmd==='deleteprofile'&&profile){const person=profile;if(!confirm(`Permanently delete ${person.name}'s local profile and ALL of their saved programmes, logs and settings? Export a backup first if needed.`))return;
  for(const item of await all('enrolments'))if(item.profileId===person.id)await remove('enrolments',item.id);
  for(const item of await all('profileStates'))if(item.profileId===person.id)await remove('profileStates',item.id);
  await remove('profiles',person.id);profiles=profiles.filter(p=>p.id!==person.id);await loadProfile(null);render();alertUser('Profile deleted');return}
 if(cmd==='import'||(cmd==='adminupload'&&cloudMode&&Cloud.account?.role==='admin')){$('importFile').click();return}
 if(cmd==='publishprogramme'&&cloudMode&&Cloud.account?.role==='admin'){await publishProgramme();return}
 if(cmd==='syncprogrammes'&&cloudMode){try{await syncPublishedPrograms();render()}catch(error){programmeSyncIssue=error.message;render();alertUser('Programme sync failed — see details in Library')}return}
 if(cmd==='restore'){$('restoreFile').click();return}
 if(cmd==='exportcsv'&&P){download(slug(P.title)+'_training.csv',C.makeCSV(S),'text/csv;charset=utf-8');alertUser('CSV exported');return}
 if(cmd==='backup'){await backup();alertUser('All local profiles backed up');return}
 if(cmd==='cancelmodal'){closedModal();return}
 if(cmd==='installprogramme'){await installProgramme();return}
 if(cmd==='nextsession'&&P){const i=P.sessions.findIndex(s=>s.id===sessionId);sessionId=P.sessions[Math.min(P.sessions.length-1,i+1)].id;week=P.sessions[Math.min(P.sessions.length-1,i+1)].week;await saveState();render();window.scrollTo(0,0);return}
 if(cmd==='checkupdate'){if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();alertUser('Checked for web app updates. Reload if a new version is available.')}else alertUser('Updates require HTTPS or localhost.');return}
});
document.addEventListener('submit',async e=>{
 if(cloudMode&&(e.target.id==='loginAuthForm'||e.target.id==='signupAuthForm')){
  e.preventDefault();const fd=new FormData(e.target),email=String(fd.get('email')||'').trim(),password=String(fd.get('password')||'');
  const button=e.target.querySelector('[type=submit]');button.disabled=true;authNotice='';
  try{
   if(e.target.id==='signupAuthForm'){
    const signedIn=await Cloud.signup(fd.get('username'),email,password);
    if(!signedIn){authMode='login';authNotice='Check your email for a confirmation link, then sign in.';render();return}
   }else await Cloud.login(email,password);
   await initData();authMode='login';authNotice='';render();alertUser('Signed in securely');
  }catch(err){authNotice=err.message;render()}
  return;
 }
 if(cloudMode&&e.target.id==='forgotPasswordForm'){
  e.preventDefault();const fd=new FormData(e.target),email=String(fd.get('email')||'').trim();const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
  try{await Cloud.sendPasswordReset(email);authNotice='If an account exists for this email, a recovery link has been sent. Check your inbox and spam folder.'}catch(err){authNotice='Unable to send email: '+err.message}
  render();return;
 }
 if(cloudMode&&e.target.id==='resetPasswordForm'){
  e.preventDefault();const fd=new FormData(e.target),password=String(fd.get('password')||''),confirmation=String(fd.get('confirm')||'');
  if(password!==confirmation){authNotice='The two passwords do not match.';render();return}
  const btn=e.target.querySelector('[type=submit]');btn.disabled=true;
  try{await Cloud.finishPasswordReset(password);authMode='login';authNotice='';await initData();switchTo('profile');alertUser('Password successfully changed')}
  catch(err){authNotice=err.message;render()}return;
 }
 if(cloudMode&&e.target.id==='changeEmailForm'){
  e.preventDefault();const newEmail=String(new FormData(e.target).get('email')||'').trim();
  try{await Cloud.changeEmail(newEmail);closedModal();alertUser('Email change requested. Confirm the email messages before signing in with the new address.')}catch(err){alertUser(err.message)}return;
 }
 if(e.target.id==='createProfileForm'){e.preventDefault();await createProfile(new FormData(e.target).get('name'))}
 if(e.target.id==='renameProfileForm'){e.preventDefault();const name=String(new FormData(e.target).get('name')||'').trim().replace(/\s+/g,' ');if(!profile||name.length<2||name.length>40){alertUser('Enter a name from 2 to 40 characters');return}profile.name=name;await put('profiles',profile);closedModal();render();alertUser('Name updated')}
});
document.addEventListener('change',async e=>{const t=e.target;if(t.id==='importFile'){if(t.files?.[0])await importProgramme(t.files[0]);t.value='';return}if(t.id==='restoreFile'){if(t.files?.[0])await restoreBackup(t.files[0]);t.value='';return}
 if(t.dataset.readiness){return}
 if(t.hasAttribute('data-rpe-all')){S.applyRpeToAll=t.checked;await saveState();render();alertUser(t.checked?'RPE scope: all movements':'RPE scope: movement only');return}
 if(t.hasAttribute('data-skip-movement')){await skipMovement(JSON.parse(t.dataset.skipMovement),t.checked);return}
 if(t.dataset.skipSet){if(t.checked&&hasEntry(S.logs[t.dataset.skipSet])&&!confirm('Skip set and clear its recorded numbers?')){render();return}await setLog(t.dataset.skipSet,'skip',t.checked);return}
 if(t.dataset.log)await setLog(t.dataset.log,t.dataset.field,t.value);
 else if(t.dataset.done)await setLog(t.dataset.done,'done',t.checked);
 else if(t.dataset.setting)await updateSetting(t.dataset.setting,t.dataset.key,t.value)
});
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closedModal()});
window.addEventListener('peak-password-recovery',()=>{authMode='reset';authNotice='';view='profiles';render()});
window.addEventListener('online',updatedStatus);window.addEventListener('offline',updatedStatus);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
try{if(cloudMode){await Cloud.initialize();if(Cloud.user&&!Cloud.recoveryPending)await initData();else view='profiles';if(Cloud.recoveryPending)authMode='reset'}else{db=await openDB();await initData()}render();if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(console.error)}}catch(e){console.error(e);$('main').innerHTML=`<div class="pagehead"><h1>Unable to open your data</h1><p>${esc(e.message)}. Please check browser storage permissions and reload.</p></div>`}
})();
