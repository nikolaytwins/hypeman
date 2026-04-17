This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Whisper Service (локальный faster-whisper)

Субтитры со словесными таймкодами могут идти через **Python-микросервис** (`whisper_service.py`, FastAPI + faster-whisper), а не через OpenAI Whisper API.

**Установка:**

```bash
pip install -r requirements_whisper.txt
```

**Запуск** (держать запущенным рядом с Next.js, на той же машине, где лежат файлы `jobId` — сервис читает `audio_path` с диска):

```bash
python whisper_service.py
# или из корня репозитория:
npm run whisper
```

В `.env` / **`.env.production`** задайте **`WHISPER_SERVICE_URL`** (например `http://127.0.0.1:8001`). Пока URL задан, пайплайн сначала обращается к этому сервису; при ошибке можно откатиться на OpenAI (`OPENAI_API_KEY`) или OpenRouter. Опционально: **`WHISPER_LANGUAGE`** (по умолчанию `ru`).

**PM2:** после правки `.env.production` выполните `pm2 reload hypeman --update-env`. Если переменная не попадает в процесс Node, продублируйте её в блок `env` приложения `hypeman` в `ecosystem.config.cjs` (рядом с `PORT`).

На прод-сервере поднимите whisper рядом с Next (два процесса), чтобы пути к аудио в `storage` совпадали с теми, что передаёт Node в теле запроса.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
