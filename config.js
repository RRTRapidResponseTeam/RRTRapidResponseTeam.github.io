// ===== RRT UNIT PORTAL — КОНФИГУРАЦИЯ =====
// Замените AUTH_BASE на адрес вашего Cloudflare Worker после его создания.
window.RRT_CONFIG = {
  AUTH_BASE: "https://rrtauth.danikleprekon.workers.dev",
  GUILD_ID: "1523641828149039249",
  FORM_ID: "1FAIpQLSdJkMzE3pGGnDtjx0J0xEmmKdADfjEPuZ43oUyxq5cRoVNsdg",
  // Необязательно: ID поля формы для автоподстановки Discord-ника, например "entry.123456789"
  FORM_DISCORD_ENTRY: "",
  ROLES: {
    TICKET:  { id: "1533566289627578419", name: "С талончиком", level: 1 },
    RECRUIT: { id: "1523641828174200937", name: "Рекрут",       level: 2 },
    MEMBER:  { id: "1523641828174200938", name: "Отряд RRT",    level: 3 },
    OFFICER: { id: "1523641828186919041", name: "Офицер",       level: 4 },
    STAFF:   { id: "1523641828199497743", name: "Штаб",         level: 5 }
  }
};
