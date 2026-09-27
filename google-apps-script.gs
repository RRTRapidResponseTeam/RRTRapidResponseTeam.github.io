/*
 Вставьте в Google-таблицу с ответами формы: Расширения → Apps Script.
 Настройки проекта → Свойства скрипта → добавьте TOKEN = (тот же длинный пароль, что SHEET_SCRIPT_TOKEN в Worker).
 Развернуть → Новое развёртывание → Веб-приложение: "Выполнять от моего имени", доступ "Все".
 Скопируйте URL развёртывания в секрет SHEET_SCRIPT_URL Worker.
*/
function doGet(e) {
  var token = PropertiesService.getScriptProperties().getProperty("TOKEN");
  if (!token || e.parameter.token !== token) return out({error: "forbidden"});
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getDataRange().getDisplayValues();
  var head = rows.shift() || [];
  var nickCol = head.findIndex(function (h) { return /discord|ник|nick/i.test(h); });
  var res = rows.filter(function (r) { return r.join("") !== ""; }).map(function (r) {
    return { date: r[0], nick: nickCol >= 0 ? r[nickCol] : "—",
      answers: head.slice(1).map(function (q, i) { return { q: q, a: r[i + 1] }; }) };
  }).reverse();
  return out({responses: res});
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
