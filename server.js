const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gednius2025!';
const DATA_FILE = path.join(__dirname, 'data.json');

if (!API_KEY) { console.error('ERROR: ANTHROPIC_API_KEY not set.'); process.exit(1); }

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); } catch(e){}
  return { schools:[{id:'demo',username:'demo',password:'demo123',name:'Demo School',program:'Adult Education',email:'demo@gednius.com',active:true,expiry:'2099-12-31',created:new Date().toISOString(),sessions:0,lastActive:null,students:[]}]};
}
function saveData(d){ try{fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));}catch(e){console.error('save error:',e.message);} }
let DB=loadData();

function corsH(o){return{'Access-Control-Allow-Origin':o||'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Admin-Password,X-School-Password','Access-Control-Max-Age':'86400'};}
function jsend(res,code,data,o){res.writeHead(code,{...corsH(o),'Content-Type':'application/json'});res.end(JSON.stringify(data));}
function getBody(req){return new Promise((res,rej)=>{let b='';req.on('data',c=>{b+=c;});req.on('end',()=>{try{res(b?JSON.parse(b):{});}catch(e){rej(new Error('Invalid JSON'));}});});}
function uid(){return crypto.randomBytes(8).toString('hex');}

const server=http.createServer(async(req,res)=>{
  const o=req.headers['origin']||'';
  if(req.method==='OPTIONS'){res.writeHead(204,corsH(o));res.end();return;}
  const url=req.url.split('?')[0];
  try{

    // AI PROXY
    if(req.method==='POST'&&url==='/v1/messages'){
      const b=await getBody(req);
      b.model='claude-haiku-4-5-20251001';
      if(!b.max_tokens||b.max_tokens>4000)b.max_tokens=4000;
      const pl=JSON.stringify(b);
      const pr=https.request({hostname:'api.anthropic.com',path:'/v1/messages',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(pl),'anthropic-version':'2023-06-01','x-api-key':API_KEY}},pr2=>{
        let d='';pr2.on('data',c=>{d+=c;});pr2.on('end',()=>{res.writeHead(pr2.statusCode,{...corsH(o),'Content-Type':'application/json'});res.end(d);});
      });
      pr.on('error',()=>jsend(res,502,{error:'Gateway error'},o));
      pr.write(pl);pr.end();return;
    }

    // STUDENT LOGIN
    if(req.method==='POST'&&url==='/api/student/login'){
      const{username,password}=await getBody(req);
      DB=loadData();
      for(const sc of DB.schools){
        if(!sc.active)continue;
        if(sc.expiry&&new Date(sc.expiry)<new Date())continue;
        const st=(sc.students||[]).find(s=>s.username&&s.username.toLowerCase()===(username||'').toLowerCase()&&s.password===password&&s.active!==false);
        if(st){
          st.sessions=(st.sessions||0)+1;st.lastActive=new Date().toISOString();
          sc.sessions=(sc.sessions||0)+1;sc.lastActive=new Date().toISOString();
          saveData(DB);
          return jsend(res,200,{success:true,student:{id:st.id,name:st.name,username:st.username},school:{id:sc.id,name:sc.name}},o);
        }
      }
      return jsend(res,401,{success:false,error:'Invalid username or password.'},o);
    }

    // SCHOOL LOGIN
    if(req.method==='POST'&&url==='/api/school/login'){
      const{username,password}=await getBody(req);
      DB=loadData();
      const sc=DB.schools.find(s=>s.username&&s.username.toLowerCase()===(username||'').toLowerCase()&&s.password===password&&s.active!==false);
      if(!sc)return jsend(res,401,{success:false,error:'Invalid username or password.'},o);
      if(sc.expiry&&new Date(sc.expiry)<new Date())return jsend(res,403,{success:false,error:'This account has expired. Please contact your administrator.'},o);
      return jsend(res,200,{success:true,school:{id:sc.id,name:sc.name,username:sc.username,program:sc.program,email:sc.email,password:sc.password}},o);
    }

    // ADMIN LOGIN
    if(req.method==='POST'&&url==='/api/admin/login'){
      const{password}=await getBody(req);
      if(password!==ADMIN_PASSWORD)return jsend(res,401,{success:false,error:'Invalid password.'},o);
      return jsend(res,200,{success:true},o);
    }

    // ADMIN: GET SCHOOLS
    if(req.method==='GET'&&url==='/api/admin/schools'){
      if(req.headers['x-admin-password']!==ADMIN_PASSWORD)return jsend(res,401,{error:'Unauthorized'},o);
      DB=loadData();
      return jsend(res,200,{schools:DB.schools.map(s=>({...s,studentCount:(s.students||[]).length,students:undefined}))},o);
    }

    // ADMIN: CREATE SCHOOL
    if(req.method==='POST'&&url==='/api/admin/schools'){
      if(req.headers['x-admin-password']!==ADMIN_PASSWORD)return jsend(res,401,{error:'Unauthorized'},o);
      const b=await getBody(req);DB=loadData();
      if(DB.schools.find(s=>s.username.toLowerCase()===b.username.toLowerCase()))return jsend(res,400,{error:'Username already exists.'},o);
      const sc={id:uid(),username:b.username,password:b.password,name:b.name,program:b.program||'',email:b.email||'',active:true,expiry:b.expiry||'2099-12-31',created:new Date().toISOString(),sessions:0,lastActive:null,students:[]};
      DB.schools.push(sc);saveData(DB);
      return jsend(res,200,{success:true,school:sc},o);
    }

    // ADMIN: UPDATE SCHOOL
    if(req.method==='PUT'&&url.startsWith('/api/admin/schools/')){
      if(req.headers['x-admin-password']!==ADMIN_PASSWORD)return jsend(res,401,{error:'Unauthorized'},o);
      const id=url.split('/').pop();const b=await getBody(req);DB=loadData();
      const i=DB.schools.findIndex(s=>s.id===id);
      if(i<0)return jsend(res,404,{error:'School not found.'},o);
      DB.schools[i]={...DB.schools[i],...b,id,students:DB.schools[i].students};
      saveData(DB);return jsend(res,200,{success:true},o);
    }

    // ADMIN: DELETE SCHOOL
    if(req.method==='DELETE'&&url.startsWith('/api/admin/schools/')){
      if(req.headers['x-admin-password']!==ADMIN_PASSWORD)return jsend(res,401,{error:'Unauthorized'},o);
      const id=url.split('/').pop();DB=loadData();
      DB.schools=DB.schools.filter(s=>s.id!==id);saveData(DB);
      return jsend(res,200,{success:true},o);
    }

    // SCHOOL: GET STUDENTS
    if(req.method==='GET'&&url.match(/\/api\/school\/[^/]+\/students$/)){
      const sid=url.split('/')[3];DB=loadData();
      const sc=DB.schools.find(s=>s.id===sid);
      if(!sc||sc.password!==req.headers['x-school-password'])return jsend(res,401,{error:'Unauthorized'},o);
      return jsend(res,200,{students:sc.students||[]},o);
    }

    // SCHOOL: ADD STUDENT
    if(req.method==='POST'&&url.match(/\/api\/school\/[^/]+\/students$/)){
      const sid=url.split('/')[3];DB=loadData();
      const sc=DB.schools.find(s=>s.id===sid);
      if(!sc||sc.password!==req.headers['x-school-password'])return jsend(res,401,{error:'Unauthorized'},o);
      const b=await getBody(req);
      if(!sc.students)sc.students=[];
      if(sc.students.find(s=>s.username.toLowerCase()===b.username.toLowerCase()))return jsend(res,400,{error:'Username already exists.'},o);
      const st={id:uid(),name:b.name,username:b.username,password:b.password,active:true,notes:b.notes||'',sessions:0,lastActive:null,created:new Date().toISOString()};
      sc.students.push(st);saveData(DB);
      return jsend(res,200,{success:true,student:st},o);
    }

    // SCHOOL: UPDATE STUDENT
    if(req.method==='PUT'&&url.match(/\/api\/school\/[^/]+\/students\/[^/]+$/)){
      const p=url.split('/');const sid=p[3],stid=p[5];DB=loadData();
      const sc=DB.schools.find(s=>s.id===sid);
      if(!sc||sc.password!==req.headers['x-school-password'])return jsend(res,401,{error:'Unauthorized'},o);
      const i=(sc.students||[]).findIndex(s=>s.id===stid);
      if(i<0)return jsend(res,404,{error:'Student not found.'},o);
      const b=await getBody(req);sc.students[i]={...sc.students[i],...b,id:stid};
      saveData(DB);return jsend(res,200,{success:true},o);
    }

    // SCHOOL: DELETE STUDENT
    if(req.method==='DELETE'&&url.match(/\/api\/school\/[^/]+\/students\/[^/]+$/)){
      const p=url.split('/');const sid=p[3],stid=p[5];DB=loadData();
      const sc=DB.schools.find(s=>s.id===sid);
      if(!sc||sc.password!==req.headers['x-school-password'])return jsend(res,401,{error:'Unauthorized'},o);
      sc.students=(sc.students||[]).filter(s=>s.id!==stid);
      saveData(DB);return jsend(res,200,{success:true},o);
    }

    // HEALTH CHECK — for keep-alive pings (no API cost)
    if(req.method==='GET'&&url==='/health'){
      res.writeHead(200,{...corsH(o),'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'ok',timestamp:new Date().toISOString()}));
      return;
    }

    jsend(res,404,{error:'Not found'},o);
  }catch(err){console.error('Error:',err.message);jsend(res,500,{error:'Internal server error'},o);}
});

server.listen(PORT,()=>{
  console.log(`GEDnius server on port ${PORT}`);
  console.log(`Data: ${DATA_FILE}`);
});
