# Запуск NIGHTCOREX как Telegram Mini App

## 1. Установи пакеты

В корне проекта:

```powershell
npm install
npm --prefix backend install
```

## 2. Настрой переменные

1. Скопируй `.env.example` в `.env`.
2. Скопируй `backend/.env.example` в `backend/.env`.
3. Впиши свои настоящие значения.

Главное:

```env
# .env
VITE_API_URL=https://ТВОЙ-БЭКЕНД.onrender.com

# backend/.env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=длинный_случайный_секрет
TELEGRAM_BOT_TOKEN=токен_бота_из_BotFather
TELEGRAM_MINI_APP_URL=https://ТВОЙ-ФРОНТЕНД.onrender.com
APP_WEB_ORIGIN=https://ТВОЙ-ФРОНТЕНД.onrender.com
CORS_ORIGINS=https://ТВОЙ-ФРОНТЕНД.onrender.com
```

`TELEGRAM_BOT_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` и `JWT_SECRET` нельзя добавлять в `VITE_*`, фронтенд, GitHub или скриншоты.

## 3. Запусти на компьютере

```powershell
npm run dev:all
```

Фронтенд откроется на `http://localhost:5173`, сервер — на `http://localhost:10000`.

Обычный браузер покажет экран «Открой в Telegram». Это правильно: настоящий вход работает только когда страницу открыл бот внутри Telegram и передал подписанные `initData`.

## 4. Деплой

### Фронтенд

Размести корень проекта как Static Site.

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_URL=https://адрес-твоего-api`

### Бэкенд

Размести папку `backend` как Node Web Service.

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Добавь все переменные из `backend/.env.example`.

После того как узнаешь HTTPS-адрес фронтенда, поставь его в `TELEGRAM_MINI_APP_URL`, `APP_WEB_ORIGIN` и `CORS_ORIGINS`, затем перезапусти backend.

## 5. Открой через бота

1. Напиши своему боту `/start`.
2. В меню появится кнопка **«Открыть NightCoreX»**.
3. Нажми её. Mini App автоматически создаст или найдёт пользователя по `telegram_chat_id` и войдёт в приложение.

Старый вход по коду остался только как запасной путь для прежней ПК-версии.
