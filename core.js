(function(root){
'use strict';
const round1=x=>Math.round((Number(x)||0)*10)/10;
const fixed=x=>Math.round((Number(x)||0)*1000)/1000;
const defaults=()=>JSON.parse(JSON.stringify(root.PROGRAM.defaults));
const newState=()=>({logs:{},config:defaults(),week:1,sessionId:'w1d1',readiness:{},applyRpeToAll:false});
const hasNum=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const movementKey=set=>`${set.kind}|${set.code}|${set.name}`;
const readinessOffsets={1:-.05,2:-.025,3:0,4:.01,5:.02};
const readinessScore=(state,session)=>clamp(Math.round(Number(state.readiness?.[session.id])||3),1,5);
function exerciseMax(set,c){
 const v=c.variation[set.code]; if(v){return (hasNum(v.override)&&Number(v.override)>0)?Number(v.override):Number(c.maxes[v.family])*Number(v.ratio)}
 return Number(c.maxes[set.code]||c.maxes[set.family]||0);
}
function expect(set,applied,c,actualRpe){
 const settings=c.settings; const isEligible=set.stage==='WORK'||(set.stage==='RAMP'&&(applied>=settings.rampThreshold||hasNum(actualRpe)));
 if(!isEligible)return {expected:null,cap:null};
 let base=2; const pct=Math.max(.5,applied);
 for(const item of [...c.lookup].sort((a,b)=>a[0]-b[0])) if(pct>=item[0]-1e-9)base=item[1];
 const off=Number(c.offsets[set.code]||0);
 const technical=clamp(base+(Number(set.reps)-3)*settings.repRpe+off,1,10);
 const fatigueRate=set.family==='SQ'?settings.fatigueSQ:set.family==='BP'?settings.fatigueBP:settings.fatigueDL;
 const fatigue=Math.min(settings.fatigueMax,Number(set.preceding)*fatigueRate);
 const expected=clamp(technical+fatigue,set.stage==='WORK'?settings.minExpected:1,10);
 const cap=Math.min(settings.absoluteCap, expected + (expected<settings.easyThreshold?settings.toleranceEasy:settings.toleranceHard));
 return {expected,cap};
}
function calculateSession(session,state){
 const c=state.config,logs=state.logs||{},o=[];
 const scopeAll=state.applyRpeToAll===true;
 const perMovement=new Map(); let globalDrop=0,caps=0,stop=false;
 const readiness=readinessScore(state,session),readinessOffset=readinessOffsets[readiness];
 for(const source of session.sets){
  if(source.kind==='ACC'){
   for(let i=0;i<source.count;i++){
    const key=source.id+'_s'+(i+1),log=logs[key]||{},skipped=log.status==='skipped';
    const complete=!skipped&&(log.done||hasNum(log.weight)||hasNum(log.rpe)||hasNum(log.reps));
    o.push({...source,key,ordinal:i+1,count:source.count,log,complete,skipped,cap:hasNum(source.targetRpe)?Math.min(c.settings.absoluteCap,source.targetRpe+c.settings.toleranceHard):null,expected:source.targetRpe,adjusted:false,readiness});
   }
   continue;
  }
  const key=source.id,log=logs[key]||{},skipped=log.status==='skipped',complete=!skipped&&(log.done||hasNum(log.weight)||hasNum(log.rpe)||hasNum(log.reps));
  const movement=movementKey(source),movementDrop=perMovement.get(movement)||0;
  const cumulative=scopeAll?globalDrop:movementDrop;
  const baseline=clamp(Number(source.pct)+readinessOffset,0,1);
  const applied=complete && hasNum(log.lockedPct) ? Number(log.lockedPct) : Math.max(0,baseline-cumulative);
  const target=complete && hasNum(log.lockedKg) ? Number(log.lockedKg) : Math.round((applied*exerciseMax(source,c))/c.settings.roundTo)*c.settings.roundTo;
  const original=Math.round(Number(source.pct)*exerciseMax(source,c)/c.settings.roundTo)*c.settings.roundTo;
  const readinessKg=Math.round(baseline*exerciseMax(source,c)/c.settings.roundTo)*c.settings.roundTo;
  const {expected,cap}=expect(source,applied,c,skipped?null:log.rpe);
  let drop=0,status='';
  if(!skipped&&hasNum(log.rpe)&&cap!==null&&Number(log.rpe)>=cap-1e-8){
   caps++;
   const over=Number(log.rpe)-cap;
   drop=over>=c.settings.overshoot2-1e-8?c.settings.drop3:over>=c.settings.overshoot1-1e-8?c.settings.drop2:c.settings.drop1;
   drop=Math.min(drop,Math.max(0,c.settings.dropMax-cumulative));
   status=(cumulative+drop>=c.settings.dropMax-1e-8)?'STOP / REVIEW':(applied>=c.settings.rampThreshold?'NO HEAVIER SETS':'REDUCE NEXT');
  }
  o.push({...source,key,log,complete,skipped,applied,target,original,readinessKg,expected,cap,cumulative,drop,status,adjusted:target<original-.001,readiness,movement});
  perMovement.set(movement,Math.min(c.settings.dropMax,movementDrop+drop));
  if(scopeAll)globalDrop=Math.min(c.settings.dropMax,globalDrop+drop);
  if(status==='STOP / REVIEW')stop=true;
 }
 const byMovement=Object.fromEntries(perMovement);
 return {sets:o,drop:scopeAll?globalDrop:Math.max(0,...perMovement.values()),dropByMovement:byMovement,capHits:caps,stop,applyRpeToAll:scopeAll,readiness};
}
function logCount(state,session){return calculateSession(session,state).sets.filter(s=>s.complete).length}
function totalCount(session){return session.sets.reduce((n,s)=>n+(s.kind==='ACC'?s.count:1),0)}
function weekStats(week,state){let count=0,total=0,tonnage=0,capHits=0,comp=0,variation=0,accessory=0,sq=0,bp=0,dl=0,skipped=0,missed=0;
 let intensitySQ=0,intensityBP=0,intensityDL=0,topSQ=0,topBP=0,topDL=0;
 for(const session of root.PROGRAM.sessions.filter(s=>s.week===week)){
  const result=calculateSession(session,state);capHits+=result.capHits;
  for(const s of result.sets){total++;if(s.skipped){skipped++;continue}
   if(!s.complete)continue;
   count++;
   const prescribed=Number(s.reps);
   if(Number.isFinite(prescribed)&&hasNum(s.log.reps))missed+=Math.max(0,prescribed-Number(s.log.reps));
   if(s.kind==='BAR'){
    const weight=hasNum(s.log.weight)?Number(s.log.weight):s.target;
    const reps=hasNum(s.log.reps)?Number(s.log.reps):s.reps;
    tonnage+=weight*reps;
    if(['SQ','BP','DL'].includes(s.code))comp+=reps;
    else variation+=reps;
    const relative=weight/Math.max(1,exerciseMax(s,state.config));
    if(s.family==='SQ'){sq+=reps;intensitySQ+=relative*reps;if(s.code==='SQ')topSQ=Math.max(topSQ,relative)}
    else if(s.family==='BP'){bp+=reps;intensityBP+=relative*reps;if(s.code==='BP')topBP=Math.max(topBP,relative)}
    else if(s.family==='DL'){dl+=reps;intensityDL+=relative*reps;if(s.code==='DL')topDL=Math.max(topDL,relative)}
   }else accessory++;
  }
 }
 return {count,total,tonnage,capHits,comp,variation,accessory,sq,bp,dl,skipped,missed,
  ariSQ:sq?intensitySQ/sq:0,ariBP:bp?intensityBP/bp:0,ariDL:dl?intensityDL/dl:0,topSQ,topBP,topDL};
}
function makeCSV(state){
 const header=['Week','Phase','Day','Exercise','Code','Set','Stage','Reps prescribed','Reps actual','Missed reps','Set status','Session readiness','Plan %','Applied %','Planned kg','Prescribed kg','Actual kg','Expected RPE','RPE cap','Actual RPE','Adjustment for later sets (pp)','RPE scope','Logged at'];
 const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';let rows=[header];
 for(const session of root.PROGRAM.sessions){
  const model=calculateSession(session,state);for(const s of model.sets){if(!s.complete&&!s.skipped)continue;
   const missed=Number.isFinite(Number(s.reps))&&hasNum(s.log.reps)?Math.max(0,Number(s.reps)-Number(s.log.reps)):'';
   rows.push([session.week,session.phase,session.day,s.name,s.code,s.kind==='ACC'?s.ordinal:s.step,s.stage,s.repsText,hasNum(s.log.reps)?s.log.reps:'',missed,s.skipped?'Skipped':missed>0?'Missed reps':'Logged',model.readiness,s.kind==='BAR'?fixed(s.pct*100):'',s.kind==='BAR'?fixed(s.applied*100):'',s.kind==='BAR'?s.original:'',s.kind==='BAR'?s.target:'',s.log.weight??'',s.expected===null?'':round1(s.expected),s.cap===null?'':round1(s.cap),s.log.rpe??'',s.kind==='BAR'?fixed(s.drop*100):'',model.applyRpeToAll?'All movements':'Movement only',s.log.at||'']);
  }
 }
 return rows.map(row=>row.map(q).join(',')).join('\r\n');
}
root.PeakCore={defaults,newState,hasNum,exerciseMax,expect,calculateSession,logCount,totalCount,weekStats,makeCSV,round1,movementKey,readinessOffsets,readinessScore};
})(typeof window!=='undefined'?window:globalThis);
