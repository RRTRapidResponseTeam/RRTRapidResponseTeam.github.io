/* RRT UNIT PORTAL v0.3 — вход через Discord, роли, кабинет, опросник, админ-панель */
"use strict";

const CONFIG = {
  /* Адрес Cloudflare Worker с авторизацией (см. README, шаг 4). */
  WORKER_URL: "https://rrt-auth.ВАШ-САБДОМЕН.workers.dev",
  /* Discord-сервер отряда RRT */
  GUILD_ID: "1523641828149039249",
  /* Google-форма опросника */
  FORM_URL: "https://docs.google.com/forms/d/e/1FAIpQLSdJkMzE3pGGnDtjx0J0xEmmKdADfjEPuZ43oUyxq5cRoVNsdg/viewform?embedded=true",
  /* ID ролей Discord → название */
  ROLE_NAMES: {
    "1533566289627578419": "С талончиком",
    "1523641828174200937": "Рекрут",
    "1523641828174200938": "Отряд RRT",
    "1523641828186919041": "Офицер",
    "1523641828199497743": "Штаб"
  },
  RANK_TITLES: {
    talon: "С ТАЛОНЧИКОМ",
    recruit: "РЕКРУТ",
    member: "ОТРЯД RRT",
    officer: "ОФИЦЕР",
    staff: "ШТАБ",
    guest: "БЕЗ РОЛИ ДОСТУПА"
  },
  TESTS: [
    { id: "intro", title: "Вводный инструктаж" },
    { id: "charter", title: "Устав RRT" },
    { id: "rifleman", title: "Стрелковая подготовка" },
    { id: "radio", title: "Радиосвязь" },
    { id: "tactics", title: "Базовая тактика" }
  ],
  QUALS: [
    { id: "fighter", title: "Боец", req: "intro" },
    { id: "charter", title: "Зачёт по уставу", req: "charter" },
    { id: "rifleman", title: "Стрелок", req: "rifleman" },
    { id: "signal", title: "Связист", req: "radio" },
    { id: "tactician", title: "Тактик", req: "tactics" },
    { id: "leader", title: "Лидер", req: "tactics" }
  ]
};

/* Какие разделы открыты каждому уровню доступа */
const ACCESS = {
  guest: ["home"],
  talon: ["survey"],
  recruit: ["home", "guide", "training", "cabinet", "survey"],
  member: ["home", "guide", "training", "roles", "roster", "rules", "cabinet", "survey"],
  officer: ["home", "guide", "training", "roles", "roster", "rules", "cabinet", "survey", "officer"],
  staff: ["home", "guide", "training", "roles", "roster", "rules", "cabinet", "survey", "officer", "admin"]
};

const S = { token: null, me: null, progress: { tests: {} }, roster: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return iso || "—"; } };
const workerReady = () => !!CONFIG.WORKER_URL && !/ВАШ-САБДОМЕН|YOUR-/i.test(CONFIG.WORKER_URL);

function api(path, opts = {}) {
  return fetch(CONFIG.WORKER_URL + path, Object.assign({}, opts, {
    headers: Object.assign({ "Content-Type": "application/json" }, S.token ? { Authorization: "Bearer " + S.token } : {}, opts.headers || {})
  }));
}

/* ---------- НАВИГАЦИЯ ---------- */
const pages = [...document.querySelectorAll(".page")];
function openPage(id) {
  pages.forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === id));
  renderPage(id);
  scrollTo({ top: 0, behavior: "smooth" });
}
function rank() { return S.me ? (S.me.rank || "guest") : "guest"; }
function allowedPages() { return ACCESS[rank()] || ACCESS.guest; }
function applyAccess() {
  document.querySelectorAll(".nav-item").forEach((b) => { b.style.display = allowedPages().includes(b.dataset.page) ? "" : "none"; });
  const active = document.querySelector(".page.active");
  if (!active || !allowedPages().includes(active.id)) openPage(allowedPages()[0]);
}
function renderPage(id) {
  if (id === "home") renderHomeProfile();
  if (id === "cabinet") renderCabinet();
  if (id === "survey") renderSurvey();
  if (id === "roster") renderRoster();
  if (id === "officer") renderOfficer();
  if (id === "admin") renderAdmin();
}

/* ---------- АВТОРИЗАЦИЯ ---------- */
function login() {
  if (!workerReady()) {
    alert("Discord-авторизация ещё не настроена:\n1) разверни discord-worker.js на Cloudflare (README, шаги 2–3);\n2) впиши адрес воркера в CONFIG.WORKER_URL в script.js (README, шаг 4).");
    return;
  }
  location.href = CONFIG.WORKER_URL + "/auth/discord?return_to=" + encodeURIComponent(location.origin + location.pathname);
}
function logout() { try { localStorage.removeItem("rrt_session"); } catch (e) {} location.href = location.pathname; }

async function loadMe() {
  try {
    const r = await api("/api/me");
    if (!r.ok) { S.token = null; try { localStorage.removeItem("rrt_session"); } catch (e) {} return; }
    S.me = await r.json();
    const p = await api("/api/progress/me");
    if (p.ok) S.progress = await p.json();
  } catch (e) { console.warn("RRT auth:", e); }
}

function renderAccount() {
  const box = $("account");
  if (!S.me) { box.innerHTML = '<button class="discord-login" id="loginBtn" data-testid="login-btn">ВОЙТИ ЧЕРЕЗ DISCORD</button>'; return; }
  const av = S.me.avatar ? '<img src="' + esc(S.me.avatar) + '" alt="">' : '<div class="uc-letter">RRT</div>';
  box.innerHTML = '<div class="userchip">' + av + '<div><div class="uc-name">' + esc(S.me.global_name || S.me.username) + '</div><div class="uc-rank">' + esc(CONFIG.RANK_TITLES[S.me.rank] || "") + '</div></div></div><button class="logout-btn" id="logoutBtn" data-testid="logout-btn">ВЫЙТИ</button>';
}

function renderHomeProfile() {
  if (!S.me) return;
  $("username").textContent = S.me.global_name || S.me.username || "Discord User";
  $("profileStatus").textContent = CONFIG.RANK_TITLES[S.me.rank] || "MEMBER";
  $("accessState").textContent = CONFIG.RANK_TITLES[S.me.rank] || "MEMBER";
  $("accessText").textContent = CONFIG.RANK_TITLES[S.me.rank] || "MEMBER";
  const ids = S.me.roleIds || [];
  $("roleCount").textContent = ids.length;
  $("roleLine").textContent = ids.length ? ids.map((id) => CONFIG.ROLE_NAMES[id] || id).join(" • ") : "Роли доступа не найдены — обратись к Штабу.";
  if (S.me.avatar) $("avatar").innerHTML = '<img style="width:100%;height:100%;border-radius:50%" src="' + esc(S.me.avatar) + '" alt="">';
  const db = $("discordBox");
  if (db) db.innerHTML = '<span class="dot ok"></span> Discord подключён<br><small>Роль: ' + esc(CONFIG.RANK_TITLES[S.me.rank] || "—") + '. Роли обновляются при каждом входе.</small>';
}

/* ---------- ЛИЧНЫЙ КАБИНЕТ ---------- */
function renderProgress(box) {
  const t = (S.progress && S.progress.tests) || {};
  const passed = CONFIG.TESTS.filter((x) => t[x.id]).length;
  const pct = Math.round(passed / CONFIG.TESTS.length * 100);
  box.innerHTML = '<div class="progress-num">ПРОЙДЕНО ' + passed + ' ИЗ ' + CONFIG.TESTS.length + ' — ' + pct + '%</div><div class="progress"><i style="width:' + pct + '%"></i></div>' +
    CONFIG.TESTS.map((x) => '<div class="test-row ' + (t[x.id] ? "done" : "") + '"><span class="test-ic ' + (t[x.id] ? "ok" : "no") + '">' + (t[x.id] ? "✓" : "□") + '</span><span class="t-name">' + esc(x.title) + '</span></div>').join("");
}
function renderCabinet() {
  if (!S.me) return;
  const me = S.me, ids = me.roleIds || [];
  $("cabinetProfile").innerHTML = '<div class="avatar">' + (me.avatar ? '<img style="width:100%;height:100%" src="' + esc(me.avatar) + '" alt="">' : "RRT") + '</div>' +
    '<div><div class="eyebrow">DISCORD USER</div><h2>' + esc(me.global_name || me.username) + '</h2><div class="muted">Discord ID: ' + esc(me.sub) + '</div><div style="margin-top:8px">' +
    (ids.length ? ids.map((id) => '<span class="rank-badge ' + esc(me.rank) + '">' + esc(CONFIG.ROLE_NAMES[id] || id) + '</span>').join("") : '<span class="muted">Роли доступа не найдены — обратись к Штабу.</span>') + '</div></div>' +
    '<div class="profile-status">' + esc(CONFIG.RANK_TITLES[me.rank] || "") + '</div>';
  $("cabinetMeta").innerHTML = '<div class="eyebrow" style="margin-bottom:8px">ДАННЫЕ ДОСТУПА</div>' +
    '<div class="kv-line"><span>Уровень доступа</span><b>' + esc(CONFIG.RANK_TITLES[me.rank] || "—") + '</b></div>' +
    '<div class="kv-line"><span>Сервер RRT</span><b>' + esc(CONFIG.GUILD_ID) + '</b></div>' +
    '<div class="kv-line"><span>Ролей Discord</span><b>' + ids.length + '</b></div>' +
    '<div class="kv-line"><span>Опросник</span><b id="cabSurveyState">—</b></div>';
  renderProgress($("cabinetProgress"));
  const t = (S.progress && S.progress.tests) || {};
  $("cabinetQuals").innerHTML = CONFIG.QUALS.map((q) => {
    const done = !!t[q.req];
    return '<article class="card qual-card ' + (done ? "" : "locked") + '"><div class="q-ic">' + (done ? "★" : "🔒") + '</div><h3>' + esc(q.title) + '</h3><div class="muted">' + (done ? "Получена" : "Требуется тест") + '</div></article>';
  }).join("");
}

/* ---------- ОПРОСНИК ---------- */
let surveyLoaded = false;
function renderSurvey() {
  if (!surveyLoaded) { $("surveyFrame").src = CONFIG.FORM_URL; surveyLoaded = true; }
  updateSurveyStatus();
}
async function updateSurveyStatus() {
  const box = $("surveyStatus"), btn = $("surveySubmitBtn"), cab = $("cabSurveyState");
  if (!S.me || !workerReady()) {
    box.innerHTML = S.me ? "<b>СТАТУС: СЕРВИС НЕ НАСТРОЕН</b><br>Адрес авторизации не подключён (README, шаг 4)." : "<b>СТАТУС: ГОСТЬ</b><br>Войди через Discord, чтобы отметить заполнение анкеты.";
    if (btn) btn.style.display = "none";
    return;
  }
  if (btn) btn.style.display = "";
  box.innerHTML = "<b>СТАТУС: ПРОВЕРКА…</b>";
  try {
    const r = await api("/api/form/mine");
    const d = r.ok ? await r.json() : null;
    if (d && d.submission) {
      box.innerHTML = "<b>СТАТУС: ЗАПОЛНЕН ✓</b><br>Отмечено: " + fmtDate(d.submission.date) + (d.submission.status === "reviewed" ? " • Рассмотрено Штабом" : "");
      if (btn) btn.style.display = "none";
      if (cab) cab.textContent = "Заполнен";
    } else {
      box.innerHTML = "<b>СТАТУС: НЕ ЗАПОЛНЕН</b><br>Заполни форму ниже и нажми кнопку подтверждения.";
      if (cab) cab.textContent = "Не заполнен";
    }
  } catch (e) {
    box.innerHTML = "<b>СТАТУС: НЕИЗВЕСТЕН</b><br>Сервис авторизации недоступен.";
  }
}

/* ---------- ЛИЧНЫЙ СОСТАВ / ОФИЦЕР ---------- */
function rosterTable(list, withProgress) {
  let html = '<div class="table-card"><table><thead><tr><th>БОЕЦ</th><th>ДОСТУП</th><th>РОЛИ DISCORD</th>' + (withProgress ? "<th>ТЕСТЫ</th>" : "") + '<th>ПОСЛЕДНИЙ ВХОД</th></tr></thead><tbody>';
  if (!list.length) html += '<tr><td colspan="5" class="muted">Состав пуст — пока никто не входил на портал.</td></tr>';
  list.forEach((u) => {
    const passed = CONFIG.TESTS.filter((t) => u.progress && u.progress.tests && u.progress.tests[t.id]).length;
    html += '<tr><td><b>' + esc(u.global_name || u.username) + '</b><div class="muted">' + esc(u.username || "") + '</div></td>' +
      '<td><span class="rank-badge ' + esc(u.rank || "") + '">' + esc(CONFIG.RANK_TITLES[u.rank] || u.rankTitle || "—") + '</span></td>' +
      '<td>' + ((u.roleIds || []).map((id) => esc(CONFIG.ROLE_NAMES[id] || id)).join(", ") || '<span class="muted">—</span>') + '</td>' +
      (withProgress ? "<td>" + passed + " / " + CONFIG.TESTS.length + "</td>" : "") +
      "<td>" + fmtDate(u.lastSeen) + "</td></tr>";
  });
  return html + "</tbody></table></div>";
}
async function loadRoster() {
  const r = await api("/api/roster");
  if (!r.ok) throw new Error("roster " + r.status);
  S.roster = (await r.json()).roster || [];
  return S.roster;
}
async function renderRoster() {
  const box = $("rosterContent");
  if (!S.me || !["member", "officer", "staff"].includes(rank())) return;
  box.innerHTML = '<div class="muted">Загрузка состава…</div>';
  try { box.innerHTML = rosterTable(await loadRoster(), false); }
  catch (e) { box.innerHTML = '<div class="muted">Не удалось загрузить состав. Сервис авторизации недоступен.</div>'; }
}
async function renderOfficer() {
  const box = $("officerContent");
  box.innerHTML = '<div class="muted">Загрузка…</div>';
  try {
    const list = await loadRoster();
    const byRank = ACCESS;
    const counts = Object.keys(CONFIG.RANK_TITLES).map((rk) => ({ rk, n: list.filter((u) => u.rank === rk).length })).filter((x) => x.n);
    box.innerHTML = '<div class="stat-grid" style="margin-bottom:16px">' + counts.map((c) => '<article class="card stat-card"><div class="eyebrow">' + esc(CONFIG.RANK_TITLES[c.rk]) + '</div><div class="stat-number">' + c.n + '</div></article>').join("") + '</div>' +
      '<div class="section-title" style="margin-top:6px">ПРОГРЕСС БОЙЦОВ</div>' + rosterTable(list, true);
  } catch (e) { box.innerHTML = '<div class="muted">Не удалось загрузить данные.</div>'; }
}

/* ---------- ПАНЕЛЬ АДМИНИСТРАТОРА (ШТАБ) ---------- */
let adminTab = "overview";
async function renderAdmin() {
  if (rank() !== "staff") { $("adminContent").innerHTML = '<div class="muted">Доступ только для роли Штаб.</div>'; return; }
  renderAdminTab();
}
async function renderAdminTab() {
  const box = $("adminContent");
  box.innerHTML = '<div class="muted">Загрузка…</div>';
  try {
    if (adminTab === "overview") {
      const list = await loadRoster();
      const fr = await api("/api/form/responses");
      const fd = fr.ok ? await fr.json() : { submissions: [], sheet: null };
      const subs = fd.submissions || [];
      const fresh = subs.filter((s) => s.status !== "reviewed").length;
      const cnt = (rk) => list.filter((u) => u.rank === rk).length;
      box.innerHTML = '<div class="stat-grid">' +
        '<article class="card stat-card"><div class="eyebrow">ВСЕГО БОЙЦОВ</div><div class="stat-number">' + list.length + '</div></article>' +
        '<article class="card stat-card"><div class="eyebrow">РЕКРУТЫ</div><div class="stat-number">' + cnt("recruit") + '</div></article>' +
        '<article class="card stat-card"><div class="eyebrow">ОПОСНИК: НОВЫЕ</div><div class="stat-number">' + fresh + '</div></article>' +
        '<article class="card stat-card"><div class="eyebrow">ОПОСНИК: ВСЕГО</div><div class="stat-number">' + subs.length + '</div></article>' +
        '</div><div class="section-title">РАСПРЕДЕЛЕНИЕ ПО РОЛЯМ</div>' +
        '<div class="kv-line"><span>Штаб</span><b>' + cnt("staff") + '</b></div><div class="kv-line"><span>Офицеры</span><b>' + cnt("officer") + '</b></div>' +
        '<div class="kv-line"><span>Отряд RRT</span><b>' + cnt("member") + '</b></div><div class="kv-line"><span>Рекруты</span><b>' + cnt("recruit") + '</b></div>' +
        '<div class="kv-line"><span>С талончиком</span><b>' + cnt("talon") + '</b></div><div class="kv-line"><span>Без роли доступа</span><b>' + cnt("guest") + '</b></div>';
    } else if (adminTab === "personnel") {
      const list = await loadRoster();
      box.innerHTML = (list.length ? list.map((u) => {
        const t = (u.progress && u.progress.tests) || {};
        const checks = CONFIG.TESTS.map((x) => '<label><input type="checkbox" class="chk" data-uid="' + esc(u.id) + '" data-test="' + x.id + '"' + (t[x.id] ? " checked" : "") + '> ' + esc(x.title) + '</label>').join("");
        return '<div class="sub-detail"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>' + esc(u.global_name || u.username) + '</b> <span class="rank-badge ' + esc(u.rank || "") + '">' + esc(u.rankTitle || "") + '</span></div><div class="muted">вход: ' + fmtDate(u.lastSeen) + '</div></div>' +
          '<div class="edit-grid">' + checks + '</div><button class="btn-primary" data-action="saveProgress" data-uid="' + esc(u.id) + '" data-testid="save-progress-btn">СОХРАНИТЬ ПРОГРЕСС</button></div>';
      }).join("") : '<div class="muted">Состав пуст — пока никто не входил на портал.</div>');
    } else if (adminTab === "survey") {
      const fr = await api("/api/form/responses");
      const fd = fr.ok ? await fr.json() : { submissions: [], sheet: null };
      const subs = (fd.submissions || []).slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      let html = '<div class="section-title" style="margin-top:0">ЗАПОЛНЕНИЯ С САЙТА (' + subs.length + ')</div>';
      html += subs.length ? '<div class="table-card"><table><thead><tr><th>ДАТА</th><th>DISCORD</th><th>СТАТУС</th><th>ДЕЙСТВИЕ</th></tr></thead><tbody>' +
        subs.map((s) => '<tr><td>' + fmtDate(s.date) + '</td><td><b>' + esc(s.nick || s.username || "") + '</b><div class="muted">' + esc(s.username || "") + '</div></td>' +
          '<td><span class="status-pill ' + (s.status === "reviewed" ? "reviewed" : "new") + '">' + (s.status === "reviewed" ? "РАССМОТРЕН" : "НОВЫЙ") + '</span></td>' +
          '<td><span class="rowlink" data-action="review" data-uid="' + esc(s.uid) + '" data-next="' + (s.status === "reviewed" ? "new" : "reviewed") + '">' + (s.status === "reviewed" ? "вернуть в новые" : "пометить рассмотренным") + '</span></td></tr>').join("") +
        '</tbody></table></div>' : '<div class="muted">Пока никто не отметил заполнение опросника.</div>';
      html += '<div class="section-title">ОТВЕТЫ ИЗ GOOGLE ФОРМЫ</div>';
      if (fd.sheet && fd.sheet.rows) {
        const heads = fd.sheet.headers || [];
        html += '<div class="notice" style="margin-bottom:10px">Данные из подключённой Google-таблицы. Первая строка таблицы — вопросы.</div><div class="table-card" style="max-height:520px;overflow:auto"><table><thead><tr>' + heads.map((h) => "<th>" + esc(h) + "</th>").join("") + '</tr></thead><tbody>' +
          fd.sheet.rows.map((r) => "<tr>" + heads.map((_, i) => "<td>" + esc((r && r[i]) || "") + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
      } else {
        html += '<div class="notice"><b>Google-таблица не подключена.</b><br>Чтобы видеть сами ответы (текст ответов, а не только факт заполнения): свяжи форму с Google-таблицей → Файл → «Поделиться» → «Опубликовать в интернете» → CSV → вставь ссылку в секрет GOOGLE_SHEET_CSV_URL воркера. Подробно — README, шаг 5.</div>';
      }
      box.innerHTML = html;
    } else if (adminTab === "training") {
      const list = S.roster || (await loadRoster());
      box.innerHTML = '<div class="section-title" style="margin-top:0">ТЕСТЫ И СДАЧА</div>' + CONFIG.TESTS.map((x) => {
        const n = list.filter((u) => u.progress && u.progress.tests && u.progress.tests[x.id]).length;
        return '<div class="kv-line"><span>' + esc(x.title) + '</span><b>сдали: ' + n + ' из ' + list.length + '</b></div>';
      }).join("") + '<div class="notice" style="margin-top:12px">Прогресс отмечается на вкладке «Личный состав».</div>';
    } else if (adminTab === "rolestab") {
      const desc = { staff: "Полный доступ + панель администратора", officer: "Всё как у Отряда RRT + офицерский раздел", member: "Полный пользовательский доступ, без админки", recruit: "Руководство + Обучение + Личный кабинет + Опросник", talon: "Только Опросник" };
      box.innerHTML = '<div class="section-title" style="margin-top:0">СООТВЕТСТВИЕ РОЛЕЙ DISCORD И ДОСТУПА САЙТА</div><div class="table-card"><table><thead><tr><th>ROLE ID</th><th>РОЛЬ</th><th>ДОСТУП НА САЙТЕ</th></tr></thead><tbody>' +
        [["1523641828199497743", "Штаб", "staff"], ["1523641828186919041", "Офицер", "officer"], ["1523641828174200938", "Отряд RRT", "member"], ["1523641828174200937", "Рекрут", "recruit"], ["1533566289627578419", "С талончиком", "talon"]]
          .map((r) => "<tr><td>" + esc(r[0]) + '</td><td><span class="rank-badge ' + r[2] + '">' + esc(r[1]) + '</span></td><td>' + desc[r[2]] + "</td></tr>").join("") +
        '</tbody></table></div><div class="notice" style="margin-top:12px">Приоритет: Штаб → Офицер → Отряд RRT → Рекрут → С талончиком. Роли обновляются при каждом входе через Discord.</div>';
    } else if (adminTab === "settings") {
      const c = await api("/api/config");
      const cfg = c.ok ? await c.json() : {};
      box.innerHTML = '<div class="section-title" style="margin-top:0">КОНФИГУРАЦИЯ</div>' +
        '<div class="kv-line"><span>Worker (авторизация)</span><b>' + esc(CONFIG.WORKER_URL) + '</b></div>' +
        '<div class="kv-line"><span>Discord Guild ID</span><b>' + esc(cfg.guildId || CONFIG.GUILD_ID) + '</b></div>' +
        '<div class="kv-line"><span>KV-хранилище</span><b>' + (cfg.kv ? "подключено ✓" : "не подключено — данные живут до перезапуска воркера") + '</b></div>' +
        '<div class="kv-line"><span>Google-таблица ответов</span><b>' + (cfg.sheet ? "подключена ✓" : "не подключена") + '</b></div>' +
        '<div class="kv-line"><span>Google-форма</span><b>1FAIpQLSdJkMz…(опросник RRT)</b></div>' +
        '<div class="notice" style="margin-top:12px">Секреты хранятся только в настройках Cloudflare Worker и никогда не попадают на GitHub Pages.</div>';
    }
  } catch (e) { box.innerHTML = '<div class="muted">Ошибка загрузки данных. Проверь настройку воркера.</div>'; }
}

/* ---------- СТАРТ ---------- */
function bindStatic() {
  $("account").addEventListener("click", (e) => {
    if (e.target.id === "loginBtn" || e.target.closest("#loginBtn")) login();
    if (e.target.id === "logoutBtn" || e.target.closest("#logoutBtn")) logout();
  });
  document.querySelectorAll("[data-page]").forEach((el) => el.addEventListener("click", () => {
    const p = el.dataset.page;
    if (!allowedPages().includes(p)) { if (!S.me) login(); return; }
    openPage(p);
  }));
  $("surveySubmitBtn").addEventListener("click", async () => {
    if (!S.me) { login(); return; }
    const btn = $("surveySubmitBtn");
    btn.disabled = true; btn.textContent = "ОТПРАВКА…";
    try {
      const r = await api("/api/form/submit", { method: "POST", body: "{}" });
      const d = r.ok ? await r.json() : null;
      if (d && d.ok) {
        $("surveyStatus").innerHTML = "<b>СТАТУС: ЗАПОЛНЕН ✓</b><br>Отмечено: " + fmtDate(d.submission.date) + ". Штаб увидит запись в панели администратора.";
        btn.style.display = "none";
        const cab = $("cabSurveyState"); if (cab) cab.textContent = "Заполнен";
      } else $("surveyStatus").innerHTML = "<b>СТАТУС: ОШИБКА</b><br>Не удалось отметить заполнение. Попробуй позже.";
    } catch (e) { $("surveyStatus").innerHTML = "<b>СТАТУС: ОШИБКА</b><br>Сервис авторизации недоступен."; }
    btn.disabled = false; btn.textContent = "Я ЗАПОЛНИЛ ОПРОСНИК";
  });
  $("adminTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".tab-btn"); if (!b) return;
    adminTab = b.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((x) => x.classList.toggle("active", x === b));
    renderAdminTab();
  });
  $("adminContent").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action], span[data-action]"); if (!btn) return;
    if (btn.dataset.action === "saveProgress") {
      const uid = btn.dataset.uid;
      const tests = {};
      document.querySelectorAll('.chk[data-uid="' + uid + '"]').forEach((c) => { if (c.checked) tests[c.dataset.test] = true; });
      btn.textContent = "СОХРАНЕНИЕ…";
      const r = await api("/api/progress/" + uid, { method: "POST", body: JSON.stringify({ tests }) });
      btn.textContent = r.ok ? "СОХРАНЕНО ✓" : "ОШИБКА";
      setTimeout(() => { btn.textContent = "СОХРАНИТЬ ПРОГРЕСС"; }, 1600);
      S.roster = null;
    }
    if (btn.dataset.action === "review") {
      await api("/api/form/review", { method: "POST", body: JSON.stringify({ uid: btn.dataset.uid, status: btn.dataset.next }) });
      renderAdminTab();
    }
  });
}

(async function init() {
  bindStatic();
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hash.has("auth")) {
    try { localStorage.setItem("rrt_session", hash.get("auth")); } catch (e) {}
    history.replaceState(null, "", location.pathname);
  }
  try { S.token = localStorage.getItem("rrt_session"); } catch (e) { S.token = null; }
  if (S.token && workerReady()) await loadMe();
  renderAccount();
  if (S.me) renderHomeProfile();
  else if (!workerReady()) {
    const db = $("discordBox");
    if (db) db.innerHTML = '<span class="dot"></span> Discord не подключён<br><small>Разверни discord-worker.js и впиши адрес в script.js (README, шаги 2–4).</small>';
  }
  applyAccess();
})();
