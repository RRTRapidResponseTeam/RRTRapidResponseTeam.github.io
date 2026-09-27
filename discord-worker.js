/*
  RRT Auth Worker v0.3 — Cloudflare Worker для портала Rapid Response Team.

  Что делает:
  1) OAuth2-вход через Discord (scope: identify + guilds.members.read);
  2) проверяет, что пользователь состоит на сервере RRT, и читает его роли;
  3) выдаёт подписанный session-токен сайту на GitHub Pages;
  4) хранит состав, прогресс тестов и отметки об опроснике (Cloudflare KV);
  5) раздаёт данные: /api/me, /api/roster, /api/progress, /api/form/*.

  Секреты задаются ТОЛЬКО в настройках воркера (Variables & Secrets):
    DISCORD_CLIENT_ID       — из Discord Developer Portal
    DISCORD_CLIENT_SECRET   — из Discord Developer Portal
    DISCORD_GUILD_ID        — 1523641828149039249
    SESSION_SECRET          — любая длинная случайная строка
    SITE_URL                — https://rrtrapidresponseteam.github.io
    GOOGLE_SHEET_CSV_URL    — (необязательно) ссылка CSV опубликованной Google-таблицы ответов
  KV-неймспейс привязывается как RRT_KV.

  Бот и его токен НЕ нужны: роли читаются через scope guilds.members.read.
*/

const GUILD_ID_FALLBACK = "1523641828149039249";

/* ID ролей Discord → уровень доступа. Порядок = приоритет. */
const ROLE_MAP = [
  { rank: "staff",   title: "ШТАБ",         roleId: "1523641828199497743" },
  { rank: "officer", title: "ОФИЦЕР",       roleId: "1523641828186919041" },
  { rank: "member",  title: "ОТРЯД RRT",    roleId: "1523641828174200938" },
  { rank: "recruit", title: "РЕКРУТ",       roleId: "1523641828174200937" },
  { rank: "talon",   title: "С ТАЛОНЧИКОМ", roleId: "1533566289627578419" }
];

const TESTS = [
  { id: "intro",    title: "Вводный инструктаж" },
  { id: "charter",  title: "Устав RRT" },
  { id: "rifleman", title: "Стрелковая подготовка" },
  { id: "radio",    title: "Радиосвязь" },
  { id: "tactics",  title: "Базовая тактика" }
];

const TTL = 60 * 60 * 24 * 7; // сессия: 7 дней

/* ---------- подписанные токены (HMAC-SHA256) ---------- */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function sign(data, secret) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function makeToken(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return body + "." + (await sign(body, secret));
}
async function verifyToken(t, secret) {
  try {
    const [body, sig] = String(t || "").split(".");
    if (!body || !sig) return null;
    if ((await sign(body, secret)) !== sig) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}

/* ---------- KV (с fallback в память для тестов) ---------- */
const mem = (() => { const m = new Map(); return {
  async get(k) { return m.has(k) ? m.get(k) : null; },
  async put(k, v) { m.set(k, v); },
  async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ name: k })) }; }
}; })();
function kv(env) { return env.RRT_KV || mem; }
async function kvGet(env, key, def = null) {
  try { const v = await kv(env).get(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
}
async function kvPut(env, key, val) { try { await kv(env).put(key, JSON.stringify(val)); } catch (e) {} }
async function kvList(env, prefix) {
  try {
    const l = await kv(env).list({ prefix });
    const out = [];
    for (const k of l.keys || []) { const v = await kvGet(env, k.name); if (v) out.push(v); }
    return out;
  } catch (e) { return []; }
}

/* ---------- утилиты ---------- */
function rankOf(roleIds) {
  for (const r of ROLE_MAP) if ((roleIds || []).includes(r.roleId)) return r;
  return null;
}
function rankWeight(rank) { return { staff: 5, officer: 4, member: 3, recruit: 2, talon: 1, guest: 0 }[rank] || 0; }
function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((p) => { const i = p.indexOf("="); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function allowedOrigin(origin, env) {
  const list = [env.SITE_URL && env.SITE_URL.replace(/\/$/, ""), "http://localhost:3000", "http://127.0.0.1:3000"].filter(Boolean);
  return origin && list.includes(origin) ? origin : (env.SITE_URL || "*");
}
function json(env, origin, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin } });
}
function htmlResp(text, status) {
  return new Response('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>RRT Auth</title></head>' +
    '<body style="font-family:monospace;background:#0e0f0a;color:#e6e4d2;display:grid;place-items:center;min-height:100vh">' +
    '<div style="max-width:520px;text-align:center;border:1px solid #5a5d3a;padding:34px;border-radius:8px">' +
    '<div style="color:#c9a94a;letter-spacing:2px">RAPID RESPONSE TEAM</div><p style="line-height:1.7">' + text + '</p>' +
    '<a href="' + (this && 0) + '" style="color:#cf3d28"></a></div></body></html>', { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------- OAuth ---------- */
async function handleAuthStart(req, env, url) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return htmlResp("Worker не настроен: задай DISCORD_CLIENT_ID и DISCORD_CLIENT_SECRET в Variables & Secrets (README, шаг 3).", 500);
  const ret = url.searchParams.get("return_to") || env.SITE_URL || "";
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.DISCORD_CLIENT_ID,
    scope: "identify guilds.members.read",
    state,
    redirect_uri: url.origin + "/auth/callback",
    prompt: "consent"
  });
  const h = new Headers({ Location: "https://discord.com/oauth2/authorize?" + params });
  h.append("Set-Cookie", "rrt_state=" + state + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600");
  h.append("Set-Cookie", "rrt_return=" + encodeURIComponent(ret) + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600");
  return new Response(null, { status: 302, headers: h });
}

async function handleCallback(req, env, url) {
  if (!env.SESSION_SECRET) return htmlResp("Worker не настроен: задай SESSION_SECRET в Variables & Secrets (README, шаг 3).", 500);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(req.headers.get("Cookie"));
  if (!code || !state || cookies["rrt_state"] !== state) return htmlResp("Ошибка OAuth: не сошёлся state. <a href=\"/auth/discord\" style=\"color:#cf3d28\">Войти заново</a>.", 400);

  const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: url.origin + "/auth/callback"
    })
  });
  if (!tokenResp.ok) return htmlResp("Не удалось получить токен Discord (проверь CLIENT_ID/SECRET и redirect URI).", 502);
  const td = await tokenResp.json();

  const me = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + td.access_token } }).then((r) => r.json());
  const gid = env.DISCORD_GUILD_ID || GUILD_ID_FALLBACK;
  const mr = await fetch("https://discord.com/api/users/@me/guilds/" + gid + "/member", { headers: { Authorization: "Bearer " + td.access_token } });
  if (!mr.ok) return htmlResp("Этот Discord-аккаунт не найден на сервере RRT. Вступи на сервер отряда и войди снова.", 403);
  const member = await mr.json();

  const roleIds = member.roles || [];
  const r = rankOf(roleIds);
  const now = Date.now();
  const payload = {
    sub: me.id,
    username: me.username,
    global_name: me.global_name || null,
    avatar: me.avatar ? "https://cdn.discordapp.com/avatars/" + me.id + "/" + me.avatar + ".png" : null,
    roleIds,
    rank: r ? r.rank : "guest",
    rankTitle: r ? r.title : "БЕЗ РОЛИ ДОСТУПА",
    exp: now + TTL * 1000
  };

  const prev = await kvGet(env, "user:" + me.id, {});
  await kvPut(env, "user:" + me.id, {
    id: me.id,
    username: me.username,
    global_name: me.global_name || me.username,
    avatar: payload.avatar,
    roleIds,
    rank: payload.rank,
    rankTitle: payload.rankTitle,
    firstSeen: prev.firstSeen || now,
    lastSeen: now
  });

  const t = await makeToken(payload, env.SESSION_SECRET);
  const ret = (cookies["rrt_return"] || env.SITE_URL || url.origin).replace(/\/$/, "");
  return new Response(null, { status: 302, headers: { Location: ret + "/#auth=" + encodeURIComponent(t) } });
}

/* ---------- API ---------- */
async function handleApi(req, env, url, origin) {
  const p = url.pathname;
  if (req.method === "GET" && p === "/api/config") {
    return json(env, origin, { guildId: env.DISCORD_GUILD_ID || GUILD_ID_FALLBACK, tests: TESTS, kv: !!env.RRT_KV, sheet: !!env.GOOGLE_SHEET_CSV_URL, roles: ROLE_MAP });
  }
  const me = await verifyToken(String(req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), env.SESSION_SECRET || "");
  if (!me) return json(env, origin, { error: "unauthorized" }, 401);

  if (req.method === "GET" && p === "/api/me") return json(env, origin, me);

  if (req.method === "GET" && p === "/api/progress/me") {
    return json(env, origin, await kvGet(env, "progress:" + me.sub, { tests: {}, updatedAt: null }));
  }
  if (req.method === "GET" && p === "/api/form/mine") {
    return json(env, origin, { submission: await kvGet(env, "sub:" + me.sub) });
  }
  if (req.method === "POST" && p === "/api/form/submit") {
    const prev = await kvGet(env, "sub:" + me.sub);
    const sub = (prev && prev.status === "reviewed") ? prev : {
      uid: me.sub, nick: me.global_name || me.username, username: me.username,
      date: new Date().toISOString(), status: "new"
    };
    await kvPut(env, "sub:" + me.sub, sub);
    return json(env, origin, { ok: true, submission: sub });
  }
  if (req.method === "GET" && p === "/api/roster") {
    if (!["officer", "staff"].includes(me.rank)) return json(env, origin, { error: "forbidden" }, 403);
    const users = await kvList(env, "user:");
    const roster = [];
    for (const u of users) roster.push(Object.assign({}, u, { progress: await kvGet(env, "progress:" + u.id, { tests: {} }) }));
    roster.sort((a, b) => rankWeight(b.rank) - rankWeight(a.rank) || String(a.global_name).localeCompare(String(b.global_name)));
    return json(env, origin, { roster });
  }
  const pm = p.match(/^\/api\/progress\/(\d{5,25})$/);
  if (pm && req.method === "POST") {
    if (me.rank !== "staff") return json(env, origin, { error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const cleaned = {};
    for (const t of TESTS) if (body && body.tests && body.tests[t.id]) cleaned[t.id] = true;
    const rec = { tests: cleaned, updatedAt: new Date().toISOString(), updatedBy: me.sub };
    await kvPut(env, "progress:" + pm[1], rec);
    return json(env, origin, { ok: true, progress: rec });
  }
  if (req.method === "GET" && p === "/api/form/responses") {
    if (me.rank !== "staff") return json(env, origin, { error: "forbidden" }, 403);
    const subs = (await kvList(env, "sub:")).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    let sheet = null;
    if (env.GOOGLE_SHEET_CSV_URL) {
      try {
        const csv = await fetch(env.GOOGLE_SHEET_CSV_URL).then((r) => r.text());
        const rows = parseCSV(csv);
        sheet = { headers: rows[0] || [], rows: rows.slice(1, 201) };
      } catch (e) { sheet = { error: "Не удалось загрузить Google-таблицу" }; }
    }
    return json(env, origin, { submissions: subs, sheet });
  }
  if (req.method === "POST" && p === "/api/form/review") {
    if (me.rank !== "staff") return json(env, origin, { error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const s = await kvGet(env, "sub:" + body.uid);
    if (!s) return json(env, origin, { error: "not found" }, 404);
    s.status = body.status === "reviewed" ? "reviewed" : "new";
    await kvPut(env, "sub:" + body.uid, s);
    return json(env, origin, { ok: true, submission: s });
  }
  return json(env, origin, { error: "not found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req.headers.get("Origin"), env);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400"
      } });
    }
    const p = url.pathname;
    if (p === "/") return new Response("RRT Auth Worker v0.3 — online", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": origin } });
    if (p === "/auth/discord" && req.method === "GET") return handleAuthStart(req, env, url);
    if (p === "/auth/callback" && req.method === "GET") return handleCallback(req, env, url);
    if (p.startsWith("/api/")) return handleApi(req, env, url, origin);
    return new Response("Not found", { status: 404 });
  }
};
