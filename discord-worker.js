/*
 RRT Auth Worker v0.3.1 (Cloudflare Worker)
 Secrets:  DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, SESSION_SECRET,
           SHEET_SCRIPT_URL, SHEET_SCRIPT_TOKEN
 Vars:     SITE_URL = https://rrtrapidresponseteam.github.io
 KV binding (необязательно, для сохранения тестов): RRT_KV
 Discord Redirect: https://<worker>.workers.dev/auth/callback   Scopes: identify guilds.members.read
 Bot: пригласить на сервер RRT + в Developer Portal → Bot включить "Server Members Intent" (для списка состава).
*/
const GUILD_ID = "1523641828149039249";
const ROLE_LEVELS = {
  "1533566289627578419": 1, // С талончиком
  "1523641828174200937": 2, // Рекрут
  "1523641828174200938": 3, // Отряд RRT
  "1523641828186919041": 4, // Офицер
  "1523641828199497743": 5  // Штаб
};
const enc = new TextEncoder();
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"==".slice((s.length+3)%4)),c=>c.charCodeAt(0));
async function sign(d,s){const k=await crypto.subtle.importKey("raw",enc.encode(s),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(await crypto.subtle.sign("HMAC",k,enc.encode(d)));}
async function mkToken(p,s){const b=b64u(enc.encode(JSON.stringify(p)));return b+"."+await sign(b,s);}
async function verify(t,s){try{const[b,g]=t.split(".");if(!b||!g||await sign(b,s)!==g)return null;const p=JSON.parse(new TextDecoder().decode(unb64u(b)));return p.exp<Date.now()?null:p;}catch{return null;}}
const levelOf = roles => Math.max(0, ...(roles||[]).map(r => ROLE_LEVELS[r] || 0));
const avatarUrl = (id, av) => av ? `https://cdn.discordapp.com/avatars/${id}/${av}${av.startsWith("a_")?".gif":".png"}?size=128` : null;
async function roleMap(env){const r=await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});if(!r.ok)return new Map();return new Map((await r.json()).map(x=>[x.id,x.name]));}

export default {
 async fetch(req, env) {
  const url = new URL(req.url), site = env.SITE_URL.replace(/\/$/,"");
  const origin = new URL(site).origin;
  const cors = {"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
  const json = (d,s=200) => new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json",...cors}});
  if (req.method === "OPTIONS") return new Response(null,{headers:cors});

  if (url.pathname === "/auth/discord") {
   const state = crypto.randomUUID();
   const auth = "https://discord.com/oauth2/authorize?response_type=code&client_id="+encodeURIComponent(env.DISCORD_CLIENT_ID)+"&scope=identify%20guilds.members.read&state="+state+"&redirect_uri="+encodeURIComponent(url.origin+"/auth/callback")+"&prompt=consent";
   return new Response(null,{status:302,headers:{Location:auth,"Set-Cookie":`rrt_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`}});
  }
  if (url.pathname === "/auth/callback") {
   const fail = m => Response.redirect(site+"/#auth_error="+encodeURIComponent(m),302);
   const code = url.searchParams.get("code"), state = url.searchParams.get("state");
   if (!code || !state || !(req.headers.get("Cookie")||"").includes("rrt_state="+state)) return fail("Ошибка проверки входа. Попробуйте ещё раз.");
   const tr = await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:url.origin+"/auth/callback"})});
   if (!tr.ok) return fail("Discord не подтвердил вход.");
   const at = (await tr.json()).access_token;
   const me = await fetch("https://discord.com/api/users/@me",{headers:{Authorization:`Bearer ${at}`}}).then(r=>r.json());
   const mr = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`,{headers:{Authorization:`Bearer ${at}`}});
   if (!mr.ok) return fail("Этот Discord-аккаунт не состоит на сервере RRT.");
   const m = await mr.json();
   const t = await mkToken({sub:me.id,username:me.username,global_name:me.global_name,nick:m.nick||null,
     avatar:avatarUrl(me.id, me.avatar),
     roles:m.roles, joined_at:m.joined_at, exp:Date.now()+12*3600e3}, env.SESSION_SECRET);
   return new Response(null,{status:302,headers:{Location:site+"/#auth="+encodeURIComponent(t),"Set-Cookie":"rrt_state=; Max-Age=0; Path=/"}});
  }

  // --- authenticated API ---
  const a = req.headers.get("Authorization")||"";
  const p = await verify(a.startsWith("Bearer ")?a.slice(7):"", env.SESSION_SECRET);
  if (!p) return json({error:"unauthorized"},401);
  // перечитываем роли ботом, чтобы изменения в Discord применялись сразу
  let roles = p.roles, map = new Map();
  if (env.DISCORD_BOT_TOKEN) {
   const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${p.sub}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
   if (r.status === 404) return json({error:"not a member"},403);
   if (r.ok) { const m = await r.json(); roles = m.roles; p.nick = m.nick || p.nick; }
   map = await roleMap(env);
  }
  const level = levelOf(roles);

  if (url.pathname === "/api/me")
   return json({...p, roles, role_names: roles.filter(r=>map.has(r)).map(r=>map.get(r)), level});

  if (url.pathname === "/api/tests") {
   if (level < 2) return json({error:"forbidden"},403);
   const key = "tests:"+p.sub, cur = env.RRT_KV ? JSON.parse(await env.RRT_KV.get(key)||"{}") : {};
   if (req.method === "POST") {
    const {id, score} = await req.json();
    if (typeof id !== "string" || id.length > 40 || typeof score !== "number" || score < 80 || score > 100) return json({error:"bad"},400);
    cur[id] = {score, at: Date.now()}; if (env.RRT_KV) await env.RRT_KV.put(key, JSON.stringify(cur));
   }
   return json({passed: cur});
  }

  if (url.pathname === "/api/roster") {
   if (level < 3) return json({error:"forbidden"},403);
   const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
   if (!r.ok) return json({error:"Discord вернул "+r.status+(r.status===403?" — включи SERVER MEMBERS INTENT в Developer Portal → Bot":"")},502);
   const list = (await r.json()).filter(m=>!m.user.bot).map(m=>({id:m.user.id,name:m.nick||m.user.global_name||m.user.username,avatar:avatarUrl(m.user.id,m.user.avatar),level:levelOf(m.roles),role_names:m.roles.filter(x=>ROLE_LEVELS[x]).map(x=>map.get(x)||x)})).filter(m=>m.level>0).sort((x,y)=>y.level-x.level||String(x.name).localeCompare(String(y.name)));
   if (level >= 4 && env.RRT_KV) for (const m of list) m.tests = Object.keys(JSON.parse(await env.RRT_KV.get("tests:"+m.id)||"{}")).length;
   return json({members:list});
  }

  if (url.pathname === "/api/admin/survey") {
   if (level < 5) return json({error:"forbidden"},403);
   if (!env.SHEET_SCRIPT_URL) return json({error:"sheet not configured"},500);
   const r = await fetch(env.SHEET_SCRIPT_URL+"?token="+encodeURIComponent(env.SHEET_SCRIPT_TOKEN));
   if (!r.ok) return json({error:"sheet "+r.status},502);
   return json(await r.json());
  }
  return json({error:"not found"},404);
 }
};
