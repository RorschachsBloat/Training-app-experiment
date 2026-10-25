/* Optional Supabase backend. Every user-specific read/write is restricted
   by database RLS policies; client-side admin flags are never relied on. */
(function(root){'use strict';
const settings=root.PEAK_CLOUD||{};
const enabled=/^https:\/\//.test(settings.url||'')&&!!settings.publishableKey;
let client=null,identity=null,account=null;
const assertUser=()=>{if(!identity)throw Error('Please sign in to your account');};
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
 await refresh();return true;
}
async function refresh(){
 const {data,error}=await client.auth.getUser();
 if(error&&!/missing|session/i.test(error.message))console.warn('Auth check:',error.message);
 identity=data?.user||null;account=null;
 if(identity){
  const res=await client.from('peak_accounts').select('id,username,email,role,created_at').eq('id',identity.id).single();
  if(res.error)throw Error('Cannot load account: '+res.error.message);
  account=res.data;
 }
 return identity;
}
async function login(email,password){const {error}=await client.auth.signInWithPassword({email,password});if(error)throw Error(error.message);await refresh();}
async function signup(username,email,password){
 username=String(username).trim();if(!/^[A-Za-z][A-Za-z0-9_-]{2,29}$/.test(username))throw Error('Username must be 3–30 letters, numbers, hyphens or underscores');
 if(String(password).length<12)throw Error('Use a password of at least 12 characters');
 const {data,error}=await client.auth.signUp({email,password,options:{data:{username}}});
 if(error)throw Error(error.message);
 if(data.session)await refresh();
 return !!data.session;
}
async function signout(){if(client)await client.auth.signOut();identity=null;account=null;}
async function all(kind){assertUser();const {data,error}=await client.from('peak_documents').select('content').eq('owner_id',identity.id).eq('kind',kind).order('updated_at',{ascending:true});if(error)throw Error(error.message);return data.map(row=>row.content);}
async function get(kind,id){assertUser();const {data,error}=await client.from('peak_documents').select('content').eq('owner_id',identity.id).eq('kind',kind).eq('doc_id',id).maybeSingle();if(error)throw Error(error.message);return data?.content;}
async function put(kind,obj){assertUser();const {error}=await client.from('peak_documents').upsert({owner_id:identity.id,kind,doc_id:String(obj.id),content:obj},{onConflict:'owner_id,kind,doc_id'});if(error)throw Error(error.message);}
async function remove(kind,id){assertUser();const {error}=await client.from('peak_documents').delete().eq('owner_id',identity.id).eq('kind',kind).eq('doc_id',id);if(error)throw Error(error.message);}
async function adminOverview(){
 assertUser();if(account?.role!=='admin')throw Error('Not authorised');
 const [accounts,documents]=await Promise.all([
  client.from('peak_accounts').select('id,username,email,role,created_at').order('created_at',{ascending:false}),
  client.from('peak_documents').select('owner_id,kind,doc_id,content,updated_at').in('kind',['enrolments','profileStates','profiles'])
 ]);
 if(accounts.error)throw Error(accounts.error.message);if(documents.error)throw Error(documents.error.message);
 return {accounts:accounts.data||[],documents:documents.data||[]};
}
root.PeakCloud={enabled,initialize,refresh,login,signup,signout,all,get,put,remove,adminOverview,
 get user(){return identity},get account(){return account}};
})(window);
