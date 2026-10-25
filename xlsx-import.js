/* Minimal browser-side Open XML (.xlsx) reader for the published PEAK template.
   No remote code, arbitrary workbook formulas, macros, or external library is executed. */
(function(root){'use strict';
const td=new TextDecoder('utf-8');
function norm(s){return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}
function num(x,fallback=0){if(x===null||x===undefined||String(x).trim()==='')return fallback;const v=Number(String(x).replace(/,/g,''));return Number.isFinite(v)?v:fallback}
function percent(v){if(v==null||String(v).trim()==='')return null;let str=String(v).trim();let n=Number(str.replace('%',''));if(!Number.isFinite(n))throw Error('Invalid percentage: '+str);return str.includes('%')||n>1?n/100:n}
function required(ok,msg){if(!ok)throw Error(msg)}
function parseXml(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid Excel XML');return doc}
function nodes(n,t){return Array.from(n.getElementsByTagNameNS('*',t))}
function child(n,t){return nodes(n,t)[0]}
function text(n,t){return child(n,t)?.textContent||''}
async function unzip(buffer){required(buffer.byteLength<12_000_000,'Workbook is larger than the 12 MB import limit');
 const v=new DataView(buffer),bytes=new Uint8Array(buffer),out=new Map();let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(v.getUint32(i,true)===0x06054b50){end=i;break}}
 required(end!==-1,'Invalid XLSX / ZIP file');const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true);required(count<2000,'Too many workbook files');
 let pos=offset;const decoder=new TextDecoder();
 for(let i=0;i<count;i++){
  required(v.getUint32(pos,true)===0x02014b50,'Invalid ZIP directory');
  const method=v.getUint16(pos+10,true),comp=v.getUint32(pos+20,true),rawSize=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),el=v.getUint16(pos+30,true),cl=v.getUint16(pos+32,true),lo=v.getUint32(pos+42,true);
  const name=decoder.decode(bytes.subarray(pos+46,pos+46+nl));pos+=46+nl+el+cl;
  if(!/^(xl\/|\[Content_Types\])/.test(name)||name.endsWith('/'))continue;
  required(rawSize<30_000_000,'Uncompressed workbook component too large');
  required(v.getUint32(lo,true)===0x04034b50,'Invalid ZIP file offset');
  const start=lo+30+v.getUint16(lo+26,true)+v.getUint16(lo+28,true);required(start+comp<=bytes.length,'Truncated workbook');
  const part=bytes.slice(start,start+comp);
  let raw;
  if(method===0)raw=part;
  else if(method===8){required(typeof DecompressionStream==='function','This browser does not support XLSX decompression');const stream=new Blob([part]).stream().pipeThrough(new DecompressionStream('deflate-raw'));raw=new Uint8Array(await new Response(stream).arrayBuffer())}
  else throw Error('Unsupported XLSX compression method: '+method);
  required(raw.length<=30_000_000,'Expanded component too large');out.set(name,td.decode(raw));
 }
 return out;
}
function columnIndex(ref){const letters=(ref.match(/^[A-Za-z]+/)||['A'])[0].toUpperCase();let n=0;for(const l of letters)n=n*26+l.charCodeAt(0)-64;return n-1}
function sheetTable(xml,shared){const doc=parseXml(xml),rows=[];
 for(const row of nodes(doc,'row')){
  const array=[];for(const c of nodes(row,'c')){
   const idx=columnIndex(c.getAttribute('r')||'A'),type=c.getAttribute('t');let value;
   if(type==='inlineStr')value=nodes(c,'t').map(t=>t.textContent).join('');
   else if(type==='s')value=shared[Number(text(c,'v'))]||'';
   else if(type==='b')value=text(c,'v')==='1';
   else {const raw=text(c,'v');value=raw===''?'':type==='str'?raw:(Number.isFinite(Number(raw))?Number(raw):raw)}
   array[idx]=value;
  }
  if(array.some(x=>x!==''&&x!==undefined))rows.push(array);
 }
 if(!rows.length)return [];
 const hdr=rows[0].map(norm);
 return rows.slice(1).map((values,i)=>{let r={_row:i+2};for(let c=0;c<hdr.length;c++)if(hdr[c])r[hdr[c]]=values[c]??'';return r});
}
async function readXLSX(buffer){const files=await unzip(buffer);
 required(files.has('xl/workbook.xml'),'Not a standard Excel .xlsx workbook');
 const w=parseXml(files.get('xl/workbook.xml'));
 const rel=parseXml(files.get('xl/_rels/workbook.xml.rels')||'');
 const relations={};for(const r of nodes(rel,'Relationship'))relations[r.getAttribute('Id')]=r.getAttribute('Target');
 let shared=[];if(files.has('xl/sharedStrings.xml')){const ss=parseXml(files.get('xl/sharedStrings.xml'));shared=nodes(ss,'si').map(si=>nodes(si,'t').map(t=>t.textContent).join(''))}
 const sheets={};for(const s of nodes(w,'sheet')){
  const name=s.getAttribute('name'),rid=s.getAttribute('r:id')||s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relations[rid];if(!target)continue;
  const path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
  if(files.has(path))sheets[norm(name)]=sheetTable(files.get(path),shared);
 }
 return sheets;
}
function cleanId(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,90)}
function convert(sheets){const info=sheets.programme_info,exerciseRows=sheets.exercises,rows=sheets.sessions;
 required(info&&exerciseRows&&rows,'Template must contain Programme Info, Exercises and Sessions sheets');
 const inf={};for(const r of info)if(r.field)inf[norm(r.field)]=r.value;
 required(inf.title,'Programme Info: Title is required');required(inf.programme_id,'Programme Info: Programme ID is required');
 const id=cleanId(inf.programme_id);required(id.length>=3,'Programme ID must contain at least three letters/numbers');
 const weeks=num(inf.weeks,0),daysPerWeek=num(inf.days_per_week,0);required(weeks>=1&&weeks<=104&&daysPerWeek>=1&&daysPerWeek<=7,'Weeks must be 1–104 and training days must be 1–7');
 const defaults=JSON.parse(JSON.stringify(root.PROGRAM.defaults));
 defaults.maxes.SQ=num(inf.squat_max_kg,240);defaults.maxes.BP=num(inf.bench_max_kg,200);defaults.maxes.DL=num(inf.deadlift_max_kg,300);
 for(const key of ['SQ','BP','DL'])required(defaults.maxes[key]>0&&defaults.maxes[key]<=1000,'Invalid competition 1RM: '+key);
 defaults.variation={};defaults.offsets={SQ:0,BP:0,DL:0};
 const ex={};for(const r of exerciseRows){if(!r.code)continue;const code=String(r.code).trim().toUpperCase(),family=String(r.family||'').trim().toUpperCase(),kind=String(r.kind||'BAR').trim().toUpperCase();
  required(/^[A-Z0-9_-]{2,24}$/.test(code),'Invalid exercise code at Exercises row '+r._row);
  required(['SQ','BP','DL','ACC'].includes(family),'Invalid family for '+code);
  required(['BAR','ACC'].includes(kind),'Invalid exercise type for '+code);
  required(kind==='ACC'||family!=='ACC','Barbell lift needs SQ, BP or DL family: '+code);
  required(!ex[code],'Duplicate exercise code '+code);
  const name=String(r.name||code).trim().slice(0,100);required(name.length>0,'Exercise name required for '+code);
  const ratio=num(r.ratio,1),override=num(r.max_override_kg,0),offset=num(r.rpe_offset,0);
  required(ratio>0&&ratio<=2&&override>=0&&override<=1000,'Invalid max/ratio for '+code);
  ex[code]={code,name,family,kind};
  if(kind==='BAR'&&!['SQ','BP','DL'].includes(code)){defaults.variation[code]={name,ratio,family,override:override||null};defaults.offsets[code]=offset}
  if(kind==='BAR'&&['SQ','BP','DL'].includes(code))defaults.offsets[code]=offset;
 }
 for(const base of ['SQ','BP','DL'])if(!ex[base])ex[base]={code:base,name:{SQ:'Competition squat',BP:'Competition bench',DL:'Competition deadlift'}[base],family:base,kind:'BAR'};
 for(const r of sheets.training_rules||[]){const key=String(r.setting||'').trim();if(key&&Object.hasOwn(defaults.settings,key)&&r.value!==''){const val=Number(r.value);required(Number.isFinite(val)&&val>=0,'Invalid setting '+key);defaults.settings[key]=val}}
 if(sheets.rpe_lookup?.length){const lookup=sheets.rpe_lookup.filter(r=>r.percent_1rm!==''&&r.base_rpe!=='').map(r=>[percent(r.percent_1rm),num(r.base_rpe)]);required(lookup.length>=2,'RPE Lookup must have at least two entries');for(const [pct,rpe] of lookup)required(pct>=0&&pct<=1.5&&rpe>=1&&rpe<=10,'RPE Lookup value out of range');defaults.lookup=lookup.sort((a,b)=>a[0]-b[0])}
 required(rows.length>0&&rows.length<=10000,'Sessions sheet must contain 1–10,000 rows');
 const sessions=new Map(),seenIds=new Set(),counts=new Map();
 for(const r of rows){const week=num(r.week),day=num(r.day);if(!week&&!day)continue;required(Number.isInteger(week)&&week>=1&&week<=weeks,'Invalid week at Sessions row '+r._row);required(Number.isInteger(day)&&day>=1&&day<=daysPerWeek,'Invalid day at Sessions row '+r._row);
  const sid=`w${week}d${day}`;let s=sessions.get(sid);if(!s){s={id:sid,week,day,phase:String(r.phase||'Training').slice(0,55),title:String(r.session_title||'Training session').slice(0,80),prep:String(r.preparation||'').slice(0,500),sets:[]};sessions.set(sid,s)}
  if(r.phase)s.phase=String(r.phase).slice(0,55);if(r.session_title)s.title=String(r.session_title).slice(0,80);if(r.preparation)s.prep=String(r.preparation).slice(0,500);
  const code=String(r.exercise_code||'').trim().toUpperCase();if(!code){if(r.stage&&String(r.stage).toUpperCase()==='REST')s.rest='RECOVERY DAY';continue}
  required(ex[code],'Unknown exercise code '+code+' at Sessions row '+r._row);
  const e=ex[code],stage=String(r.stage|| (e.kind==='ACC'?'ACC':'WORK')).trim().toUpperCase();const repeats=e.kind==='ACC'?num(r.sets,1):1;
  required(Number.isInteger(repeats)&&repeats>=1&&repeats<=15,'Invalid number of accessory sets at row '+r._row);
  const key=sid+'-'+code,ordinal=(counts.get(key)||0)+1;counts.set(key,ordinal);
  const setid=cleanId(r.set_id||`${key}-${String(ordinal).padStart(2,'0')}`);
  required(!seenIds.has(setid),'Duplicate Set ID '+setid+' at row '+r._row);seenIds.add(setid);
  const repsText=String(r.reps||'').trim();required(repsText,'Repetitions required at Sessions row '+r._row);
  if(e.kind==='BAR'){
   const reps=num(r.reps);const pct=percent(r.percent_1rm);
   required(Number.isInteger(reps)&&reps>=1&&reps<=30,'Barbell repetitions must be a whole number at row '+r._row);
   required(pct!==null&&pct>.1&&pct<=1.2,'Barbell %1RM must be 0.10–1.20 at row '+r._row);
   required(['RAMP','WORK'].includes(stage),'Barbell stage must be RAMP or WORK at row '+r._row);
   let preceding=0;
   for(let i=s.sets.length-1;i>=0;i--){const prev=s.sets[i];if(prev.code!==code)break;if(prev.kind==='BAR'&&prev.stage==='WORK')preceding++}
   s.sets.push({id:setid,kind:'BAR',code,family:e.family,name:e.name,stage,pct,reps,repsText,preceding,step:String(r.set_number||ordinal),week,day});
  }else{
   const target=r.target_rpe!==''?num(r.target_rpe,null):null;
   required(target===null||(target>=1&&target<=10),'Accessory target RPE must be 1–10');
   s.sets.push({id:setid,kind:'ACC',code,family:'ACC',name:e.name,stage:'ACC',reps:repsText,repsText,count:repeats,rir:String(r.rir||''),targetRpe:target,week,day});
  }
 }
 required(sessions.size>0,'No valid sessions found');
 const weekDefs=[];for(let w=1;w<=weeks;w++){const first=[...sessions.values()].find(s=>s.week===w);weekDefs.push({week:w,block:1,phase:first?.phase||'Training',label:first?.phase||'TRAINING'})}
 const result={id,title:String(inf.title).trim().slice(0,100),description:String(inf.description||`${weeks} weeks · ${daysPerWeek} days per week`).slice(0,400),version:num(inf.version,1),daysPerWeek,weeks:weekDefs,sessions:[...sessions.values()].sort((a,b)=>a.week-b.week||a.day-b.day),defaults};
 validate(result);return result;
}
function validate(p){required(p&&typeof p==='object'&&Array.isArray(p.sessions)&&Array.isArray(p.weeks)&&p.defaults,'Invalid programme structure');required(cleanId(p.id).length>=3,'Programme ID missing');required(p.sessions.length>0&&p.sessions.length<=800,'Invalid session count');required(p.weeks.length>0&&p.weeks.length<=104,'Invalid programme weeks');required(p.defaults?.maxes&&p.defaults?.settings&&p.defaults?.variation&&Array.isArray(p.defaults.lookup),'Invalid loading settings');
 const setids=new Set();for(const s of p.sessions){required(s.id&&Number.isInteger(s.week)&&Array.isArray(s.sets),'Invalid session');for(const set of s.sets){required(set.id&&!setids.has(set.id),'Missing or duplicate set ID');setids.add(set.id);required(['BAR','ACC'].includes(set.kind),'Invalid set kind');if(set.kind==='BAR')required(Number.isFinite(set.pct)&&set.pct>0&&Number.isFinite(Number(set.reps)),'Invalid barbell set')}}
 return p;
}
async function parseFile(file){required(file.size<12_000_000,'Import is limited to 12 MB');if(/\.xlsx$/i.test(file.name)){const sheets=await readXLSX(await file.arrayBuffer());return convert(sheets)}const json=JSON.parse(await file.text());return validate(json.program||json)}
root.PeakImport={parseFile,readXLSX,convert,validate};
})(window);
