# Habarlandyru Bot

Telegram-бот, который принимает объявления от пользователей, аккуратно редактирует их через OpenAI (казахский и смешанный казахско-русский текст), проверяет на нарушения и после подтверждения публикует в канал. Сомнительные объявления уходят администратору.

AI работает как редактор, а не автор: он исправляет ошибки, убирает «воду» и обращения к админу, но не придумывает ни цену, ни дату, ни телефон. Это дополнительно проверяется кодом (см. «Защита от выдумок»).

## Как это работает

```
Пользователь → /start → отправляет текст (или фото + подпись)
   ↓ валидация → rate limit → проверка дубля → submission(received)
   ↓ OpenAI (Structured Outputs, JSON Schema) → Zod → guard
   ├─ approved      → preview: [✅ Жариялау] [✏️ Өзгерту] [❌ Болдырмау] → канал
   ├─ needs_review  → карточка админу: [✅ Publish] [✏️ Edit] [❌ Reject]
   ├─ rejected      → нейтральный отказ автору
   └─ сбой AI       → status=error, сообщение автору, автоматический retry
```

### Статусы submission

`received → processing → approved | needs_review | rejected → publishing → published`, а также `cancelled`, `error` (сбой AI, будет повтор) и `publish_failed` (сбой Telegram, будет повтор). Статусы `publishing`, `error`, `publish_failed` добавлены к базовому списку ради надёжных повторов и защиты от двойной публикации.

### Защита от выдумок (guard)

После ответа модели код (`src/ai/guard.ts`) понижает `approved` до `needs_review`, если:

- пропал или добавился номер телефона;
- пропала или добавилась ссылка / @username;
- в тексте появились числа, которых нет в оригинале;
- уверенность ниже `AI_CONFIDENCE_THRESHOLD`;
- длина результата подозрительно отличается от оригинала;
- в исходном тексте найдена попытка prompt injection.

Код никогда не повышает `needs_review` или `rejected` до `approved`. Номера казахстанских телефонов форматируются кодом (любой формат → `87073613176`), иностранные номера не трогаются.

### Prompt injection

Текст пользователя передаётся в обёртке `<announcement>…</announcement>` как недоверенные данные, закрывающие теги внутри текста нейтрализуются, системный промпт (`src/ai/prompt.ts`) запрещает выполнять команды из объявления. Паттерны инъекций дополнительно ловит `detectInjection`, а решение о публикации всё равно принимает человек или код, а не модель.

## Структура

```
prisma/            схема и миграции
src/
  config/          ENV (Zod)
  bot/             Telegraf: handlers, клавиатуры, тексты (messages.kk.ts)
  ai/              OpenAI client, prompt, JSON Schema, guard
  database/        Prisma client и репозитории
  services/        pipeline, публикация, модерация, лимиты, дубли, retry-воркер
  middleware/      пользователь, admin-only
  utils/           телефоны, нормализация, sanitize, Telegram HTML, logger
  types/
tests/             Vitest + казахские фикстуры
scripts/eval.ts    живая проверка на реальной модели
```

## Установка

Требуется Node.js 20+ и PostgreSQL.

```bash
npm install
cp .env.example .env     # заполните значения
npm run db:migrate       # локально создаёт БД-схему
npm run dev
```

### Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `BOT_TOKEN` | токен от BotFather | — |
| `OPENAI_API_KEY` | ключ OpenAI (только в ENV) | — |
| `OPENAI_MODEL` | имя модели | `gpt-6-luna` |
| `DATABASE_URL` | строка подключения PostgreSQL | — |
| `CHANNEL_ID` | `-100…` или `@username` канала | — |
| `ADMIN_ID` | Telegram ID администратора | — |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES` | лимит объявлений на пользователя | `5` / `10` |
| `MAX_MESSAGE_LENGTH` | максимальная длина текста | `1500` |
| `DUPLICATE_WINDOW_HOURS` | окно проверки дублей | `24` |
| `AI_CONFIDENCE_THRESHOLD` | ниже этого порога идёт на ручную проверку | `0.7` |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | таймаут и ретраи SDK | `60000` / `2` |
| `RETRY_INTERVAL_SECONDS` / `MAX_ATTEMPTS` | повторы AI и публикации | `60` / `5` |
| `RETENTION_DAYS` | через сколько дней стираются тексты завершённых заявок | `30` |
| `NOTIFY_ADMIN_ON_REJECT` | уведомлять админа об авто-отказах | `false` |
| `REVIEW_ALL` | `true`: любое объявление сначала проверяет админ | `false` |
| `PHOTO_REVIEW` | `always`: объявления с фото всегда идут админу (AI видит только текст); `auto`: решает AI | `always` |
| `LOG_LEVEL` | уровень логов | `info` |

## Настройка Telegram

1. В Telegram откройте [@BotFather](https://t.me/BotFather), выполните `/newbot`, задайте имя и username, скопируйте токен в `BOT_TOKEN`.
2. Создайте канал (или используйте существующий). Откройте «Управление каналом → Администраторы → Добавить администратора», выберите бота и включите право **«Публикация сообщений»**.
3. `CHANNEL_ID`: для публичного канала подойдёт `@username`. Для приватного перешлите любое сообщение канала боту [@getidsbot](https://t.me/getidsbot) и возьмите число вида `-100…`.
4. `ADMIN_ID`: ваш числовой ID (например, через @userinfobot). Администратор обязательно должен хотя бы раз нажать `/start` у бота, иначе Telegram не даст боту написать первым.

## OpenAI

1. Создайте API key на [platform.openai.com](https://platform.openai.com/api-keys) и положите в `OPENAI_API_KEY`. В коде и в Git ключа быть не должно (`.env` в `.gitignore`).
2. Модель задаётся через `OPENAI_MODEL`. Используется Chat Completions со `response_format: json_schema` (`strict: true`). Если выбранная модель не поддерживает такие параметры, поменяйте их в `src/ai/client.ts`, остальная система не изменится.
3. Проверить качество на реальной модели можно командой `npm run eval` (6 фикстур, включая prompt injection и мошенничество).

## PostgreSQL

Локально:

```bash
docker run --name habarlandyru-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=habarlandyru -p 5432:5432 -d postgres:16
```

`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/habarlandyru?schema=public`

Миграции:

- разработка: `npm run db:migrate` (после изменения `schema.prisma` создаёт новую миграцию);
- продакшен: `npm run db:deploy`; также выполняется автоматически в `npm start`.

## Тесты

```bash
npm test          # Vitest, без сети и БД
npm run typecheck
```

Покрыто: нормализация телефонов, дубли, валидация ответа AI, статусы (guard), Telegram-форматирование, защита от prompt injection, пустые и слишком длинные сообщения.

## Деплой (Railway)

В репозитории уже есть `Dockerfile`, `railway.json` и `.dockerignore`. Бот работает через long polling, поэтому порт и публичный URL не нужны (сервис работает как worker).

1. Выложите код на GitHub (`.env` в `.gitignore`, секреты в репозиторий не попадают).
2. На [railway.com](https://railway.com): **New Project → Deploy from GitHub repo** и выберите репозиторий.
3. В том же проекте: **New → Database → Add PostgreSQL**.
4. Откройте сервис бота → **Variables** и добавьте:

| Переменная | Значение |
|---|---|
| `BOT_TOKEN` | токен от BotFather |
| `OPENAI_API_KEY` | ключ OpenAI |
| `OPENAI_MODEL` | `gpt-6-luna` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (ссылка на плагин БД; имя сервиса БД может отличаться) |
| `CHANNEL_ID` | `-100…` для приватного канала или `@username` |
| `ADMIN_ID` | числовой Telegram ID админа |

   Остальные переменные необязательны (значения по умолчанию в `.env.example`).
5. Railway соберёт образ и запустит `prisma migrate deploy`, затем бота. Миграции применяются автоматически при каждом старте.
6. В логах (**Deployments → View logs**) должны появиться `starting` и `channel access ok`.

Важно:
- Запускайте **один** экземпляр (Replicas = 1) и **не запускайте бота локально** одновременно с Railway: два бота с одним токеном дают `409 Conflict`.
- Перед первым деплоем остановите локальный `npm run dev`.
- Токен бота и ключ OpenAI храните только в Variables Railway и в локальном `.env`.

## Надёжность

- Если OpenAI недоступен, заявка сохраняется со статусом `error`, пользователь получает сообщение о технической ошибке, воркер повторяет попытки. После `MAX_ATTEMPTS` заявка уходит администратору (`needs_review`).
- Заявка становится `published` только после подтверждения от Telegram. Ошибка Telegram даёт `publish_failed` и повтор, 429 обрабатывается ожиданием `retry_after`.
- Переход в `publishing` атомарный: двойное нажатие кнопки не создаёт два поста.
- Если процесс упал во время публикации, администратор получает уведомление и сам проверяет канал (пост мог уйти).
- Логи (pino, JSON) содержат ID, статусы, время и ошибки, но не ключи и не тексты объявлений. Тексты и сырые ответы AI завершённых заявок стираются через `RETENTION_DAYS`.

- При старте бот проверяет, что админ нажал `/start` и что бот администратор канала с правом публикации (предупреждения в логах).
- Если карточка админу не доставилась, воркер повторяет отправку; заявка не остаётся без уведомления.
- Скрытые гиперссылки (`текст` со ссылкой на другой URL) раскрываются в текст, чтобы AI и админ видели адрес.
- Фото и видео AI не анализирует, поэтому при `PHOTO_REVIEW=always` объявления с фото всегда проверяет админ. Видео бот не принимает.

## Ограничения

- Одно фото на объявление (альбомы не склеиваются).
- Правка администратора публикуется без повторного прогона через AI.
- Заголовок с эмодзи (🏠, 🎫, …) создаётся кодом по категории; для `other` заголовка нет.

## Troubleshooting

| Симптом | Причина |
|---|---|
| `Invalid environment configuration` при старте | не заполнена обязательная ENV (в сообщении только имена переменных) |
| `401 Unauthorized` от Telegram | неверный `BOT_TOKEN` |
| `409 Conflict: terminated by other getUpdates` | запущено два экземпляра бота |
| `chat not found` / `bot is not a member` при публикации | неверный `CHANNEL_ID` или бот не админ канала |
| `Forbidden: bot can't initiate conversation` | админ не нажал `/start` у бота |
| ошибки OpenAI `model_not_found` / `invalid_request_error` | проверьте `OPENAI_MODEL` и доступность Structured Outputs |
| Всё уходит в `needs_review` | модель возвращает низкую `confidence` или меняет номера: смотрите `warnings` и `reason` в карточке админа |
| `Can't reach database server` | проверьте `DATABASE_URL` и что PostgreSQL запущен |
