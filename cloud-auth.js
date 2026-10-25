/* PEAK cloud accounts: Supabase Auth + RLS-scoped training documents.
   Publishable key only. Never place service/secret keys or passwords here. */
(function(root){'use strict';
const settings=root.PEAK_CLOUD||{};
const enabled=/^https:\/\//.test(settings.url||'')&&!!settings.publishableKey;
let client=null,identity=null,account=null,recoveryPending=false;
const assertUser=()=>{if(!identity)throw Error('Please sign in to your account');};
function redirectUrl(){const path=(root.location.pathname||'/').replace(/index\.html$/i,'');return root.location.origin+(path.endsWith('/')?path:path+'/');}
async function initialize(){
 if(!enabled)return false;
 if(!root.supabase){
  await new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
   script.onload=resolve;script.onerror=()=>reject(Error('Could not load authentication library. Check your connection.'));
   document.head.append(script);
  });
 }
 if(!root.supabase?.createClient)throw Error('Supabase SDK unavailable');
 client=root.supabase.createClient(settings.url,settings.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange(event=>{
  if(event==='PASSWORD_RECOVERY'){
   recoveryPending=true;
   root.dispatchEvent(new Event('peak-password-recovery'));
  }
 });
 await refresh();return true;
}
async function refresh(){
 const {data,error}=await client.auth.getUser();
 if(error&&!/missing|session/i.test(error.message))console.warn('Auth check:',error.message);
 identity=data?.user||null;account=null;
 if(identity){
  const res=await client.from('peak_accounts').select('id,username,email,role,created_at').eq('id',identity.id).single();
  if(res.error)throw Error('Cannot load account: '+res.error.message);
  // Supabase Auth (not the denormalized profile row) is the source of truth for sign-in email.
  account={...res.data,email:identity.email||res.data.email};
 }
 return identity;
}
async function login(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw Error(error.message);recoveryPending=false;await refresh();}
async function signup(username,email,password){
 username=String(username).trim();if(!/^[A-Za-z][A-Za-z0-9_-]{2,29}$/.test(username))throw Error('Username must be 3–30 letters, numbers, hyphens or underscores');
 if(String(password).length<12)throw Error('Use a password of at least 12 characters');
 const {data,error}=await client.auth.signUp({email,password,options:{data:{username},emailRedirectTo:redirectUrl()}});
 if(error)throw Error(error.message);
 if(data.session)await refresh();
 return !!data.session;
}
async function signout(){if(client)await client.auth.signOut();identity=null;account=null;recoveryPending=false;}
async function sendPasswordReset(email){
 const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl()});
 if(error)throw Error(error.message);
 // Supabase intentionally does not disclose whether an account exists.
}
async function finishPasswordReset(password){
 if(!recoveryPending||!identity)throw Error('Please open a valid password recovery link from your email first.');
 if(String(password).length<12)throw Error('Use a password of at least 12 characters');
 const {error}=await client.auth.updateUser({password});if(error)throw Error(error.message);
 recoveryPending=false;await refresh();
}
async function changeEmail(email){
 assertUser();
 const {error}=await client.auth.updateUser({email},{emailRedirectTo:redirectUrl()});
 if(error)throw Error(error.message);
 // Do not overwrite profile email until Auth confirms the change.
}
async function all(kind){assertUser();const {data,error}=await client.from('peak_documents').select('content').eq('owner_id',identity.id).eq('kind',kind).order('updated_at',{ascending:true});if(error)throw Error(error.message);return data.map(row=>row.content);}
async function get(kind,id){assertUser();const {data,error}=await client.from('peak_documents').select('content').eq('owner_id',identity.id).eq('kind',kind).eq('doc_id',id).maybeSingle();if(error)throw Error(error.message);return data?.content;}
async function put(kind,obj){assertUser();const {error}=await client.from('peak_documents').upsert({owner_id:identity.id,kind,doc_id:String(obj.id),content:obj},{onConflict:'owner_id,kind,doc_id'});if(error)throw Error(error.message);}
async function remove(kind,id){assertUser();const {error}=await client.from('peak_documents').delete().eq('owner_id',identity.id).eq('kind',kind).eq('doc_id',id);if(error)throw Error(error.message);}
function assertAdmin(){assertUser();if(account?.role!=='admin')throw Error('Not authorised');}
// Fetch only the account directory first. Opening one athlete fetches only their records.
async function adminOverview(){
 assertAdmin();const accounts=[];const chunk=500;
 for(let from=0;;from+=chunk){
  const {data,error}=await client.from('peak_accounts').select('id,username,email,role,created_at').order('created_at',{ascending:false}).range(from,from+chunk-1);
  if(error)throw Error(error.message);accounts.push(...(data||[]));if(!data||data.length<chunk)break;
 }
 return {accounts};
}
async function adminAthleteDocuments(ownerId){
 assertAdmin();if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(ownerId))throw Error('Invalid athlete ID');
 const documents=[],chunk=500;
 for(let from=0;;from+=chunk){
  const {data,error}=await client.from('peak_documents').select('owner_id,kind,doc_id,content,updated_at')
   .eq('owner_id',ownerId).in('kind',['programmes','enrolments','profileStates','profiles']).order('updated_at',{ascending:false}).range(from,from+chunk-1);
  if(error)throw Error(error.message);documents.push(...(data||[]));if(!data||data.length<chunk)break;
 }
 return documents;
}
async function publishedPrograms(){
 assertUser();
 const releases=[],chunk=500;
 for(let from=0;;from+=chunk){
  const {data,error}=await client.from('peak_programme_releases')
   .select('program_id,version,content,published_at,is_archived,archived_at').order('published_at',{ascending:true}).range(from,from+chunk-1);
  if(error)throw Error('Cannot load published programmes: '+error.message+' (run PEAK_V5_2_ARCHIVING.sql in Supabase)');
  releases.push(...(data||[]));if(!data||data.length<chunk)break;
 }
 return releases;
}
async function publishProgram(program){
 assertAdmin();
 const id=String(program.id||''),version=Number(program.version);
 if(!/^[a-z0-9_-]{3,90}$/.test(id)||!Number.isInteger(version)||version<1)throw Error('A valid Programme ID and integer Version are required');
 const current=await client.from('peak_programme_releases').select('program_id,version,is_archived').eq('program_id',id).maybeSingle();
 if(current.error)throw Error('Could not check programme version: '+current.error.message);
 if(current.data&&version<=current.data.version)throw Error('New programme updates need a higher Version than the published release');
 // UPDATE deliberately omits is_archived. Uploading a newer version never silently restores a programme.
 const row={version,content:program,published_by:identity.id,published_at:new Date().toISOString()};
 const result=current.data
  ?await client.from('peak_programme_releases').update(row).eq('program_id',id).select('program_id').single()
  :await client.from('peak_programme_releases').insert({program_id:id,...row}).select('program_id').single();
 if(result.error)throw Error('Publication failed: '+result.error.message);
}
async function setProgrammeArchived(id,archived){
 assertAdmin();
 if(!/^[a-z0-9_-]{3,90}$/.test(String(id)))throw Error('Invalid Programme ID');
 const {data,error}=await client.from('peak_programme_releases')
  .update({is_archived:Boolean(archived)}).eq('program_id',id).select('program_id,is_archived').single();
 if(error)throw Error('Archive action failed: '+error.message);
 if(!data||data.is_archived!==Boolean(archived))throw Error('Archive status was not saved');
 return data;
}
// Administrator-only READ-ONLY export. RLS still decides what an authenticated
// administrator may read; there is no service_role or privileged key in the app.
// Each page is bounded to avoid PostgREST response limits. Exports fail closed
// if a page fails or the visible row count changes during the read.
async function pagedAdmin(table,columns,sortKeys,filter){
 assertAdmin();const rows=[],chunk=400;
 let total;
 {let q=client.from(table).select(sortKeys[0],{count:'exact',head:true});if(filter)q=filter(q);
  const {count,error}=await q;if(error)throw Error('Could not count '+table+': '+error.message);
  if(count===null)throw Error('No row count returned for '+table);total=count;}
 for(let offset=0;offset<total;offset+=chunk){
  let q=client.from(table).select(columns);
  if(filter)q=filter(q);
  for(const key of sortKeys)q=q.order(key,{ascending:true});
  const {data,error}=await q.range(offset,Math.min(total-1,offset+chunk-1));
  if(error)throw Error('Could not export '+table+': '+error.message);
  if(!data||data.length!==Math.min(chunk,total-offset))throw Error('Incomplete export of '+table+'; nothing downloaded');
  rows.push(...data);
 }
 // A changed count indicates concurrent signup/writes/deletes; retry later.
 {let q=client.from(table).select(sortKeys[0],{count:'exact',head:true});if(filter)q=filter(q);
  const {count,error}=await q;
  if(error||count!==total)throw Error('Data changed while exporting '+table+'; please retry.');}
 return rows;
}
async function adminExportAll(){
 assertAdmin();
 const accounts=await pagedAdmin('peak_accounts','id,username,email,role,created_at',['id']);
 const documents=await pagedAdmin('peak_documents','owner_id,kind,doc_id,content,updated_at',['owner_id','kind','doc_id']);
 const releases=await pagedAdmin('peak_programme_releases','program_id,version,content,published_by,published_at,is_archived,archived_at',['program_id']);
 const ids=new Set(accounts.map(a=>a.id));
 if(documents.some(d=>!ids.has(d.owner_id)))throw Error('Unmatched athlete document detected; export cancelled');
 return {format:'PEAK_ADMIN_SNAPSHOT',version:1,exportedAt:new Date().toISOString(),
  note:'Read-only application-data archive. Does not contain passwords, Supabase Auth identities, or a complete database backup. Do not import through athlete Restore.',
  counts:{accounts:accounts.length,documents:documents.length,releases:releases.length},accounts,documents,releases};
}
async function adminExportAthlete(ownerId){
 assertAdmin();
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(ownerId))throw Error('Invalid athlete ID');
 const {data:account,error}=await client.from('peak_accounts').select('id,username,email,role,created_at').eq('id',ownerId).single();
 if(error)throw Error('Could not load athlete: '+error.message);
 const documents=await pagedAdmin('peak_documents','owner_id,kind,doc_id,content,updated_at',['owner_id','kind','doc_id'],q=>q.eq('owner_id',ownerId));
 return {format:'PEAK_ADMIN_ATHLETE_SNAPSHOT',version:1,exportedAt:new Date().toISOString(),
  note:'Sensitive single-athlete archive. Not a direct athlete-restore file. Does not include authentication credentials.',
  counts:{accounts:1,documents:documents.length},accounts:[account],documents};
}
root.PeakCloud={enabled,initialize,refresh,login,signup,signout,all,get,put,remove,adminOverview,adminAthleteDocuments,adminExportAll,adminExportAthlete,publishedPrograms,publishProgram,setProgrammeArchived,sendPasswordReset,finishPasswordReset,changeEmail,
 get user(){return identity},get account(){return account},get recoveryPending(){return recoveryPending}};
})(window);
