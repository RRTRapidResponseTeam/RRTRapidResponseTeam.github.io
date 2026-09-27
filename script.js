const C = window.RRT_CONFIG, AUTH = C.AUTH_BASE, CONFIGURED = !AUTH.includes("YOUR-");
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const LEVELS = ["PUBLIC","С ТАЛОНЧИКОМ","РЕКРУТ","ОТРЯД RRT","ОФИЦЕР","ШТАБ"];
const ACCESS_DESC = {1:"Только Опросник",2:"Опросник, Руководство, Обучение, Личный кабинет",3:"Полный пользовательский доступ",4:"Отряд RRT + Офицерский раздел",5:"Полный доступ + Панель администратора"};
let USER = null, LEVEL = 0;
const token = () => localStorage.getItem("rrt_session");
async function api(path, opt = {}) {
  const r = await fetch(AUTH + path, {...opt, headers: {"Content-Type":"application/json", Authorization: "Bearer " + token(), ...(opt.headers||{})}});
  if (!r.ok) { let m = r.status; try { const j = await r.json(); if (j && j.error) m = j.error; } catch(e){} throw new Error(m); }
  return r.json();
}

/* ---------- navigation ---------- */
function openPage(id) {
  const sec = $(id); const min = +(sec?.dataset.min || 0);
  if (min > LEVEL) { $("deniedText").textContent = LEVEL ? "Ваша роль не даёт доступа к этому разделу." : "Войдите через Discord. Раздел открывается по роли на сервере RRT."; id = "denied"; }
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === id));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === id));
  scrollTo({top: 0, behavior: "smooth"});
  if (id === "roster" || id === "officer") loadRoster();
  if (id === "admin") loadAdmin();
}
document.addEventListener("click", e => { const el = e.target.closest("[data-page]"); if (el) { e.preventDefault(); openPage(el.dataset.page); } });
function applyVisibility() {
  document.querySelectorAll(".nav-item,[data-min].action-card").forEach(el => el.classList.toggle("hidden", +(el.dataset.min||0) > LEVEL));
  document.querySelectorAll("[data-min].action-card").forEach(el => el.style.display = +(el.dataset.min||0) > LEVEL ? "none" : "");
  // С талончиком видит только Опросник
  if (LEVEL === 1) document.querySelector('.nav-item[data-page="home"]').classList.add("hidden");
}

/* ---------- auth ---------- */
$("loginBtn").addEventListener("click", () => {
  if (!CONFIGURED) { alert("Discord-авторизация ещё не подключена: укажите адрес Worker в config.js (см. README)."); return; }
  location.href = AUTH + "/auth/discord?return_to=" + encodeURIComponent(location.origin + location.pathname);
});
function logout() { localStorage.removeItem("rrt_session"); location.reload(); }
function applyUser(u) {
  USER = u; LEVEL = u.level || 0;
  const name = u.nick || u.global_name || u.username;
  $("username").textContent = name;
  $("profileStatus").textContent = LEVELS[LEVEL]; $("accessState").textContent = LEVELS[LEVEL]; $("accessText").textContent = LEVELS[LEVEL];
  $("roleCount").textContent = (u.roles||[]).length;
  $("roleLine").textContent = (u.role_names||[]).join(" • ") || "Discord подключён";
  $("discordBox").innerHTML = '<span class="dot ok"></span> Discord подключён<br><small>Роли синхронизированы с сервером RRT.</small>';
  if (u.avatar) $("avatar").innerHTML = '<img style="width:100%;height:100%;border-radius:50%;object-fit:cover" src="' + esc(u.avatar) + '" alt="">';
  $("account").innerHTML = '<span class="acc-user">' + (u.avatar ? '<img src="' + esc(u.avatar) + '" alt="">' : "") + esc(name) + '</span><button class="logout" id="logoutBtn">ВЫЙТИ</button>';
  $("logoutBtn").onclick = logout;
  // кабинет
  $("cabName").textContent = name; $("cabId").textContent = u.sub; $("cabLevel").textContent = LEVELS[LEVEL];
  $("cabJoined").textContent = u.joined_at ? new Date(u.joined_at).toLocaleDateString("ru-RU") : "—";
  $("cabRoles").innerHTML = (u.role_names||[]).map(r => '<span class="chip">' + esc(r) + '</span>').join("");
  setupForm(); applyVisibility(); renderTraining();
  openPage(LEVEL === 1 ? "survey" : "home");
}

/* ---------- survey ---------- */
function setupForm() {
  let url = "https://docs.google.com/forms/d/e/" + C.FORM_ID + "/viewform";
  const p = new URLSearchParams();
  if (C.FORM_DISCORD_ENTRY && USER) p.set(C.FORM_DISCORD_ENTRY, (USER.nick || USER.username) + " | " + USER.sub);
  const q = p.toString();
  $("formLink").href = url + (q ? "?" + q : "");
  p.set("embedded", "true");
  $("formFrame").src = url + "?" + p.toString();
}

/* ---------- training ---------- */
const TESTS = [
  {id:"intro", title:"Вводный инструктаж", desc:"Базовые правила, дисциплина, связь и взаимодействие.", q:[
    ["Кто отдаёт приказы в группе?",["Любой боец","Назначенный командир","Тот, кто громче"],1],
    ["Что делать при потере связи с группой?",["Действовать в одиночку","Сообщить по связи и вернуться к точке сбора","Выйти с сервера"],1],
    ["Радиодисциплина — это…",["Говорить кратко и по делу","Включать музыку в эфир","Молчать всегда"],0],
    ["Огонь по своим допустим?",["Да, если скучно","Нет, никогда","Только по рекрутам"],1],
    ["Куда смотреть при движении колонной?",["В свой сектор","Только вперёд","В карту"],0]]},
  {id:"regs", title:"Устав RRT", desc:"Положения устава и правила поведения.", q:[
    ["Распоряжения командования…",["Выполняются","Обсуждаются в эфире","Игнорируются"],0],
    ["Важную информацию нужно передавать…",["Своевременно","После миссии","Никогда"],0],
    ["Голосовая связь используется…",["По назначению","Для шуток","Для музыки"],0]]},
  {id:"radio", title:"Радиосвязь", desc:"Позывные, частоты и доклады.", q:[
    ["С чего начинается вызов?",["С позывного вызываемого","С анекдота","С «алло»"],0],
    ["Доклад о контакте содержит…",["Направление, дистанцию, описание","Только «враг!»","Ничего"],0],
    ["Что означает «Принял»?",["Сообщение получено","Отказ","Конец миссии"],0]]},
  {id:"rifle", title:"Стрелок и пулемётчик", desc:"Применение вооружения в составе группы.", q:[
    ["Подавляющий огонь нужен чтобы…",["Прижать противника","Тратить патроны","Шуметь"],0],
    ["Перезарядка — сообщать группе?",["Да","Нет"],0],
    ["Сектор огня назначает…",["Командир","Каждый сам"],0]]},
  {id:"ftl", title:"Лидер команды (FTL)", desc:"Управление малой группой и координация.", q:[
    ["Сколько бойцов обычно в огневой группе?",["3–4","10","1"],0],
    ["FTL докладывает…",["SL","Никому","Противнику"],0],
    ["Главная задача FTL?",["Контроль группы и выполнение задачи","Стрелять больше всех"],0]]}
];
const QUALS = [["Боец","intro"],["Стрелок","rifle"],["Пулемётчик","rifle"],["Связист","radio"],["FTL","ftl"]];
const progKey = () => "rrt_tests_" + (USER?.sub || "guest");
let PASSED = {};
function loadProgress() { PASSED = JSON.parse(localStorage.getItem(progKey()) || "{}"); if (CONFIGURED && USER) api("/api/tests").then(d => { PASSED = {...PASSED, ...(d.passed||{})}; renderTraining(false); }).catch(()=>{}); }
function savePass(id, score) {
  PASSED[id] = {score, at: Date.now()}; localStorage.setItem(progKey(), JSON.stringify(PASSED));
  if (CONFIGURED) api("/api/tests", {method:"POST", body: JSON.stringify({id, score})}).catch(()=>{});
}
function renderTraining(reload = true) {
  if (reload) loadProgress();
  let html = "";
  TESTS.forEach((t, i) => {
    const done = PASSED[t.id], open = i === 0 || PASSED[TESTS[i-1].id];
    html += '<article class="course ' + (done ? "done" : open ? "available" : "locked") + '"><div class="course-num">' + String(i+1).padStart(2,"0") + '</div><div class="course-body"><h2>' + t.title + '</h2><p>' + t.desc + '</p><div class="tags"><span>' + t.q.length + ' ВОПРОСОВ</span>' + (i ? '<span>REQUIRES: ' + TESTS[i-1].title.toUpperCase() + '</span>' : '<span>BASE</span>') + '</div></div>' +
      (done ? '<span class="badge">✓ ' + done.score + '%</span>' : open ? '<button class="course-btn" data-test="' + t.id + '">НАЧАТЬ</button>' : '<span class="lock">🔒</span>') + '</article>';
  });
  $("courseList").innerHTML = html;
  const n = TESTS.filter(t => PASSED[t.id]).length, pct = Math.round(n / TESTS.length * 100);
  $("cabPct").textContent = pct + "%"; $("cabBar").style.width = pct + "%";
  $("cabTests").innerHTML = TESTS.map(t => '<li class="' + (PASSED[t.id] ? "ok" : "no") + '">' + t.title + '</li>').join("");
  $("qualTable").innerHTML = QUALS.map(([q, req]) => { const t = TESTS.find(x => x.id === req); return '<tr><td>' + q + '</td><td>' + t.title + '</td><td><span class="badge">' + (PASSED[req] ? "ДОПУЩЕН" : "LOCKED") + '</span></td></tr>'; }).join("");
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-test]"); if (!b) return;
  const t = TESTS.find(x => x.id === b.dataset.test), box = $("quizBox");
  box.style.display = "block";
  box.innerHTML = '<h2>' + t.title + '</h2>' + t.q.map((q, i) => '<div class="q"><p>' + (i+1) + '. ' + q[0] + '</p>' + q[1].map((a, j) => '<label><input type="radio" name="q' + i + '" value="' + j + '"> ' + a + '</label>').join("") + '</div>').join("") + '<button class="btn" id="quizSubmit">ЗАВЕРШИТЬ ТЕСТ</button><div class="result" id="quizResult"></div>';
  box.scrollIntoView({behavior: "smooth"});
  $("quizSubmit").onclick = () => {
    let ok = 0; t.q.forEach((q, i) => { const v = box.querySelector('input[name="q' + i + '"]:checked'); if (v && +v.value === q[2]) ok++; });
    const score = Math.round(ok / t.q.length * 100);
    if (score >= 80) { savePass(t.id, score); $("quizResult").innerHTML = '<span style="color:var(--green2)">✓ Тест пройден: ' + score + '%</span>'; setTimeout(() => { box.style.display = "none"; renderTraining(false); }, 1200); }
    else $("quizResult").innerHTML = '<span style="color:var(--red2)">✗ ' + score + '% — нужно минимум 80%. Попробуйте ещё раз.</span>';
  };
});

/* ---------- roster / officer ---------- */
let ROSTER = null;
const GROUPS = [[5,"ШТАБ"],[4,"ОФИЦЕРЫ"],[3,"ОТРЯД RRT"],[2,"РЕКРУТЫ"],[1,"С ТАЛОНЧИКОМ"]];
function groupedRows(list, render) {
  let html = "";
  for (const [lv, title] of GROUPS) {
    const g = list.filter(m => m.level === lv);
    if (!g.length) continue;
    html += '<tr class="grp"><td colspan="3">' + title + ' — ' + g.length + '</td></tr>' + g.map(render).join("");
  }
  return html || '<tr><td colspan="3" class="muted">Пусто</td></tr>';
}
function renderRosterTables() {
  $("rosterTable").innerHTML = groupedRows(ROSTER, m => '<tr><td>' + esc(m.name) + '</td><td>' + LEVELS[m.level] + '</td><td>' + (m.role_names||[]).map(r => '<span class="chip">' + esc(r) + '</span>').join(" ") + '</td></tr>');
  $("officerTable").innerHTML = groupedRows(ROSTER, m => '<tr><td>' + esc(m.name) + '</td><td>' + LEVELS[m.level] + '</td><td>' + (m.tests ?? 0) + ' / ' + TESTS.length + '</td></tr>');
}
async function loadRoster() {
  if (ROSTER) { renderRosterTables(); return; }
  if (!CONFIGURED) { $("rosterTable").innerHTML = $("officerTable").innerHTML = '<tr><td colspan="3" class="muted">Подключите Worker (config.js).</td></tr>'; return; }
  try {
    ROSTER = (await api("/api/roster")).members;
    renderRosterTables();
    $("stMembers").textContent = ROSTER.length;
  } catch (e) {
    const msg = String(e.message), hint = /members intent|403/i.test(msg) ? "<br><br>Похоже, в Discord Developer Portal → Bot не включён <b>SERVER MEMBERS INTENT</b>. Включи и нажми Save Changes." : "";
    $("rosterTable").innerHTML = $("officerTable").innerHTML = '<tr><td colspan="3" class="muted">Нет доступа или ошибка загрузки (' + esc(msg) + ').' + hint + '</td></tr>';
  }
}

/* ---------- admin ---------- */
document.querySelectorAll("[data-apane]").forEach(b => b.onclick = () => {
  document.querySelectorAll("[data-apane]").forEach(x => x.classList.toggle("active", x === b));
  document.querySelectorAll(".apane").forEach(p => p.classList.toggle("active", p.id === b.dataset.apane));
});
$("accessTable").innerHTML = Object.values(C.ROLES).map(r => '<tr><td>' + r.name + '</td><td class="muted">' + r.id + '</td><td>' + ACCESS_DESC[r.level] + '</td></tr>').join("");
let SURVEY = null;
async function loadAdmin() {
  loadRoster();
  if (SURVEY || !CONFIGURED) return;
  try {
    SURVEY = (await api("/api/admin/survey")).responses || [];
    $("stAnswers").textContent = SURVEY.length;
    $("surveyTable").innerHTML = SURVEY.map((r, i) => '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.nick) + '</td><td><button class="btn" data-resp="' + i + '">ОТКРЫТЬ →</button></td></tr>').join("") || '<tr><td colspan="3" class="muted">Ответов пока нет.</td></tr>';
  } catch (e) { $("surveyTable").innerHTML = '<tr><td colspan="3" class="muted">Не удалось загрузить ответы (' + esc(String(e.message)) + '). Проверьте настройку Google-таблицы (README).</td></tr>'; }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-resp]");
  if (b) { const r = SURVEY[+b.dataset.resp];
    $("modalBox").innerHTML = '<h3>ОТВЕТ: ' + esc(r.nick) + '</h3><div class="muted">Дата: ' + esc(r.date) + '</div>' + r.answers.map(a => '<div class="ans"><small>' + esc(a.q) + '</small>' + esc(a.a) + '</div>').join("") + '<br><button class="btn red" id="modalClose">ЗАКРЫТЬ</button>';
    $("modal").classList.add("open"); $("modalClose").onclick = () => $("modal").classList.remove("open"); }
  if (e.target.id === "modal") $("modal").classList.remove("open");
});

/* ---------- boot ---------- */
const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
if (hp.has("auth")) { localStorage.setItem("rrt_session", hp.get("auth")); history.replaceState(null, "", location.pathname); }
if (hp.has("auth_error")) alert(decodeURIComponent(hp.get("auth_error")));
applyVisibility(); renderTraining();
if (token() && CONFIGURED) api("/api/me").then(applyUser).catch(() => localStorage.removeItem("rrt_session"));
