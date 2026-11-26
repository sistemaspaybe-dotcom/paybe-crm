# Paybe CRM (V0)

Node + Express + Postgres. Variables: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` (opcional, resume chats), `AI_MODEL` (opcional), `NODE_ENV=production`.
Las tablas se crean solas al arrancar. `npm start`.

## Instagram

Los DM de la cuenta entran solos a Leads → Conversaciones abiertas; el lead lo crea el equipo desde la conversación. Variables: `IG_ACCESS_TOKEN` (token de larga duración de la cuenta; después se renueva solo), `IG_APP_SECRET` (secreto de la app de Instagram en Meta), `IG_VERIFY_TOKEN` (clave inventada, la misma que se carga en el webhook de Meta).
Webhook: `https://<dominio>/webhooks/instagram`, campo `messages`. Estado de la conexión en `/instagram`. Política de privacidad pública en `/privacidad`.

## Preguntas, semáforo y cotizador (17/11)

- **Etapas del lead:** Nuevo → Preguntando → Aguardando datos → Para cotizar → Cotizando → Esperando respuesta → Convertido (pasa a Oportunidad) o Perdido.
- **La IA** (necesita `ANTHROPIC_API_KEY`) lee el chat, guarda lo común en la consulta y lo de cada destino en su ficha (`destinos`), arma un solo mensaje con todo lo que falta (borrador que el equipo manda desde el CRM) y pone el semáforo por destino.
- **Semáforo:** mínimo = aéreo + días × costo por día (+% en temporada alta); verde desde el 100%, rojo debajo del 75%. Se edita en `/ajustes`.
- **Recordatorio:** a las 20 h del último mensaje del cliente sin respuesta, una sola vez. **Seguimiento** de la cotización a los 3 y 7 días.
- **Cotizador** por destino (`/destino/:id/cotizar`): ítems con costo y margen, banco de cotizaciones parecidas, versiones (v1, v2…) y propuesta pública en `/c/:token` (se descarga como PDF desde el navegador).
- Instagram solo deja mandar desde el CRM dentro de las 24 h del último mensaje del cliente; fuera de esa ventana el CRM ofrece copiar el texto.

## Conversaciones y weekly con Sol (24/11)

- **Conversaciones abiertas** (pestaña de Leads): una por persona y canal. Estado solo según quién mandó el último mensaje (Nueva / Te toca / Esperando al cliente). Se cierra como Terminada, Perdida o No es consulta (con Deshacer); si la persona vuelve a escribir, se reabre. Desde ahí se contesta Instagram (24 h) y se crea el lead. Lead de **visita a la oficina** con quién la atendió.
- **Recotizar:** "Dijo que sí, pero cambió el precio" arma una versión nueva sin fecha de validez.
- **Preguntas de la IA:** ocasión especial y categoría (campos en la ficha).
- **Semáforo rojo:** botón "Armar la respuesta estándar" (mínimo calculado).
- **Cotizador:** ítems Incluido / Opcional / Alternativa (interna), validez 24/48/72 h (3 días por defecto), pesos o dólares (Argentina arranca en pesos), seña 50%. La propuesta muestra opcionales y bases y condiciones.
- **Seña que no llega** (`src/despues.js`): 3 días después de los datos, un mensaje; 3 días más sin respuesta, Perdido.
- **Comprobante:** transferencia o depósito quedan con "Falta comprobante", aviso y mensaje.
- **Saldo:** aviso y mensaje 2 meses y 1 mes antes de la salida (hace falta la fecha "Sale").
- **Ajustes:** mensajes armados y bases y condiciones editables.

## Staging

Entorno de prueba en Railway (rama `staging`, base propia). Variable `STAGING=true`: muestra una franja arriba y apaga Instagram (no recibe ni manda nada), aunque tenga las variables de prod. Se prueba con las consultas de prueba (Ajustes). Lo aprobado pasa a `main` → prod.

## WhatsApp (YCloud, coexistencia)

Variables: `YCLOUD_API_KEY` (y opcional `YCLOUD_NUMERO`, `PUBLIC_URL`; si no, usa `RAILWAY_PUBLIC_DOMAIN`). Al arrancar, el CRM crea solo el webhook en YCloud (`/webhooks/whatsapp`, eventos `whatsapp.inbound_message.received` y `whatsapp.smb.message.echoes`) y guarda la clave para validar la firma `YCloud-Signature`. Lo que entra pasa por el mismo filtro que Instagram; lo que Sol contesta desde el celular queda registrado. Las respuestas, las propuestas y las preguntas automáticas salen por el canal por el que escribió el cliente (`src/canales.js`). Estado en `/whatsapp`.
