(async function(){'use strict';
const $=id=>document.getElementById(id),C=window.PeakCore,Imp=window.PeakImport;
const DB='peak-training-data', DBVER=2;let db,programs=[],profiles=[],profile=null,enrolled={},states={},activeId='',P=null,S=null,view='profiles',week=1,sessionId='',toastTimer=null,pendingImport=null,installPrompt=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n||0).toLocaleString('en-GB',{maximumFractionDigits:1}),f=n=>Number(n||0).toFixed(1).replace(/\.0$/,''),slug=s=>String(s||'').replace(/[^a-z0-9]+/ig,'_').slice(0,60);
const countSets=s=>s.sets.reduce((n,x)=>n+(x.kind==='ACC'?x.count:1),0);
const freshState=p=>({logs:{},config:JSON.parse(JSON.stringify(p.defaults)),week:1,sessionId:p.sessions[0]?.id||'',history:[]});
const tx=(store,mode='readonly')=>db.transaction(store,mode).objectStore(store);
function req(r){return new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}
function openDB(){return new Promise((yes,no)=>{const r=indexedDB.open(DB,DBVER);r.onupgradeneeded=()=>{const d=r.result;for(const s of ['programmes','states','profiles','enrolments','profileStates'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'})};r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)})}
async function get(store,id){return req(tx(store).get(id))}
async function all(store){return req(tx(store).getAll())}
async function put(store,obj){await req(tx(store,'readwrite').put(obj))}
async function remove(store,id){await req(tx(store,'readwrite').delete(id))}
function alertUser(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200)}
const stateKey=(profileId,programmeId)=>JSON.stringify([profileId,programmeId]);
const profileInitial=name=>({id:(crypto.randomUUID?crypto.randomUUID():('local-'+Date.now()+'-'+Math.random().toString(36).slice(2))),name,createdAt:new Date().toISOString(),activeProgramId:''});
const isEnrolled=id=>!!enrolled[id];
function activate(id){
 if(!profile||!isEnrolled(id))return false;
 const p=programs.find(x=>x.id===id);if(!p)return false;
 activeId=id;P=p;window.PROGRAM=p;S=states[id]||freshState(p);states[id]=S;
 S.config=S.config||structuredClone(p.defaults);
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
function header(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));document.body.classList.toggle('no-profile',!profile);$('profileShortcut').textContent=profile?profile.name.slice(0,1).toUpperCase():'+';$('profileShortcut').setAttribute('aria-label',profile?'Open '+profile.name+' profile':'Choose profile')}
function loadRatio(group){return Object.values(S.config.maxes).map(Number).reduce((a,b)=>a+b,0)}
function cardProgramme(p){const added=isEnrolled(p.id);const state=added?(states[p.id]||freshState(p)):freshState(p);const total=p.sessions.reduce((n,s)=>n+countSets(s),0),logged=Object.values(state.logs||{}).filter(x=>x&&(x.done||C.hasNum(x.weight)||C.hasNum(x.rpe))).length;
 return `<article class="programme ${p.id===activeId?'is-active':''}"><div class="programmetop"><span class="programicon">${p.id===activeId?'▲':'▦'}</span><span class="version">${added?'IN YOUR PROFILE':'AVAILABLE'} · v${esc(p.version||1)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description||'Custom strength programme')}</p><div class="mutedrow"><span>${p.weeks.length} weeks</span><span>${p.sessions.length} sessions</span>${added?`<span>${logged}/${total} sets logged</span>`:''}</div>${added?`<div class="progressbar"><span style="width:${Math.min(100,100*logged/Math.max(1,total))}%"></span></div>`:''}<div class="pair"><button class="btn ${added&&p.id===activeId?'btn-outline':'btn-primary'}" data-open-programme="${esc(p.id)}">${added?(p.id===activeId?'Continue training':'Switch to programme'):'＋ Add to my profile'}</button>${added?`<button class="btn btn-danger-ghost" data-remove-programme="${esc(p.id)}" aria-label="Remove programme from your profile">Remove</button>`:''}</div></article>`}
function chooser(){return `<div class="profile-welcome"><div class="eyebrow"><span class="pulse"></span> WELCOME TO PEAK</div><h1>Your training.<br><span class="accent">Your profile.</span></h1><p>Create a profile to save your own programmes, training logs and progress on this device.</p></div>
 <div class="panel"><h3>Create a profile</h3><form id="createProfileForm" class="profile-form"><label for="profileName">Profile name</label><input required minlength="2" maxlength="40" id="profileName" name="name" placeholder="e.g. Alex" autocomplete="nickname"><button class="btn btn-primary" type="submit">Create profile →</button></form></div>
 ${profiles.length?`<section class="space"><div class="sectiontitle"><h2>Choose an existing profile</h2></div><div class="profile-grid">${profiles.map(person=>`<button class="profile-person" data-choose-profile="${esc(person.id)}"><span class="profile-initial">${esc(person.name.slice(0,1).toUpperCase())}</span><span><strong>${esc(person.name)}</strong><small>Continue training →</small></span></button>`).join('')}</div></section>`:''}
 <div class="importactions"><button class="btn btn-outline" data-action="restore">↑ Restore existing PEAK backup</button></div><p class="micro">Profiles in this version are local to this browser, not password-protected accounts. To access your training on another device, make a JSON backup and restore it there.</p>`}
function profileView(){if(!profile)return chooser();const mine=programs.filter(p=>isEnrolled(p.id)),available=programs.filter(p=>!isEnrolled(p.id));return `<div class="profile-hero"><div class="profile-initial profile-initial-large">${esc(profile.name.slice(0,1).toUpperCase())}</div><div><span class="eyebrow">YOUR ATHLETE PROFILE</span><h1>${esc(profile.name)}<span class="accent">.</span></h1><p>Joined ${esc(new Date(profile.createdAt).toLocaleDateString('en-GB',{month:'short',year:'numeric'}))}</p></div></div>
 <div class="profile-actions"><button class="btn btn-outline" data-action="renameprofile">Edit name</button><button class="btn btn-outline" data-action="switchprofile">Switch profile</button></div>
 <div class="sectiontitle profile-section"><div><span class="eyebrow">SAVED TO YOUR PROFILE</span><h2>My programmes</h2></div><span class="pill">${mine.length} added</span></div>
 ${mine.length?`<div class="programme-list">${mine.map(cardProgramme).join('')}</div>`:`<div class="empty-profile"><span>▦</span><h3>No programmes yet</h3><p>Pick a programme below to add it to your profile and start tracking.</p></div>`}
 ${available.length?`<div class="sectiontitle profile-section"><div><span class="eyebrow">PROGRAMME CATALOGUE</span><h2>Explore programmes</h2></div></div><div class="programme-list">${available.map(cardProgramme).join('')}</div>`:''}
 <div class="profile-data"><strong>Keep your training safe</strong><p>Save a backup of all profiles and training history, or restore an existing backup.</p><div class="pair"><button class="btn btn-outline" data-action="backup">↓ Back up profiles</button><button class="btn btn-outline" data-action="restore">↑ Restore backup</button></div></div>
 <div class="profile-bottom"><button class="textlink" data-action="library">Browse all programmes ↗</button><button class="textlink dangerlink" data-action="deleteprofile">Delete this profile</button></div><p class="micro">Saved on this browser only. This is not an online account or shared-device privacy barrier. Use Progress → JSON backup to transfer your data.</p>`}
function home(){const w=activeWeek(),sessions=P.sessions.filter(s=>s.week===week),done=sessions.reduce((n,s)=>n+logsFor(s),0),all=sessions.reduce((n,s)=>n+countSets(s),0);
 return `<section class="intro"><div class="eyebrow"><span class="pulse"></span> ACTIVE PROGRAMME <span class="sep">/</span> VERSION ${esc(P.version||1)}</div><h1>${esc(P.title)}</h1><p class="lead">${esc(P.description||'Progress built one set at a time.')}</p><div class="herostats"><div><span>Squat 1RM</span><strong>${num(S.config.maxes.SQ)}<small> kg</small></strong></div><div><span>Bench 1RM</span><strong>${num(S.config.maxes.BP)}<small> kg</small></strong></div><div><span>Deadlift 1RM</span><strong>${num(S.config.maxes.DL)}<small> kg</small></strong></div></div></section>
 <section class="space"><div class="sectiontitle"><div><span class="eyebrow">YOUR CURRENT BLOCK</span><h2>Week ${week} <small>of ${P.weeks.length}</small></h2></div><button class="textlink" data-action="library">Change programme ↗</button></div>
 <div class="weeklist" role="group" aria-label="Choose week">${P.weeks.map(w=>`<button class="week-chip ${w.week===week?'chosen':''}" data-week="${w.week}" title="${esc(w.phase)}"><b>${String(w.week).padStart(2,'0')}</b><small>${esc((w.phase||'Training').slice(0,5).toUpperCase())}</small></button>`).join('')}</div>
 <div class="week-summary"><div><strong>${esc(w?.phase||'Training')}</strong><span>${done} of ${all} sets logged this week</span></div><b>${all?Math.round(100*done/all):0}%</b></div><div class="progressbar"><span style="width:${all?100*done/all:0}%"></span></div>
 <div class="sectiontitle subheading"><h2>Training sessions</h2><span class="pill">${sessions.length} days</span></div>
 ${sessions.map(s=>{let n=logsFor(s),tot=countSets(s);return `<button class="daycard" data-session="${esc(s.id)}"><span class="daypill">D${String(s.day).padStart(2,'0')}</span><span class="dayinfo"><strong>${esc(s.title)}</strong><small>${s.rest?esc(s.rest):`${n} / ${tot} sets completed · ${esc(s.phase)}`}</small><span class="tinybar"><i style="width:${tot?n/tot*100:0}%"></i></span></span><span class="arrow">↗</span></button>`}).join('')||'<div class="empty">No sessions scheduled for this week.</div>'}</section>`}
function library(){const count=Object.keys(enrolled).length;return `<div class="pagehead"><span class="eyebrow">${profile?esc(profile.name.toUpperCase())+' / ':''}PROGRAMME LIBRARY</span><h1>Choose your programme<span class="accent">.</span></h1><p>Add a programme to your profile, switch between saved programmes, or import another training block. Each profile has its own progress.</p></div><div class="catalogue-summary"><span>${count} saved to your profile</span><button class="textlink" data-action="profile">View profile ↗</button></div><div class="programme-list">${programs.map(cardProgramme).join('')}</div><div class="importactions library-import"><button class="btn btn-outline" data-action="import">＋ Import programme</button><a class="btn btn-outline" href="PEAK_Programme_Template.xlsx" download>↓ Excel template</a></div><div class="callout"><strong>Adding and updating programmes</strong><p>Import a completed PEAK Excel template or compatible JSON file. New programmes are added to the catalogue and your profile. A matching Programme ID updates the programme while protecting logged sets across local profiles.</p></div>`}
function stageTag(s){return s.stage==='RAMP'?'Ramp':s.stage==='WORK'?'Working':'Accessory'}
function renderExercise(group){let x=group[0],classification=x.kind==='ACC'?'accessory':x.family==='SQ'?'squat':x.family==='BP'?'bench':'deadlift';return `<section class="exercise ${classification}"><div class="exercisehead"><span class="exerciseicon">${x.kind==='ACC'?'ACC':x.family}</span><div><h3>${esc(x.name)}</h3><p>${x.kind==='ACC'?'Accessory / hypertrophy':x.stage==='RAMP'?'Technique + working sets':'Barbell loading'} · ${group.length} set${group.length>1?'s':''}</p></div></div><div class="setlabels"><span>Set</span><span>Prescription</span><span>Actual kg</span><span>RPE</span></div>${group.map((s,i)=>{
 const target=s.kind==='BAR'?`${num(s.target)}<small>kg</small>`:(s.repsText?esc(s.repsText):'—');
 const subtitle=s.kind==='BAR'?`${esc(s.repsText)} reps · ${f(s.applied*100)}% · ${stageTag(s)}`:`${esc(s.repsText)} reps${s.rir?' · RIR '+esc(s.rir):''}`;
 return `<div class="setrow ${s.complete?'completed':''} ${s.adjusted?'adjusted':''}" data-setrow="${esc(s.key)}"><div class="setnumber"><span>${s.kind==='ACC'?s.ordinal:s.step.replace(/^.*?\b(\d+)\/(\d+)$/,'$1')||i+1}</span><input type="checkbox" aria-label="Mark set complete" data-done="${esc(s.key)}" ${s.log.done?'checked':''}></div><div class="setprescription"><strong>${target}</strong><small>${subtitle}</small>${s.kind==='BAR'&&s.adjusted?`<em>Adjusted from ${num(s.original)} kg</em>`:''}${s.cap!==null?`<span class="rpethreshold">Expected ${f(s.expected)} · cap ${f(s.cap)}</span>`:''}${s.status?`<em class="warn">${esc(s.status)} · later loads reduced</em>`:''}</div><input aria-label="Actual weight in kilograms" data-log="${esc(s.key)}" data-field="weight" type="number" min="0" max="1500" step="0.5" inputmode="decimal" placeholder="kg" value="${esc(s.log.weight??'')}"><input aria-label="Actual RPE" data-log="${esc(s.key)}" data-field="rpe" type="number" min="1" max="10" step="0.5" inputmode="decimal" placeholder="RPE" value="${esc(s.log.rpe??'')}"></div>`}).join('')}</section>`}
function sessionView(){const s=session();if(!s)return `<div class="empty">Session not found.</div>`;const result=C.calculateSession(s,S),groups=[];for(const set of result.sets){const prev=groups.at(-1);if(prev&&prev[0].name===set.name&&prev[0].code===set.code&&prev[0].kind===set.kind)prev.push(set);else groups.push([set])}
 return `<button class="back" data-action="home">← All sessions</button><section class="pagehead sessionheading"><span class="eyebrow">WEEK ${s.week} <span class="sep">/</span> DAY ${s.day} <span class="sep">/</span> ${esc(s.phase)}</span><h1>${esc(s.title)}</h1><p>${C.logCount(S,s)} of ${C.totalCount(s)} sets logged</p></section>${s.prep?`<section class="warmup"><strong>↗ Movement preparation</strong><p>${esc(s.prep)}</p></section>`:''}
 ${s.rest?`<div class="rest"><div>☾</div><h2>${esc(s.rest)}</h2><p>Recovery is part of the programme. No working sets scheduled.</p></div>`:groups.map(renderExercise).join('')}
 ${result.drop>0?`<div class="notice"><b>${f(result.drop*100)} percentage-point session reduction applied</b><p>RPE safeguard affects subsequent uncompleted barbell sets only; finished prescriptions stay locked.</p></div>`:''}
 ${result.stop?'<div class="notice danger">Daily load-reduction limit reached. Review the session before continuing.</div>':''}
 <div class="btnrow"><button class="btn btn-outline" data-action="exportcsv">↓ Export logs</button><button class="btn btn-primary" data-action="nextsession">Next session →</button></div><p class="micro">Weights and RPE entries save to your selected profile on this device. Enter an RPE of 1–10; later set prescriptions will recalculate after the field is saved.</p>`}
function progress(){let logged=0,total=0,tonnage=0,cap=0;const weeks=P.weeks.map(w=>{const stat=C.weekStats(w.week,S);logged+=stat.count;total+=stat.total;tonnage+=stat.tonnage;cap+=stat.capHits;return {week:w.week,...stat}});const max=Math.max(1,...weeks.map(s=>s.tonnage));return `<div class="pagehead"><span class="eyebrow">TRAINING HISTORY</span><h1>Progress in numbers<span class="accent">.</span></h1><p>Recorded results from your active programme. No planned sets are counted until logged.</p></div>
 <div class="kpis"><div><span>Sets logged</span><strong>${logged}</strong><small>of ${total} prescribed</small></div><div><span>Actual tonnage</span><strong>${f(tonnage/1000)}t</strong><small>barbell work</small></div><div><span>RPE cap hits</span><strong>${cap}</strong><small>adaptation alerts</small></div><div><span>Weeks</span><strong>${P.weeks.length}</strong><small>programme length</small></div></div>
 <div class="panel"><h3>Completed weekly tonnage</h3><div class="barchart" role="img" aria-label="Weekly completed tonnage">${weeks.map(w=>`<div class="baritem" title="Week ${w.week}: ${f(w.tonnage)} kilograms"><div style="height:${w.tonnage?Math.max(2,100*w.tonnage/max):2}%"></div><small>${w.week===1||w.week%2===0?w.week:''}</small></div>`).join('')}</div><p class="micro">Based on actual weights × repetitions for completed barbell sets.</p></div>
 <div class="panel"><h3>Your data belongs to you</h3><p class="muted">Export this programme's set logs as CSV. Full JSON backups include all profiles, their saved programmes, settings and logs on this device; the app can restore them later.</p><div class="stack"><button class="btn btn-primary" data-action="exportcsv">↓ Export training CSV</button><button class="btn btn-outline" data-action="backup">↓ Back up all profiles</button><button class="btn btn-outline" data-action="restore">↑ Restore backup</button></div></div>`}
function settings(){const c=S.config;function inp(label,group,key,value,detail,step){return `<label class="configrow"><span><b>${esc(label)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span><input type="number" min="0" step="${step||'.1'}" value="${esc(value??0)}" data-setting="${group}" data-key="${esc(key)}"></label>`}
 return `<div class="pagehead"><span class="eyebrow">ATHLETE + TRAINING ENGINE</span><h1>Your settings<span class="accent">.</span></h1><p>Change lift maximums or the RPE engine. Future uncompleted sets recalculate automatically.</p></div><div class="panel"><h3>Competition maximums</h3>${inp('Squat · kg','maxes','SQ',c.maxes.SQ)}${inp('Bench · kg','maxes','BP',c.maxes.BP)}${inp('Deadlift · kg','maxes','DL',c.maxes.DL)}</div>
 <div class="panel"><h3>Variation maximum overrides</h3><p class="muted">0 uses the competition 1RM × variation ratio.</p>${Object.entries(c.variation||{}).map(([key,v])=>inp(v.name||key,'variation',key,v.override||0,`${f(v.ratio*100)}% of ${v.family}`,'2.5')).join('')||'<p class="muted">No variations in this programme.</p>'}</div>
 <details class="panel"><summary>Advanced RPE safeguard settings</summary><div class="configlist">${Object.entries(c.settings||{}).map(([k,v])=>inp(k,'settings',k,v,'','0.025')).join('')}</div></details>
 <div class="panel"><h3>App installation & updates</h3><p class="muted">The web app receives interface improvements when the website is updated. Training programme changes can be imported as a new Excel or JSON file.</p><button class="btn btn-outline" data-action="checkupdate">Check for web app update</button><p class="micro">Current app: 2.0 · Programme: v${esc(P.version||1)}</p>${S.history?.length?`<h4>Programme update history</h4><ul class="history">${S.history.slice().reverse().map(h=>`<li>${esc(h.date?.slice(0,10))} · v${esc(h.from)} → v${esc(h.to)} · ${h.protected} started sessions preserved</li>`).join('')}</ul>`:''}</div>`}
function render(){if(!profile&&view!=='profiles')view='profiles';else if(profile&&!P&&!['profiles','profile','library'].includes(view))view='profile';header();updatedStatus();$('main').innerHTML=view==='profiles'?chooser():view==='profile'?profileView():view==='library'?library():view==='progress'?progress():view==='settings'?settings():view==='session'?sessionView():home()}
function download(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},2000)}
async function backup(){const ps=await all('programmes'),people=await all('profiles'),enrolments=await all('enrolments'),saved=await all('profileStates');download('PEAK_Profiles_Backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({format:'PEAK_TRAINING_BACKUP',version:2,exported:new Date().toISOString(),activeProfileId:profile?.id||'',programmes:ps,profiles:people,enrolments,profileStates:saved},null,2),'application/json')}
function closedModal(){pendingImport=null;$('modal').classList.add('hidden');$('modalBody').innerHTML=''}
function showModal(html){$('modalBody').innerHTML=html;$('modal').classList.remove('hidden')}
function hasEntry(log){return log&&(log.done||C.hasNum(log.weight)||C.hasNum(log.rpe))}
function mergeUpdatedProgramme(oldP,newP,oldState){const prev=new Map(oldP.sessions.map(s=>[s.id,s]));let protectedCount=0;const updated=structuredClone(newP);
 updated.sessions=updated.sessions.map(s=>{const old=prev.get(s.id);if(!old)return s;let protectedThis=false;for(const source of old.sets){if(source.kind==='ACC'){for(let i=1;i<=source.count;i++)if(hasEntry(oldState.logs[source.id+'_s'+i]))protectedThis=true}else if(hasEntry(oldState.logs[source.id]))protectedThis=true}if(protectedThis){protectedCount++;return old}return s});
 // Preserve fully completed sessions that disappear from the update.
 for(const old of oldP.sessions)if(!updated.sessions.some(x=>x.id===old.id)){let keep=old.sets.some(source=>source.kind==='ACC'?Array.from({length:source.count},(_,i)=>hasEntry(oldState.logs[source.id+'_s'+(i+1)])).some(Boolean):hasEntry(oldState.logs[source.id]));if(keep){updated.sessions.push(old);protectedCount++}}
 updated.sessions.sort((a,b)=>a.week-b.week||a.day-b.day);
 for(const oldWeek of oldP.weeks){if(updated.sessions.some(s=>s.week===oldWeek.week)&&!updated.weeks.some(w=>w.week===oldWeek.week))updated.weeks.push(oldWeek)}
 updated.weeks.sort((a,b)=>a.week-b.week);
 return {updated,protectedCount};
}
async function importProgramme(file){try{const p=await Imp.parseFile(file);const current=programs.find(x=>x.id===p.id),oldState=states[p.id];const hasOld=!!current;
 pendingImport=p;const count=p.sessions.reduce((n,s)=>n+countSets(s),0);
 showModal(`<div class="eyebrow">${hasOld?'PROGRAMME UPDATE':'NEW PROGRAMME'}</div><h2>${esc(p.title)}</h2><p class="muted">${p.weeks.length} weeks · ${p.sessions.length} sessions · ${count} sets · Version ${esc(p.version)}</p><p>${hasOld?`This matches the existing Programme ID <b>${esc(p.id)}</b> (installed version ${esc(current.version||1)}). Started sessions and recorded logs will be preserved. Unstarted sessions will use the imported prescriptions.`:`Install <b>${esc(p.id)}</b> as a new programme? It will be added to your library.`}</p>${hasOld&&Number(p.version)<Number(current.version)?'<div class="notice danger">This update has an older version number than the installed programme.</div>':''}<div class="btnrow"><button class="btn btn-outline" data-action="cancelmodal">Cancel</button><button class="btn btn-primary" data-action="installprogramme">${hasOld?'Install update':'Add programme'}</button></div>`);
 }catch(e){alertUser('Import failed: '+e.message);console.error(e)}}
async function installProgramme(){const p=pendingImport;if(!p)return;const old=programs.find(x=>x.id===p.id);
 if(old){
  // A catalogue programme may be shared by several profiles on this browser.
  // Protect any session started in ANY profile when the global prescription changes.
  const saved=(await all('profileStates')).filter(s=>s.programId===p.id),union={logs:{}};
  for(const item of saved)Object.assign(union.logs,item.data?.logs||{});
  const {updated,protectedCount}=mergeUpdatedProgramme(old,p,union);
  await put('programmes',updated);
  for(const item of saved){const st=item.data||freshState(old);st.history=st.history||[];st.history.push({date:new Date().toISOString(),from:old.version||1,to:p.version||1,protected:protectedCount});const cfg=structuredClone(updated.defaults);cfg.maxes={...cfg.maxes,...st.config?.maxes};for(const [key,v] of Object.entries(cfg.variation||{})){const oldVariation=st.config?.variation?.[key];if(oldVariation?.override>0)v.override=oldVariation.override}st.config=cfg;item.data=st;await put('profileStates',item);if(item.profileId===profile?.id)states[p.id]=st}
  programs=programs.map(x=>x.id===p.id?updated:x);if(isEnrolled(p.id))activate(p.id);else await enrol(p.id);
  closedModal();switchTo('home');alertUser(`Update installed · ${protectedCount} started sessions protected`);
 }else{await put('programmes',p);programs.push(p);closedModal();await enrol(p.id);alertUser('Programme added to your profile')}
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
 if(!confirm(`Restore ${people.length} profile(s) and ${obj.programmes.length} programme(s)? This will REPLACE ALL local profiles, programmes and training history on this browser.`))return;
 for(const store of ['programmes','states','profiles','enrolments','profileStates'])for(const item of await all(store))await remove(store,item.id);
 for(const p of obj.programmes)await put('programmes',p);for(const item of people)await put('profiles',item);
 for(const item of links)await put('enrolments',{...item,id:stateKey(item.profileId,item.programId)});
 for(const item of saved)await put('profileStates',{...item,id:stateKey(item.profileId,item.programId)});
 await initData(obj.activeProfileId||people[0]?.id);render();alertUser('Profiles and programmes restored');
 }catch(e){alertUser('Restore failed: '+e.message);console.error(e)}}
async function setLog(key,field,value){const s=session(),before=C.calculateSession(s,S).sets.find(set=>set.key===key);if(!before)return;let log={...(S.logs[key]||{})};
 if(field==='done')log.done=value;else if(value==='')delete log[field];else{const n=Number(value);if(!Number.isFinite(n)||n<0||(field==='rpe'&&(n<1||n>10))||(field==='weight'&&n>1500)){alertUser('Invalid '+field);render();return}log[field]=n}
 if(before.kind==='BAR'&&!C.hasNum(log.lockedPct)){log.lockedPct=before.applied;log.lockedKg=before.target}
 if(hasEntry(log)){log.at=new Date().toISOString();S.logs[key]=log}else delete S.logs[key];await saveState();render();
 const after=C.calculateSession(s,S).sets.find(set=>set.key===key);if(field==='rpe'&&after?.status)alertUser(after.status+' · subsequent barbell loads adjusted');
}
async function updateSetting(group,key,value){const v=Number(value);if(!Number.isFinite(v)||v<0||v>2000){alertUser('Invalid setting');render();return}if(group==='variation'){if(!S.config.variation[key])return;S.config.variation[key].override=v||null}else if(S.config[group]&&key in S.config[group])S.config[group][key]=v;await saveState();render();alertUser('Setting saved')}
async function initData(preferredProfile){
 const builtin=await (await fetch('builtin-program.json')).json();const records=await all('programmes');
 const savedBuiltin=records.find(p=>p.id===builtin.id);
 if(!savedBuiltin){await put('programmes',builtin);records.push(builtin)}
 else if(savedBuiltin.title==='PEAK / 105 · 20-week competition peak'){
  savedBuiltin.title='Example #1';await put('programmes',savedBuiltin);
 }
 programs=records;
 profiles=await all('profiles');
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
}
document.addEventListener('click',async e=>{
 const chosen=e.target.closest('[data-choose-profile]');if(chosen){const person=profiles.find(p=>p.id===chosen.dataset.chooseProfile);if(person){await loadProfile(person);render()}return}
 const nav=e.target.closest('[data-nav]');if(nav){switchTo(nav.dataset.nav);return}
 const sessionButton=e.target.closest('[data-session]');if(sessionButton&&P){sessionId=sessionButton.dataset.session;await saveState();switchTo('session');return}
 const weekButton=e.target.closest('[data-week]');if(weekButton&&P){week=Number(weekButton.dataset.week);await saveState();render();return}
 const open=e.target.closest('[data-open-programme]');if(open){if(isEnrolled(open.dataset.openProgramme)){activate(open.dataset.openProgramme);await saveState();switchTo('home')}else await enrol(open.dataset.openProgramme);return}
 const del=e.target.closest('[data-remove-programme]');if(del){await unenrol(del.dataset.removeProgramme);return}
 const a=e.target.closest('[data-action]');if(!a)return;const cmd=a.dataset.action;
 if(['home','library','progress','settings','profile','profiles'].includes(cmd)){switchTo(cmd);return}
 if(cmd==='switchprofile'){await loadProfile(null);render();return}
 if(cmd==='renameprofile'&&profile){showModal(`<div class="eyebrow">EDIT PROFILE</div><h2>Change profile name</h2><form id="renameProfileForm" class="profile-form"><label for="renameName">Display name</label><input id="renameName" name="name" required minlength="2" maxlength="40" value="${esc(profile.name)}"><div class="btnrow"><button type="button" class="btn btn-outline" data-action="cancelmodal">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div></form>`);return}
 if(cmd==='deleteprofile'&&profile){const person=profile;if(!confirm(`Permanently delete ${person.name}'s local profile and ALL of their saved programmes, logs and settings? Export a backup first if needed.`))return;
  for(const item of await all('enrolments'))if(item.profileId===person.id)await remove('enrolments',item.id);
  for(const item of await all('profileStates'))if(item.profileId===person.id)await remove('profileStates',item.id);
  await remove('profiles',person.id);profiles=profiles.filter(p=>p.id!==person.id);await loadProfile(null);render();alertUser('Profile deleted');return}
 if(cmd==='import'){$('importFile').click();return}
 if(cmd==='restore'){$('restoreFile').click();return}
 if(cmd==='exportcsv'&&P){download(slug(P.title)+'_training.csv',C.makeCSV(S),'text/csv;charset=utf-8');alertUser('CSV exported');return}
 if(cmd==='backup'){await backup();alertUser('All local profiles backed up');return}
 if(cmd==='cancelmodal'){closedModal();return}
 if(cmd==='installprogramme'){await installProgramme();return}
 if(cmd==='nextsession'&&P){const i=P.sessions.findIndex(s=>s.id===sessionId);sessionId=P.sessions[Math.min(P.sessions.length-1,i+1)].id;week=P.sessions[Math.min(P.sessions.length-1,i+1)].week;await saveState();render();window.scrollTo(0,0);return}
 if(cmd==='checkupdate'){if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();alertUser('Checked for web app updates. Reload if a new version is available.')}else alertUser('Updates require HTTPS or localhost.');return}
});
document.addEventListener('submit',async e=>{
 if(e.target.id==='createProfileForm'){e.preventDefault();await createProfile(new FormData(e.target).get('name'))}
 if(e.target.id==='renameProfileForm'){e.preventDefault();const name=String(new FormData(e.target).get('name')||'').trim().replace(/\s+/g,' ');if(!profile||name.length<2||name.length>40){alertUser('Enter a name from 2 to 40 characters');return}profile.name=name;await put('profiles',profile);closedModal();render();alertUser('Name updated')}
});
document.addEventListener('change',async e=>{const t=e.target;if(t.id==='importFile'){if(t.files?.[0])await importProgramme(t.files[0]);t.value='';return}if(t.id==='restoreFile'){if(t.files?.[0])await restoreBackup(t.files[0]);t.value='';return}
 if(t.dataset.log)await setLog(t.dataset.log,t.dataset.field,t.value);
 else if(t.dataset.done)await setLog(t.dataset.done,'done',t.checked);
 else if(t.dataset.setting)await updateSetting(t.dataset.setting,t.dataset.key,t.value)
});
$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closedModal()});
window.addEventListener('online',updatedStatus);window.addEventListener('offline',updatedStatus);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
try{db=await openDB();await initData();render();if('serviceWorker' in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(console.error)}}catch(e){console.error(e);$('main').innerHTML=`<div class="pagehead"><h1>Unable to open local data</h1><p>${esc(e.message)}. Please check browser storage permissions and reload.</p></div>`}
})();
