// WhatsApp por YCloud, con coexistencia: el número sigue andando en el celular de Sol.
// - Lo que le escriben entra solo (whatsapp.inbound_message.received).
// - Lo que Sol contesta desde el celular también queda registrado (whatsapp.smb.message.echoes).
// - Desde el CRM se contesta por la API (dentro de las 24 h del último mensaje del cliente).
// Variables: YCLOUD_API_KEY. Opcionales: YCLOUD_NUMERO (si hay más de un número) y PUBLIC_URL (si no, usa el dominio de Railway).
// El CRM crea solo el webhook en YCloud y guarda su clave para validar los avisos.
const crypto = require('crypto');
const { q, one } = require('./db');
const conv = require('./conversaciones');

const API = (process.env.YCLOUD_API || 'https://api.ycloud.com') + '/v2';
const STAGING = process.env.STAGING === 'true';
const KEY = () => process.env.YCLOUD_API_KEY;
const EVENTOS = ['whatsapp.inbound_message.received', 'whatsapp.smb.message.echoes'];
const ajuste = clave => one('select valor from ajustes where clave=$1', [clave]).then(r => r?.valor ?? null);
const guardar = (clave, valor) => q('insert into ajustes(clave,valor) values($1,$2) on conflict (clave) do update set valor=excluded.valor', [clave, valor]);
const anotarError = e => { console.error('WhatsApp:', e.message); return guardar('wa_error', `${new Date().toISOString()} ${e.message}`.slice(0, 500)).catch(() => {}); };
const ia = () => require('./ia');

async function api(ruta, { method = 'GET', body } = {}) {
  if (!KEY()) throw new Error('Falta YCLOUD_API_KEY');
  const r = await fetch(API + ruta, { method, headers: { 'X-API-Key': KEY(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || j.message || `YCloud respondió ${r.status}`);
  return j;
}

// los números argentinos llegan como +5491153272067; en el CRM pueden estar como 1153272067: se comparan los últimos 10 dígitos
const digitos = s => String(s || '').replace(/\D/g, '');
const ultimos10 = s => digitos(s).slice(-10);

let cola = Promise.resolve();
const enCola = f => (cola = cola.then(f).catch(anotarError));

async function registrar({ tel, nombre, mid, entrante, texto, cuando }) {
  if (!tel || !mid) return false;
  if (await one('select 1 from mensajes where mid=$1', [mid])) return false;
  let p = await one(`select * from personas where whatsapp is not null and right(regexp_replace(whatsapp,'\\D','','g'),10)=$1 order by id limit 1`, [ultimos10(tel)]);
  if (!p) {
    if (!entrante) return false; // un mensaje de Sol a alguien que todavía no escribió no crea nada
    p = await one(`insert into personas(nombre,origen,whatsapp) values($1,'WhatsApp',$2) returning *`, [nombre || '+' + digitos(tel), '+' + digitos(tel)]);
  } else if (nombre && /^\+?\d[\d\s]*$/.test(p.nombre)) await q('update personas set nombre=$1 where id=$2', [nombre, p.id]);
  if (p.personal) return false; // número marcado como personal: no se guarda nada

  let c = await one(`select * from casos where persona_id=$1 and fase<>'baja' and not (fase='venta' and etapa='fin') order by creado desc limit 1`, [p.id]);
  const ins = await one('insert into mensajes(persona_id,caso_id,canal,mid,entrante,texto,creado) values($1,$2,$3,$4,$5,$6,$7) on conflict (mid) do nothing returning id', [p.id, c?.id || null, 'whatsapp', mid, entrante, texto, cuando]);
  if (!ins) return false;
  await conv.tocar(p.id, 'whatsapp', entrante, cuando);
  if (!c && entrante) { // primera consulta: pasa por el filtro
    if (conv.esRuido(texto)) { await conv.filtrarConversacion(p.id, 'whatsapp', 'Regla'); return true; }
    const id = await conv.crearLead(p.id, 'whatsapp', 'WhatsApp', 'Lead creado solo: escribió por WhatsApp.');
    c = await one('select * from casos where id=$1', [id]);
  }
  if (!c) return true;
  await q('update casos set actualizado=now() where id=$1', [c.id]);
  const anotar = t => q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [c.id, 'WhatsApp', t]);
  if (!entrante && c.fase === 'lead' && ['nuevo', 'preguntando'].includes(c.etapa)) {
    await q(`update casos set etapa='aguardando', borrador=null, borrador_tipo=null, preguntas_en=coalesce(preguntas_en, now()) where id=$1`, [c.id]);
    await anotar('Le contestaron por WhatsApp. Pasa a Aguardando datos.');
  } else if (!entrante && c.fase === 'lead' && c.etapa === 'aguardando' && c.borrador_tipo === 'recordatorio') {
    await q(`update casos set borrador=null, borrador_tipo=null, recordatorio_en=now() where id=$1`, [c.id]); await anotar('Se mandó el recordatorio.');
  }
  if (entrante && c.fase === 'lead' && ['nuevo', 'preguntando', 'aguardando', 'para_cotizar'].includes(c.etapa)) ia().programar(c.id);
  return true;
}

// ---- mandar desde el CRM ----
async function numero() {
  if (process.env.YCLOUD_NUMERO) return process.env.YCLOUD_NUMERO;
  const guardado = await ajuste('wa_numero'); if (guardado) return guardado;
  const r = await api('/whatsapp/phoneNumbers?limit=10');
  const n = (r.items || [])[0]?.phoneNumber; if (!n) throw new Error('No hay ningún número de WhatsApp conectado en YCloud');
  await guardar('wa_numero', n); return n;
}
async function enviar(tel, texto) {
  if (String(tel).startsWith('demo-')) return 'demo-out-' + Date.now();
  if (STAGING) throw new Error('Staging: no se manda nada a WhatsApp');
  const r = await api('/whatsapp/messages/sendDirectly', { method: 'POST', body: { from: await numero(), to: '+' + digitos(tel), type: 'text', text: { body: String(texto).slice(0, 4000) } } });
  return r.wamid || r.id || null;
}

// ---- avisos de YCloud ----
function firmaOk(req, secreto) {
  const h = String(req.get('ycloud-signature') || '');
  const t = (h.match(/t=(\d+)/) || [])[1], s = (h.match(/s=([0-9a-f]+)/i) || [])[1];
  if (!t || !s || !req.rawBody || !secreto) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const esperada = Buffer.from(crypto.createHmac('sha256', secreto).update(t + '.' + req.rawBody.toString('utf8')).digest('hex'));
  const recibida = Buffer.from(s.toLowerCase());
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}
const ADJ = { image: 'foto', video: 'video', audio: 'audio', document: 'archivo', sticker: 'sticker', location: 'ubicación', contacts: 'contacto' };
function textoDe(m) {
  if (m.type === 'text') return m.text?.body || '[mensaje sin texto]';
  if (m.type === 'button') return m.button?.text || '[botón]';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[respuesta]';
  const cap = m[m.type]?.caption;
  return `[${ADJ[m.type] || 'adjunto'}]${cap ? ' ' + cap : ''}`;
}
async function recibir(req, res) {
  if (STAGING) return res.sendStatus(503);
  if (!firmaOk(req, await ajuste('wa_secreto'))) return res.sendStatus(401);
  res.sendStatus(200);
  const ev = req.body || {};
  guardar('wa_ultimo_aviso', new Date().toISOString()).catch(() => {});
  if (ev.type === 'whatsapp.inbound_message.received' && ev.whatsappInboundMessage) {
    const m = ev.whatsappInboundMessage;
    enCola(() => registrar({ tel: m.from, nombre: m.customerProfile?.name, mid: m.wamid || m.id, entrante: true, texto: textoDe(m), cuando: new Date(m.sendTime || ev.createTime || Date.now()) }));
  } else if (ev.type === 'whatsapp.smb.message.echoes' && ev.whatsappMessage) { // Sol contestó desde el celular
    const m = ev.whatsappMessage;
    enCola(() => registrar({ tel: m.to, mid: m.wamid || m.id, entrante: false, texto: textoDe(m), cuando: new Date(m.sendTime || m.createTime || ev.createTime || Date.now()) }));
  }
}

// ---- al arrancar: el CRM se anota solo como webhook en YCloud ----
async function iniciar() {
  if (STAGING) return console.log('WhatsApp: apagado en staging.');
  if (!KEY()) return console.log('WhatsApp: sin configurar (falta YCLOUD_API_KEY).');
  const base = process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : null);
  if (!base) return anotarError(new Error('Falta PUBLIC_URL para anotar el webhook'));
  const url = base.replace(/\/$/, '') + '/webhooks/whatsapp';
  try {
    if (await ajuste('wa_webhook_url') !== url || !await ajuste('wa_secreto')) {
      const lista = await api('/webhookEndpoints?limit=100').catch(() => ({ items: [] }));
      for (const w of (lista.items || []).filter(w => w.url === url)) await api('/webhookEndpoints/' + w.id, { method: 'DELETE' }).catch(() => {});
      const w = await api('/webhookEndpoints', { method: 'POST', body: { url, enabledEvents: EVENTOS, description: 'CRM Paybe' } });
      if (!w.secret) throw new Error('YCloud no devolvió la clave del webhook');
      await guardar('wa_secreto', w.secret); await guardar('wa_webhook_url', url); await guardar('wa_webhook_id', w.id || '');
    }
    await numero();
    await guardar('wa_error', '');
    console.log('WhatsApp: conectado.');
  } catch (e) { anotarError(e); }
}

async function estado() {
  const [num, url, aviso, error] = await Promise.all([ajuste('wa_numero'), ajuste('wa_webhook_url'), ajuste('wa_ultimo_aviso'), ajuste('wa_error')]);
  const n = await one(`select count(*)::int n, max(creado) ult from mensajes where canal='whatsapp'`);
  return { clave: !!KEY(), numero: num, webhook: url, aviso, error, mensajes: n.n, ultimo: n.ult };
}

module.exports = { registrar, enviar, recibir, iniciar, estado, enCola, textoDe };
