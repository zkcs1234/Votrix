// Loopback-only SDK contract fixture. Not hosted PostgREST or a production DB.
import express from '../node_modules/express/index.js'
import {sql,literal,json,rpcStatement,database} from './phase9-local-db.mjs'
import {spawn} from 'node:child_process'
const asyncSql=statement=>new Promise((resolve,reject)=>{const env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete env.PGSERVICE;delete env.PGSERVICEFILE;const p=spawn('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{env,windowsHide:true});let out='',error='';const timer=setTimeout(()=>{p.kill();reject(new Error('Local fixture query timed out'))},60000);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>error+=b);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0?resolve(JSON.parse(out.trim())):reject(new Error(error))});p.stdin.end(statement)})
const ident=s=>{if(!/^[a-z_]+$/.test(s))throw new Error('Invalid fixture identifier');return s}
export function extendApplicationFixture(){
 sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer DEFAULT 0,ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false,ADD COLUMN IF NOT EXISTS email text,ADD COLUMN IF NOT EXISTS username text,ADD COLUMN IF NOT EXISTS first_name text,ADD COLUMN IF NOT EXISTS last_name text,ADD COLUMN IF NOT EXISTS organization_name text,ADD COLUMN IF NOT EXISTS organization_type_display text,ADD COLUMN IF NOT EXISTS organizer_name text,ADD COLUMN IF NOT EXISTS position text,ADD COLUMN IF NOT EXISTS organization_logo text,ADD COLUMN IF NOT EXISTS profile_data jsonb DEFAULT '{}';
 ALTER TABLE events ADD COLUMN IF NOT EXISTS description text,ADD COLUMN IF NOT EXISTS banner text,ADD COLUMN IF NOT EXISTS start_date timestamptz,ADD COLUMN IF NOT EXISTS end_date timestamptz,ADD COLUMN IF NOT EXISTS image_asset_id uuid,ADD COLUMN IF NOT EXISTS competition_type text,ADD COLUMN IF NOT EXISTS scoring_config jsonb DEFAULT '{}',ADD COLUMN IF NOT EXISTS scoring_enabled boolean DEFAULT false,ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
 ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS display_name text,ADD COLUMN IF NOT EXISTS first_name text,ADD COLUMN IF NOT EXISTS last_name text,ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
 ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
 ALTER TABLE competition_contestants ADD COLUMN IF NOT EXISTS entry_type text DEFAULT 'individual',ADD COLUMN IF NOT EXISTS entry_label text;
 ALTER TABLE competition_contestants ALTER COLUMN id SET DEFAULT gen_random_uuid();
 ALTER TABLE event_participants ALTER COLUMN id SET DEFAULT gen_random_uuid();
 CREATE TABLE IF NOT EXISTS event_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organizer_id uuid REFERENCES users(id),module text,step text,title text,banner text,image_asset_id uuid,payload jsonb DEFAULT '{}',updated_at timestamptz DEFAULT now(),UNIQUE(organizer_id,module));
 CREATE TABLE IF NOT EXISTS user_participant_types(user_id uuid REFERENCES users(id),participant_type text,is_active boolean DEFAULT true);
 CREATE TABLE IF NOT EXISTS invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid,email text,recipient_email text,status text,role text,created_at timestamptz DEFAULT now());`)
}
export function startPostgrestFixture({key,port=5059,actors=[]}){
 const app=express(),requests=[],columnCache=new Map();app.use(express.json({limit:'16mb'}));app.use((req,res,next)=>{if(req.headers.apikey!==key)return res.sendStatus(403);next()})
 app.all('/rest/v1/{*path}',async(req,res)=>{
  const route=req.params.path.join('/');requests.push({method:req.method,path:route})
  try{
   if(route.startsWith('rpc/')){const value=await asyncSql(rpcStatement(ident(route.slice(4)),req.body));return res.json(value)}
   const table=ident(route);if(!columnCache.has(table))columnCache.set(table,asyncSql(`SELECT coalesce(jsonb_agg(column_name),'[]') FROM information_schema.columns WHERE table_schema='public' AND table_name=${literal(table)}`));const columns=await columnCache.get(table);if(!columns.length)return res.status(404).json({code:'42P01',message:'Fixture table unavailable: '+table})
   const base=()=>{
    if(table==='events')return asyncSql(`SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('organizations',to_jsonb(o)||jsonb_build_object('users',to_jsonb(u)))),'[]') FROM events e LEFT JOIN organizations o ON o.id=e.organization_id LEFT JOIN users u ON u.id=o.organizer_id`)
    if(table==='organizations')return asyncSql(`SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('users',to_jsonb(u))),'[]') FROM organizations o LEFT JOIN users u ON u.id=o.organizer_id`)
    if(['event_participants','user_participant_types'].includes(table))return asyncSql(`SELECT coalesce(jsonb_agg(DISTINCT to_jsonb(e)||jsonb_build_object('users',to_jsonb(u),'events',to_jsonb(v)||jsonb_build_object('organizations',to_jsonb(o)))),'[]') FROM ${table} e LEFT JOIN users u ON u.id=e.user_id ${table==='event_participants'?'LEFT JOIN events v ON v.id=e.event_id LEFT JOIN organizations o ON o.id=v.organization_id':'LEFT JOIN events v ON false LEFT JOIN organizations o ON false'}`)
    return asyncSql(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${table} t`)
   }
   const matches=row=>Object.entries(req.query).every(([field,expression])=>{
    if(['select','order','limit','offset','on_conflict'].includes(field))return true
    if(field==='or'){return String(expression).slice(1,-1).split(',').some(term=>{const [name,op,value]=term.split('.');return op==='eq'&&String(row[name])===value})}
    const value=field.split('.').reduce((v,k)=>v?.[k],row),[op,...rest]=String(expression).split('.'),expected=rest.join('.')
    if(op==='eq')return String(value)===expected;if(op==='neq')return String(value)!==expected;if(op==='is')return expected==='null'?value==null:String(value)===expected
    if(op==='in')return expected.slice(1,-1).split(',').map(v=>v.replaceAll('"','')).includes(String(value));if(op==='gte')return value>=expected;if(op==='lte')return value<=expected
    throw new Error('Unsupported fixture predicate '+op)
   })
   let result
   if(['GET','HEAD'].includes(req.method))result=(await base()).filter(matches)
   else if(req.method==='POST'){
    result=[];for(const row of Array.isArray(req.body)?req.body:[req.body]){
     const keys=Object.keys(row).filter(k=>columns.includes(k));let statement=`INSERT INTO ${table}(${keys.map(ident).join(',')}) VALUES(${keys.map(k=>typeof row[k]==='object'&&row[k]!=null?json(row[k]):literal(row[k])).join(',')})`
     if(req.query.on_conflict){const conflict=String(req.query.on_conflict).split(',').map(ident);statement+=` ON CONFLICT(${conflict.join(',')}) DO UPDATE SET ${keys.filter(k=>!conflict.includes(k)).map(k=>`${ident(k)}=EXCLUDED.${ident(k)}`).join(',')}`}
     result.push(...await asyncSql(`WITH changed AS(${statement} RETURNING *)SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM changed c`))
    }
   }else{
    const matched=(await base()).filter(matches).filter(row=>actors.includes(row.organizer_id)||actors.includes(row.user_id)||actors.includes(row.id)||actors.includes(row.organizations?.organizer_id)),primary=columns.includes('id')?'id':null;if(!primary)throw new Error('Fixture mutation requires primary identity')
    const ids=matched.map(r=>literal(r.id)),where=ids.length?`id IN(${ids.join(',')})`:'false'
    const statement=req.method==='DELETE'?`DELETE FROM ${table} WHERE ${where}`:`UPDATE ${table} SET ${Object.entries(req.body).filter(([k])=>columns.includes(k)).map(([k,v])=>`${ident(k)}=${typeof v==='object'&&v!=null?json(v):literal(v)}`).join(',')} WHERE ${where}`
    result=await asyncSql(`WITH changed AS(${statement} RETURNING *) SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM changed c`)
   }
   const count=result.length
   if(req.query.order){const [field,direction]=String(req.query.order).split(',')[0].split('.');result.sort((a,b)=>String(a[field]??'').localeCompare(String(b[field]??''))*(direction==='desc'?-1:1))}
   const range=req.headers.range?.split('-').map(Number),offset=Number(req.query.offset??range?.[0]??0),limit=Number(req.query.limit??(range?range[1]-range[0]+1:result.length));result=result.slice(offset,offset+limit)
   res.set('Content-Range',result.length?`${offset}-${offset+result.length-1}/${count}`:`*/${count}`)
   if(req.method==='HEAD')return res.end()
   if(req.headers.accept?.includes('vnd.pgrst.object')){if(result.length!==1)return res.status(406).json({code:'PGRST116',message:'Single row unavailable'});return res.json(result[0])}
   res.json(result)
  }catch(error){res.status(400).json({code:/permission denied/.test(error.message)?'42501':/P0001/.test(error.message)?'P0001':'P0001',message:error.message.match(/ERROR:\s*([^\r\n]+)/)?.[1]??error.message})}
 })
 const server=app.listen(port,'127.0.0.1');return{server,requests}
}
