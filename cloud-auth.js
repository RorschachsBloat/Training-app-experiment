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
 const {data,error}=await client.from('peak_programme_releases')
  .select('program_id,version,content,published_at').order('published_at',{ascending:true});
 if(error)throw Error('Cannot load published programmes: '+error.message+' (run PEAK_V5_PUBLISHING.sql in Supabase)');
 return data||[];
}
async function publishProgram(program){
 assertAdmin();
 const id=String(program.id||'');const version=Number(program.version);
 if(!/^[a-z0-9_-]{3,90}$/.test(id)||!Number.isInteger(version)||version<1)throw Error('A valid Programme ID and integer Version are required');
 const {error}=await client.from('peak_programme_releases').upsert({
  program_id:id,version,content:program,published_by:identity.id,
  published_at:new Date().toISOString()
 },{onConflict:'program_id'});
 if(error)throw Error('Publication failed: '+error.message);
}
root.PeakCloud={enabled,initialize,refresh,login,signup,signout,all,get,put,remove,adminOverview,adminAthleteDocuments,publishedPrograms,publishProgram,sendPasswordReset,finishPasswordReset,changeEmail,
 get user(){return identity},get account(){return account},get recoveryPending(){return recoveryPending}};
})(window);
