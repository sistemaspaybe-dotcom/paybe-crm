# Paybe CRM (V0)

Node + Express + Postgres. Variables: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` (opcional, resume chats), `AI_MODEL` (opcional), `NODE_ENV=production`.
Las tablas se crean solas al arrancar. `npm start`.

## Instagram

Los DM de la cuenta entran solos como leads. Variables: `IG_ACCESS_TOKEN` (token de larga duración de la cuenta; después se renueva solo), `IG_APP_SECRET` (secreto de la app de Instagram en Meta), `IG_VERIFY_TOKEN` (clave inventada, la misma que se carga en el webhook de Meta).
Webhook: `https://<dominio>/webhooks/instagram`, campo `messages`. Estado de la conexión en `/instagram`. Política de privacidad pública en `/privacidad`.
