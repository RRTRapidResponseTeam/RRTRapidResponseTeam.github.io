# RRT UNIT PORTAL — v0.3

## Что нового
- Доступ по ролям Discord-сервера RRT (Guild 1523641828149039249):
  | Роль | ID | Доступ |
  |---|---|---|
  | С талончиком | 1533566289627578419 | Только Опросник |
  | Рекрут | 1523641828174200937 | Опросник, Руководство, Обучение, Личный кабинет |
  | Отряд RRT | 1523641828174200938 | Весь сайт без админки |
  | Офицер | 1523641828186919041 | + Офицерский раздел (состав, прогресс тестов) |
  | Штаб | 1523641828199497743 | + Панель администратора (ответы на опросник) |
- Опросник (Google Form) встроен в сайт.
- Личный кабинет: профиль, роли, дата вступления, прогресс обучения.
- Обучение: 5 тестов по цепочке (порог 80%), квалификации открываются автоматически.
- Панель администратора: обзор, ответы на опросники (дата, ник, ответы), роли и доступ.
- Права проверяются на сервере (Worker), а не только скрытием меню.

## Как выгрузить на GitHub
1. Распакуйте ZIP.
2. Откройте репозиторий `RRTRapidResponseTeam.github.io` → **Add file → Upload files**.
3. Перетащите ВСЁ содержимое папки (index.html, style.css, script.js, config.js, README.md, assets, backend) — с заменой старых файлов.
4. **Commit changes**. Через 1–2 минуты сайт обновится.

Папка `backend` на GitHub не выполняется — это файлы для Cloudflare и Google, секретов в них нет.

## Подключение Discord (один раз)
1. discord.com/developers → New Application → OAuth2: скопируйте Client ID и Client Secret. Bot → Reset Token, включите **Server Members Intent**, пригласите бота на сервер RRT.
2. dash.cloudflare.com → Workers → Create → вставьте `backend/discord-worker.js` → Deploy.
3. Worker → Settings → Variables: секреты `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET` (любой длинный случайный текст), переменная `SITE_URL = https://rrtrapidresponseteam.github.io`.
4. (Для сохранения тестов) Workers → KV → создайте namespace, привяжите к Worker как `RRT_KV`.
5. В Discord OAuth2 → Redirects добавьте `https://ВАШ-WORKER.workers.dev/auth/callback`.
6. В `config.js` замените `AUTH_BASE` на адрес Worker и снова загрузите этот файл на GitHub.

## Ответы опросника в админке
1. В Google Form → Ответы → «Связать с Таблицами».
2. Добавьте в форму вопрос «Discord ник» (чтобы видеть ник в админке).
3. В таблице: Расширения → Apps Script → вставьте `backend/google-apps-script.gs`, задайте свойство `TOKEN`, разверните как веб-приложение.
4. В Worker добавьте секреты `SHEET_SCRIPT_URL` и `SHEET_SCRIPT_TOKEN`.

Никогда не кладите токены и секреты в файлы на GitHub.
