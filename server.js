const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./src/db');
const { q, one } = db;
const { FASES, ACCIONES, BAJAS, MOTIVOS, PIDE_COMPROBANTE, MEDIOS, accionesPara } = require('./src/flow');
const reglas = require('./src/reglas');
const despues = require('./src/despues');
const ia = require('./src/ia');
const { esc, fecha, fechaDia, usd, dinero, layout, chipFase, CANALES, LOGOS, canalDeCaso: canalDe } = require('./src/views');
const ig = require('./src/instagram');
const conv = require('./src/conversaciones');
const wa = require('./src/whatsapp');
const registro = require('./src/registro');

const app = express();
const EQUIPO = ['Patricia', 'Sol', 'Betina'];
const PASS = process.env.APP_PASSWORD;
app.set('trust proxy', 1);
app.use(express.static(__dirname + '/public'));
// Instagram avisa acá cuando alguien escribe; va antes del login porque lo llama Meta (se valida con la firma)
app.get('/webhooks/instagram', ig.verificar);
app.post('/webhooks/instagram', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), registro.como('instagram', ig.recibir));
// WhatsApp (YCloud) avisa acá; se valida con la firma
app.post('/webhooks/whatsapp', express.json({ limit: '2mb', verify: (req, res, buf) => { req.rawBody = buf; } }), registro.como('whatsapp', (req, res) => wa.recibir(req, res).catch(e => { console.error(e); if (!res.headersSent) res.sendStatus(500); })));
app.get('/privacidad', (req, res) => res.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Privacidad · Paybe</title><body style="font:16px/1.6 system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#1F3A4D"><h1>Política de privacidad</h1><p>Esta es una herramienta interna de Paybe Turismo (EVT 6263, Av. Fleming 1897, Martínez, Buenos Aires) para organizar las consultas de sus clientes.</p><p>Cuando alguien le escribe a Paybe por Instagram, guardamos su nombre de usuario y los mensajes de esa conversación, solo para poder responder la consulta y hacer el seguimiento del viaje. No vendemos ni compartimos esos datos con terceros, y no los usamos para publicidad.</p><p>Si querés que borremos tus datos, escribinos por Instagram a @paybe.turismo o acercate a la oficina y los eliminamos.</p></body>`));
app.use(express.urlencoded({ extended: false, limit: '15mb' })); // 15 MB: los comprobantes viajan en el formulario
app.use(registro.middleware); // registro: de acá en adelante todo queda anotado
require('./src/rutas').publica(app, { wrap: f => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next) });
app.use(cookieSession({ name: 's', secret: process.env.SESSION_SECRET || 'cambiar-en-produccion', maxAge: 30 * 864e5, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }));
const wrap = f => (req, res, next) => Promise.resolve(f(req, res, next)).catch(next);
const page = (req, res, titulo, body, activo) => res.send(layout(titulo, body, { quien: req.session.quien, activo }));
const hace = d => { const m = Math.round((Date.now() - new Date(d)) / 60e3); return m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const log = (caso_id, quien, texto) => q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [caso_id, quien, texto]);

// ---- login ----
app.get('/entrar', (req, res) => res.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#FBF0EC;display:grid;place-items:center;height:100vh;margin:0;color:#1F3A4D}form{background:#fff;padding:28px;border-radius:16px;display:grid;gap:12px;width:300px;border:1px solid #E8DCD6}input,select,button{font:inherit;padding:10px;border-radius:10px;border:1px solid #E8DCD6}button{background:#D8626B;color:#fff;font-weight:700;border:0}</style>
<form method=post action=/entrar><div style="text-align:center"><img src="/logo.png" alt="" style="height:80px;margin-bottom:6px" onerror="this.remove()"></div><select name=quien>${EQUIPO.map(n => `<option>${n}</option>`).join('')}</select><input type=password name=pass placeholder="Contraseña" autofocus><button>Entrar</button>${req.query.mal ? '<small style="color:#B84A53">Contraseña incorrecta</small>' : ''}</form>`));
app.post('/entrar', (req, res) => {
  if (!PASS && process.env.NODE_ENV === 'production') return res.status(503).send('Falta configurar APP_PASSWORD en Railway.');
  if (PASS && req.body.pass !== PASS) { registro.entrada(req, false); return res.redirect('/entrar?mal=1'); }
  registro.entrada(req, true);
  req.session.quien = EQUIPO.includes(req.body.quien) ? req.body.quien : 'Equipo';
  res.redirect('/');
});
app.get('/salir', (req, res) => { req.session = null; res.redirect('/entrar'); });
app.get('/salud', (req, res) => res.send('ok'));
app.use((req, res, next) => (req.session.quien || (!PASS && process.env.NODE_ENV !== 'production')) ? next() : res.redirect('/entrar'));
app.use((req, res, next) => { if (!req.session.quien) req.session.quien = 'Equipo'; next(); });
app.use(registro.identificar);
registro.rutas(app, { wrap, page });

// ---- listas ----
const SEMI = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };
const chipsDestinos = c => (c.dests || []).filter(d => d && d.nombre).map(d => `<span class="chip" style="margin:2px 2px 0 0">${SEMI[d.semaforo] && ['pendiente', 'semaforo'].includes(d.estado) ? SEMI[d.semaforo] + ' ' : ''}${esc(d.nombre)}${d.estado === 'cotizado' ? ' · cotizado' : d.estado === 'eligio' ? ' ✓' : ''}</span>`).join('');
const chipCanal = c => { const [n, col, bg] = CANALES[canalDe(c)]; return `<span class=chip style="background:${bg};color:${col};font-size:12px;padding:2px 8px">${n}</span>`; };
// qué hago con este lead: le toca a ella responder, o estamos esperando al cliente
const queHago = c => {
  const e = conv.estadoChat(c);
  const QUE = { aguardando: 'Respondió: revisá si mandó los datos que faltaban', esperando: 'Respondió a la propuesta: ¿qué dijo?', recotizar: 'Respondió mientras recotizás', para_cotizar: 'Ya tiene los datos: cotizá y respondele con la propuesta', cotizando: 'Escribió mientras cotizás', le_intereso: 'Respondió: ¿mandarle los datos de la seña?', falta_sena: 'Respondió: ¿mandó el comprobante?' };
  if (e === 'nueva' || e === 'te_toca') return `<span style="color:#B84A53;font-weight:800">● Te toca responder</span>${QUE[c.etapa] ? `<div style="font-size:13px;color:#8A3A40">${QUE[c.etapa]}</div>` : ''}${c.borrador ? '<div class=mut style="font-size:13px">✎ hay un borrador listo</div>' : ''}${c.u_creado ? `<div class=mut style="font-size:13px">escribió ${hace(c.u_creado)}</div>` : ''}`;
  if (e === 'esperando') return `<span style="color:#5A6670;font-weight:700">⏳ Esperando al cliente</span>${c.u_creado ? `<div class=mut style="font-size:13px">le escribimos ${hace(c.u_creado)}</div>` : ''}`;
  return c.borrador ? '<span style="color:#B84A53;font-weight:800">✎ Mandar el borrador</span>' : '<span class=mut>Sin chat</span>';
};
const chipSugerencia = c => c.sugerencia ? `<div style="margin-top:6px;padding:6px 8px;background:#FFF3D6;border-radius:8px;font-size:13px"><b>🤔 ${c.sugerencia === 'personal' ? '¿Es personal de Sol?' : '¿No es una consulta?'}</b>${c.sugerencia_por ? ` <span class=mut>${esc(c.sugerencia_por)}</span>` : ''}<div class=row style="gap:6px;margin-top:4px">${c.sugerencia === 'personal' ? `<form method=post action=/persona/${c.persona_id}/personal onsubmit="return confirm('¿Es un contacto personal de Sol? Se borran sus mensajes del CRM y no vuelve a entrar nada de este contacto.')"><button style="padding:3px 10px;font-size:12px">Sí, personal</button></form>` : `<form method=post action=/caso/${c.id}/filtrar><input type=hidden name=motivo value=no_consulta><button style="padding:3px 10px;font-size:12px">Sí, a Filtrados</button></form>`}<form method=post action=/caso/${c.id}/es-consulta-ok><button style="padding:3px 10px;font-size:12px">No, es consulta</button></form></div></div>` : '';
// borrar solo se puede si nunca se le pidieron datos ni se le cotizó: si no contesta, eso es Perdido, no se borra
const sePuedeBorrar = c => c.fase === 'lead' && ['nuevo', 'preguntando'].includes(c.etapa);
const accionesFila = c => c.fase !== 'lead' ? '' : `<div style="display:grid;gap:6px;justify-items:end">
  <details style="position:relative"><summary class=btn style="list-style:none;cursor:pointer;padding:5px 12px;font-size:13px;white-space:nowrap">Filtrar ▾</summary>
    <form method=post action=/caso/${c.id}/filtrar style="position:absolute;right:0;top:calc(100% + 4px);z-index:5;background:#fff;border:1px solid var(--linea);border-radius:12px;padding:8px;display:grid;gap:6px;min-width:220px;box-shadow:0 6px 20px rgba(31,58,77,.12)">
      <button name=motivo value=personal style="text-align:left" onclick="return confirm('¿Es un contacto personal de Sol? Se borran sus mensajes del CRM y no vuelve a entrar nada de este contacto.')">Personal (de Sol)</button>
      <button name=motivo value=no_consulta style="text-align:left">No es una consulta</button><button name=motivo value=proveedor style="text-align:left">Proveedor u otra agencia</button><button name=motivo value=spam style="text-align:left">Spam o publicidad</button></form></details>
  ${sePuedeBorrar(c) ? `<form method=post action=/caso/${c.id}/borrar onsubmit="return confirm('¿Borrar esta conversación del CRM? No se puede deshacer. (Si es un cliente que no contesta, usá Perdido en la ficha.)')"><button style="padding:5px 12px;font-size:13px;color:#B84A53;white-space:nowrap">🗑 Borrar</button></form>` : ''}</div>`;
const filaCaso = c => `<tr><td style="width:88px;text-align:center" title="${CANALES[canalDe(c)][0]}">${LOGOS[canalDe(c)]}<div class=mut style="font-size:11px;margin-top:2px">${CANALES[canalDe(c)][0]}</div></td><td style="min-width:170px"><a href="/caso/${c.id}"><b>${c.origen === 'Demo' ? '🧪 ' : ''}${esc(c.nombre)}</b></a><div style="margin-top:4px">${chipsDestinos(c) || `<span class="mut">${esc(c.destino || '')}</span>`}</div>${chipSugerencia(c)}</td>
  <td style="max-width:380px">${c.u_texto != null ? `<a href="/caso/${c.id}" style="color:inherit;text-decoration:none;display:block"><span class=mut style="font-size:13px">${c.u_entrante ? esc(String(c.nombre || '').split(' ')[0]) + ':' : 'Vos:'}</span> <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(String(c.u_texto).slice(0, 200))}</span></a>` : `<span class=mut>${esc(c.destino || c.servicio || '—')}</span>`}</td>
  <td style="min-width:180px">${queHago(c)}</td>
  <td>${chipFase(c.fase)}${esc(FASES[c.fase].etapas[c.etapa])}</span></td><td class="mut">${fecha(c.actualizado)}</td><td style="text-align:right">${accionesFila(c)}</td></tr>`;
async function lista(req, res, fase, titulo, ruta) {
  const rows = await q(`select c.*, p.nombre,
    (select entrante from mensajes m where m.caso_id=c.id order by creado desc limit 1) ult_entrante,
    exists (select 1 from mensajes m where m.caso_id=c.id and not m.entrante) respondimos, u.canal u_canal, u.texto u_texto, u.entrante u_entrante, u.creado u_creado, (select json_agg(json_build_object('nombre',d.nombre,'semaforo',d.semaforo,'estado',d.estado) order by d.id) from destinos d where d.caso_id=c.id and d.estado<>'descartado') dests, p.origen from casos c join personas p on p.id=c.persona_id
    left join lateral (select m.canal, m.texto, m.entrante, m.creado from mensajes m where m.caso_id=c.id order by m.creado desc limit 1) u on true
    where c.fase=$1 order by c.actualizado desc`, [fase]);
  const orden_ = req.query.orden === 'espera' ? 'espera' : 'nuevo', cuando = r => new Date(r.u_creado || r.actualizado).getTime();
  rows.sort((a, b) => orden_ === 'espera' ? cuando(a) - cuando(b) : cuando(b) - cuando(a));
  if (fase === 'lead') rows.sort((a, b) => (conv.estadoChat(b) === 'te_toca' || conv.estadoChat(b) === 'nueva') - (conv.estadoChat(a) === 'te_toca' || conv.estadoChat(a) === 'nueva'));
  const orden = Object.keys(FASES[fase].etapas);
  // filtros arriba: primero qué hago (responder / esperar), después la etapa
  const toca = r => ['nueva', 'te_toca'].includes(conv.estadoChat(r)), espera = r => conv.estadoChat(r) === 'esperando';
  const f = String(req.query.ver || ''), filtro = f === 'toca' ? toca : f === 'espera' ? espera : orden.includes(f) ? r => r.etapa === f : null;
  const chipF = (k, txt, n, col) => `<a class="chip" href="${f === k ? ruta + (req.query.orden ? '?orden=' + encodeURIComponent(req.query.orden) : '') : ruta + '?ver=' + k + (req.query.orden ? '&orden=' + encodeURIComponent(req.query.orden) : '')}" style="text-decoration:none;${f === k ? 'outline:2px solid var(--azul);' : ''}${col || ''}">${txt} · ${n}</a>`;
  const nT = rows.filter(toca).length, nE = rows.filter(espera).length;
  const conOrden = req.query.orden ? 'orden=' + encodeURIComponent(req.query.orden) : '';
  const seg = (k, txt) => `<a href="${k ? ruta + '?ver=' + k + (conOrden ? '&' + conOrden : '') : ruta + (conOrden ? '?' + conOrden : '')}" style="padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800;${(f || '') === k ? 'background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08);' : ''}color:${k === 'toca' ? '#B84A53' : 'var(--azul)'}">${txt}</a>`;
  const segmentos = `<div style="display:inline-flex;gap:4px;background:#F3E9E4;padding:4px;border-radius:12px;margin:4px 0 10px">${seg('toca', `● Te toca responder · ${nT}`)}${seg('espera', `⏳ Esperando al cliente · ${nE}`)}${seg('', `Todos · ${rows.length}`)}</div>`;
  const qOrden = o => { const u = new URLSearchParams(req.query); u.set('orden', o); return ruta + '?' + u; };
  const selOrden = `<span style="float:right;margin-top:10px" class=mut>Ordenar: <a href="${qOrden('nuevo')}" style="${orden_ === 'nuevo' ? 'font-weight:800;color:var(--azul)' : ''}">más nuevos primero</a> · <a href="${qOrden('espera')}" style="${orden_ === 'espera' ? 'font-weight:800;color:var(--azul)' : ''}">el que más espera primero</a></span>`;
  const porEtapa = selOrden + segmentos + '<div><span class=mut style="font-size:13px;margin-right:6px">Etapa:</span>' + orden.map(e => chipF(e, FASES[fase].etapas[e], rows.filter(r => r.etapa === e).length)).join(' ') + '</div>';
  const total = rows.length;
  if (filtro) rows.splice(0, rows.length, ...rows.filter(filtro));
  const nSug = rows.filter(r => r.sugerencia).length;
  const revisar = fase === 'lead' ? `<div class=row style="gap:8px;align-items:center;margin:4px 0 8px">${req.query.revisando ? '<span class="aviso" style="margin:0">La IA está revisando los chats (no manda nada). Recargá en un minuto.</span>' : ''}<form method=post action=/leads/revisar><button>🤖 Revisar con IA cuáles son personales</button></form>${nSug ? `<span class=mut>${nSug} para revisar: se marcan con 🤔</span>` : ''}</div>` : '';
  const tabs = (fase === 'lead' ? await conv.encabezado('leads', total) : `<h1>${titulo} · ${total}</h1>`) + (req.query.personal ? '<div class="aviso">Listo: marcado como personal. Se borraron sus mensajes y no vuelve a entrar nada de ese contacto. Se puede deshacer en Ajustes.</div>' : '') + (req.query.borrado ? '<div class="aviso">Listo: se borró la conversación del CRM. Si vuelve a escribir, entra como lead nuevo.</div>' : '') + (req.query.filtrado ? '<div class="aviso">Listo: pasó a Filtrados. Si fue un error, en Filtrados está "Es consulta".</div>' : '');
  page(req, res, titulo, `${tabs}${revisar}<p>${porEtapa}</p><div class="card"><table><tr><th>Canal</th><th>Persona</th><th>Último mensaje</th><th>Qué hago</th><th>Etapa del lead</th><th>Último cambio</th><th></th></tr>${rows.map(filaCaso).join('') || '<tr><td colspan=7 class=mut>Todavía no hay nada acá.</td></tr>'}</table></div>`, ruta);
}
conv.rutas(app, { wrap, page, log, ig });
app.post('/caso/:id/borrar', wrap(async (req, res) => {
  const c = await one('select * from casos where id=$1', [req.params.id]);
  if (!c || !sePuedeBorrar(c) || await one(`select 1 from cotizaciones where caso_id=$1 and estado<>'borrador'`, [c.id])) return res.redirect(req.get('referer') || '/leads');
  await q('delete from mensajes where caso_id=$1', [c.id]);
  await q('delete from casos where id=$1', [c.id]); // destinos, avisos, actividad y borradores se van con el caso
  if (!await one('select 1 from casos where persona_id=$1', [c.persona_id])) {
    await q('delete from mensajes where persona_id=$1', [c.persona_id]);
    await q('delete from conversaciones where persona_id=$1', [c.persona_id]);
    await q('delete from personas where id=$1 and not personal', [c.persona_id]);
  }
  res.redirect('/leads?borrado=1');
}));
// sugerencias de la IA sobre qué es cada chat
app.post('/caso/:id/es-consulta-ok', wrap(async (req, res) => {
  await q('update casos set sugerencia=null, sugerencia_por=null where id=$1', [req.params.id]);
  await log(req.params.id, req.session.quien, 'Era una consulta (no es personal).');
  res.redirect(req.get('referer') || '/leads');
}));
let revisando = false;
app.post('/leads/revisar', wrap(async (req, res) => {
  const ia = require('./src/ia');
  if (!ia.hayIA() || revisando) return res.redirect('/leads?revisando=1');
  revisando = true;
  const cs = await q(`select c.id from casos c where c.fase='lead' and exists (select 1 from mensajes m where m.caso_id=c.id)
    and not exists (select 1 from actividad a where a.caso_id=c.id and a.texto like 'Era una consulta%') order by c.actualizado desc limit 60`);
  (async () => { for (const c of cs) { try { await ia.clasificar(c.id); } catch (e) { console.error('clasificar', c.id, e.message); } } revisando = false; })();
  res.redirect('/leads?revisando=1');
}));
app.get('/leads', wrap((req, res) => lista(req, res, 'lead', 'Leads', '/leads')));
app.get('/oportunidades', wrap((req, res) => lista(req, res, 'oportunidad', 'Oportunidades', '/oportunidades')));
app.get('/ventas', wrap((req, res) => lista(req, res, 'venta', 'Ventas', '/ventas')));

// ---- inicio ----
require('./src/inicio')(app, { wrap, page });
app.post('/aviso/:id/hecho', wrap(async (req, res) => { await q('update avisos set hecho=true where id=$1', [req.params.id]); res.redirect(req.get('referer') || '/'); }));

// ---- alta de lead ----
app.get('/nuevo', (req, res) => req.query.oficina ? page(req, res, 'Visita a la oficina', `<h1>Visita a la oficina</h1><p class=mut>Alguien vino a la agencia a consultar.</p><form class="card" method=post action=/nuevo><input type=hidden name=origen value="Oficina"><div class="f">
<div><label>Nombre</label><input name=nombre required></div><div><label>WhatsApp</label><input name=whatsapp inputmode=tel></div>
<div style="grid-column:1/-1"><label>Qué busca</label><input name=destino placeholder="Ej. crucero por el Caribe en febrero"></div>
<div><label>Quién la atendió</label><select name=atendio>${EQUIPO.map(n => `<option${n === req.session.quien ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
<p><button class="p">Crear lead</button></p></form>`, '/leads') : page(req, res, 'Agregar lead', `<h1>Agregar lead</h1><form class="card" method=post action=/nuevo><div class="f">
<div><label>Nombre</label><input name=nombre required></div><div><label>WhatsApp</label><input name=whatsapp></div><div><label>Mail</label><input name=mail></div>
<div><label>De dónde vino</label><select name=origen>${['Instagram', 'WhatsApp', 'Mail', 'Recomendado', 'Oficina o teléfono', 'Cliente que vuelve'].map(o => `<option>${o}</option>`).join('')}</select></div>
<div><label>Tipo de consulta</label><select name=servicio>${['', ...Object.keys(reglas.DEFAULTS.preguntas)].map(o => `<option>${o}</option>`).join('')}</select></div>
<div><label>Destino</label><input name=destino></div><div><label>Fechas</label><input name=fechas></div><div><label>Cuántos</label><input name=cuantos></div><div><label>Presupuesto</label><input name=presupuesto></div></div>
<p><button class="p">Crear lead</button></p></form>`));
app.post('/nuevo', wrap(async (req, res) => {
  const b = req.body;
  let p = b.whatsapp && await one('select id from personas where whatsapp=$1', [b.whatsapp]);
  if (!p) p = await one('insert into personas(nombre,whatsapp,mail,origen) values($1,$2,$3,$4) returning id', [b.nombre, b.whatsapp, b.mail, b.origen]);
  const c = await one('insert into casos(persona_id,destino,servicio,fechas,cuantos,presupuesto,atendio) values($1,$2,$3,$4,$5,$6,$7) returning id', [p.id, b.destino, b.servicio || null, b.fechas, b.cuantos, b.presupuesto, EQUIPO.includes(b.atendio) ? b.atendio : null]);
  if (b.origen === 'Oficina' && b.destino) await q('insert into destinos(caso_id,nombre) values($1,$2)', [c.id, b.destino]);
  await log(c.id, req.session.quien, b.origen === 'Oficina' ? `Lead creado: visita a la oficina${EQUIPO.includes(b.atendio) ? ', la atendió ' + b.atendio : ''}.` : `Lead creado (${b.origen}).`);
  res.redirect('/caso/' + c.id);
}));

// ---- caso ----
app.post('/caso/:id/aviso', wrap(async (req, res) => {
  await q('insert into avisos(caso_id,para,texto) values($1,$2,$3)', [req.params.id, req.body.para, req.body.texto]);
  await log(req.params.id, req.session.quien, 'Aviso creado: ' + req.body.texto); res.redirect('/caso/' + req.params.id);
}));
app.post('/caso/:id/baja', wrap(async (req, res) => {
  const c = await one('select * from casos where id=$1', [req.params.id]);
  const otro = String(req.body.otro || '').trim();
  if (req.body.motivo === 'Otro' && !otro) return res.redirect('/caso/' + c.id);
  if (req.body.motivo === 'Otro') req.body.motivo = 'Otro: ' + otro.slice(0, 200);
  await q(`update casos set fase='baja', etapa='baja', baja_desde=$1, motivo_baja=$2, actualizado=now() where id=$3`, [c.fase, req.body.motivo, c.id]);
  await q('update avisos set hecho=true where caso_id=$1', [c.id]);
  await q(`update destinos set estado='descartado' where caso_id=$1 and estado not in ('eligio','no_eligio','descartado')`, [c.id]);
  await log(c.id, req.session.quien, `Perdido (${FASES[c.fase].nombre}): ${req.body.motivo}.`); res.redirect('/caso/' + c.id);
}));
app.post('/caso/:id/reserva', wrap(async (req, res) => { await q('insert into reservas(caso_id,servicio) values($1,$2)', [req.params.id, req.body.servicio]); res.redirect('/caso/' + req.params.id + '#reservar'); }));
app.post('/reserva/:id/toggle', wrap(async (req, res) => {
  const cod = String(req.body.codigo || '').trim();
  const r = await one(`update reservas set estado=case when estado='confirmada' then 'pendiente' else 'confirmada' end, codigo=coalesce(nullif($2,''), codigo), reservada_en=case when estado='confirmada' then null else now() end where id=$1 returning *`, [req.params.id, cod]);
  if (r.estado === 'confirmada') await log(r.caso_id, req.session.quien, `Reservado: ${r.servicio}${r.codigo ? ' (código ' + r.codigo + ')' : ''}.`);
  res.redirect('/caso/' + r.caso_id + '#reservar');
}));
require('./src/rutas')(app, { wrap, page, log, hace });
// acciones de etapa
app.post('/caso/:id/:accion', wrap(async (req, res, next) => {
  const a = ACCIONES[req.params.accion]; if (!a) return next();
  const c = await one('select * from casos where id=$1', [req.params.id]);
  if (!c || `${c.fase}.${c.etapa}` !== a.desde) return res.redirect('/caso/' + req.params.id);
  if (a.mensaje && req.body.enviar) { // mandarlo desde el CRM por el chat del cliente
    try { await require('./src/canales').enviar(c.id, String(req.body.texto || '').trim()); }
    catch (e) { await log(c.id, 'CRM', 'No se pudo mandar el mensaje: ' + e.message); return res.redirect('/caso/' + c.id); }
  }
  await q('update casos set fase=$1, etapa=$2, actualizado=now() where id=$3', [...a.a, c.id]);
  await log(c.id, req.session.quien, a.log);
  if (req.params.accion === 'datos_sena') {
    await q('update casos set datos_sena_en=now(), sena_seguimiento_en=null where id=$1', [c.id]);
    await q(`update avisos set hecho=true where caso_id=$1 and not hecho and texto ilike '%datos para la seña%'`, [c.id]);
  }
  if (a.pago) {
    const medio = MEDIOS.includes(req.body.medio) ? req.body.medio : MEDIOS[0], pide = PIDE_COMPROBANTE.includes(medio) && !req.body.archivo_b64;
    const monto = Number(String(req.body.monto || '').replace(/\./g, '').replace(',', '.')) || null;
    const pago = await one('insert into pagos(caso_id,que,monto,medio,moneda,comprobante) values($1,$2,$3,$4,$5,$6) returning id', [c.id, a.pago, monto, medio, req.body.moneda === 'ARS' ? 'ARS' : 'USD', !pide]);
    if (await app.locals.guardarArchivo(c.id, pago.id, req.body)) await log(c.id, req.session.quien, `Se subió el comprobante (${a.pago.toLowerCase()}).`);
    if (pide) { // falta el comprobante: aviso + mensaje armado para pedirlo
      const p = await one('select nombre from personas where id=$1', [c.persona_id]);
      const texto = reglas.completar((await reglas.mensajes()).comprobante, { nombre: reglas.primerNombre(p.nombre), medio: medio.toLowerCase(), destino: c.destino || 'el viaje' });
      await q(`update casos set borrador=$1, borrador_tipo='comprobante', borrador_en=now() where id=$2`, [texto, c.id]);
      await q(`insert into avisos(caso_id,para,texto) values($1,current_date,$2)`, [c.id, `Falta el comprobante (${a.pago.toLowerCase()} por ${medio.toLowerCase()})`]);
    }
  }
  if (req.params.accion === 'sena') { // 3.3 · llegó la seña: se le avisa (sale solo si el chat lo deja; si no, queda armado)
    const p = await one('select nombre from personas where id=$1', [c.persona_id]);
    const k = await one(`select d.nombre from cotizaciones k left join destinos d on d.id=k.destino_id where k.caso_id=$1 and k.estado='aceptada' order by k.id desc limit 1`, [c.id]);
    const texto = reglas.completar((await reglas.mensajes()).sena_recibida, { nombre: reglas.primerNombre(p.nombre), destino: k?.nombre || c.destino || 'el viaje', saldo_hasta: reglas.saldoHasta(c.sale) });
    try { const por = await require('./src/canales').enviar(c.id, texto); await log(c.id, 'CRM', `3.3 · Se le avisó por ${por} que recibimos la seña.`); }
    catch (e) { await q(`update casos set borrador=$1, borrador_tipo='sena_recibida', borrador_en=now() where id=$2 and borrador is null`, [texto, c.id]); await log(c.id, 'CRM', '3.3 · Quedó armado el mensaje de "recibimos tu seña" para mandarlo.'); }
  }
  if (a.aviso) await q(`insert into avisos(caso_id,para,texto) values($1,current_date + $2::int,$3)`, [c.id, a.aviso[0], a.aviso[1]]);
  res.redirect('/caso/' + c.id);
}));

// ---- personas ----
app.get('/personas', wrap(async (req, res) => {
  const s = '%' + (req.query.q || '') + '%';
  const rows = await q(`select p.*, (select count(*) from casos where persona_id=p.id) casos, (select count(*) from casos where persona_id=p.id and fase='venta' and etapa='fin') viajes from personas p where not personal and (nombre ilike $1 or coalesce(whatsapp,'') ilike $1) order by creada desc`, [s]);
  page(req, res, 'Personas', `<h1>Personas · ${rows.length}</h1><form class="row" style="margin:10px 0"><input name=q value="${esc(req.query.q || '')}" placeholder="Buscar por nombre o WhatsApp" style="max-width:340px"><button>Buscar</button></form>
  <div class="card"><table><tr><th>Nombre</th><th>WhatsApp</th><th>Origen</th><th>Consultas</th><th>Viajes</th></tr>${rows.map(p => `<tr><td><a href="/persona/${p.id}"><b>${esc(p.nombre)}</b></a></td><td>${esc(p.whatsapp)}</td><td>${esc(p.origen)}</td><td>${p.casos}</td><td>${p.viajes}</td></tr>`).join('')}</table></div>`, '/personas');
}));
app.get('/persona/:id', wrap(async (req, res) => {
  const p = await one('select * from personas where id=$1', [req.params.id]); if (!p) return res.status(404).send('No existe');
  const cs = await q('select * from casos where persona_id=$1 order by creado desc', [p.id]);
  const docs = await q('select id, tipo, nombre, vence, creado from documentos where persona_id=$1 order by id', [p.id]);
  const viajes = await q('select c.id, c.destino, c.fase, c.etapa, t.nombre titular from caso_pasajeros cp join casos c on c.id=cp.caso_id join personas t on t.id=c.persona_id where cp.persona_id=$1 order by c.creado desc', [p.id]);
  page(req, res, p.nombre, `<h1>${esc(p.nombre)}</h1>${p.instagram_user ? `<p><a target=_blank href="https://www.instagram.com/${encodeURIComponent(p.instagram_user)}/">Instagram: @${esc(p.instagram_user)}</a></p>` : ''}<div class="card"><form method=post action=/persona/${p.id} class="f"><div><label>Nombre</label><input name=nombre value="${esc(p.nombre)}"></div><div><label>WhatsApp</label><input name=whatsapp value="${esc(p.whatsapp)}"></div><div><label>Mail</label><input name=mail value="${esc(p.mail)}"></div>
  <div><label>Fecha de nacimiento</label><input type=date name=nacimiento value="${p.nacimiento ? new Date(p.nacimiento).toISOString().slice(0, 10) : ''}"></div><div><label>N° de pasaporte o DNI</label><input name=documento value="${esc(p.documento)}"></div><div style="grid-column:1/-1"><label>Lo que sabemos (gustos, documentos, con quién viaja)</label><textarea name=notas rows=4>${esc(p.notas)}</textarea></div><div><button class="p">Guardar</button></div></form></div>
  <div class="card"><h2>Documentos</h2>${docs.length ? `<table>${docs.map(d => `<tr><td><a target=_blank rel=noopener href="/documento/${d.id}">📎 ${esc(d.tipo)}</a> <span class=mut>${esc(d.nombre)}</span></td><td class=mut>${d.vence ? 'vence ' + fechaDia(d.vence) : ''}</td><td class=mut>subido ${fecha(d.creado)}</td><td><form method=post action=/documento/${d.id}/borrar onsubmit="return confirm('¿Borrar este documento?')"><button style="padding:4px 10px;font-size:12px">Borrar</button></form></td></tr>`).join('')}</table>` : '<p class=mut>Todavía no tiene documentos.</p>'}
  <form method=post action=/persona/${p.id}/documento class=row style="gap:6px;margin-top:10px;flex-wrap:wrap"><select name=tipo style="width:auto">${['Pasaporte', 'DNI', 'Visa', 'Certificado de vacunas', 'Partida de nacimiento', 'Autorización de viaje (menores)', 'Otro'].map(t => `<option>${t}</option>`).join('')}</select>${app.locals.campoArchivo('')}<label style="margin:0;font-weight:400" class=mut>Vence <input type=date name=vence style="width:auto"></label><button onclick="if(!this.form.archivo_b64.value){alert('Elegí el archivo');return false}">Subir documento</button></form></div>
  ${viajes.length ? `<div class="card"><h2>Viajes como pasajero</h2><table>${viajes.map(c => `<tr><td><a href="/caso/${c.id}">${esc(c.destino || 'Viaje')}</a></td><td class=mut>${esc(c.titular)}</td><td>${esc(FASES[c.fase].etapas[c.etapa] || c.etapa)}</td></tr>`).join('')}</table></div>` : ''}
  <div class="card"><h2>Consultas</h2><table>${cs.map(c => `<tr><td><a href="/caso/${c.id}">${esc(c.destino || c.servicio || 'Consulta')}</a></td><td>${chipFase(c.fase)}${FASES[c.fase].nombre} · ${esc(FASES[c.fase].etapas[c.etapa])}</span></td><td class=mut>${fecha(c.creado)}</td></tr>`).join('')}</table></div>`, '/personas');
}));
app.post('/persona/:id', wrap(async (req, res) => { const b = req.body; await q('update personas set nombre=$1,whatsapp=$2,mail=$3,notas=$4,nacimiento=$5,documento=$6 where id=$7', [b.nombre, b.whatsapp, b.mail, b.notas, b.nacimiento || null, b.documento || null, req.params.id]); res.redirect('/persona/' + req.params.id); }));

// ---- cotizaciones ----
app.get('/cotizaciones', wrap(async (req, res) => {
  const s = '%' + (req.query.q || '') + '%';
  const rows = await q(`select k.*, p.nombre from cotizaciones k left join casos c on c.id=k.caso_id left join personas p on p.id=c.persona_id where k.viaje ilike $1 and k.estado<>'borrador' order by k.mandada desc nulls last, k.id desc`, [s]);
  page(req, res, 'Cotizaciones', `<div class="row" style="justify-content:space-between"><div><h1>Cotizaciones</h1><p class=mut>Todas las que se mandaron. Cuando otro cliente pide lo mismo destino, el cotizador te las ofrece como base.</p></div><a class="btn p" href="/cotizaciones/nueva">+ Registrar una cotización</a></div>
  <form class="row" style="margin:10px 0"><input name=q value="${esc(req.query.q || '')}" placeholder="Buscar por viaje" style="max-width:340px"><button>Buscar</button></form>
  <div class="card"><table><tr><th>Viaje</th><th>Mandada</th><th>Cuántos</th><th>Precio pp</th><th>Margen</th><th>Resultado</th><th></th></tr>${rows.map(k => `<tr><td><b>${esc(k.viaje)}</b>${k.version > 1 ? ` <span class=mut>v${k.version}</span>` : ''}<div class=mut>${esc(k.nombre || '')} · ${esc(k.detalle)}</div></td><td>${fecha(k.mandada)}</td><td>${esc(k.cuantos)}</td><td>${dinero(k.precio_pp, k.moneda)}</td><td>${k.margen != null ? k.margen + '%' : '—'}</td><td>${esc({ mandada: 'Mandada', aceptada: 'Aceptada ✓', reemplazada: 'Reemplazada', no_eligio: 'No eligió' }[k.estado] || k.resultado)}</td><td>${k.token ? `<a class="btn" target=_blank href="/c/${k.token}">Ver</a>` : `<a class="btn" href="/cotizaciones/nueva?base=${k.id}">Reutilizar</a>`}</td></tr>`).join('') || '<tr><td colspan=7 class=mut>Todavía no hay cotizaciones.</td></tr>'}</table></div>`, '/cotizaciones');
}));
app.get('/cotizaciones/nueva', wrap(async (req, res) => {
  const b = req.query.base ? await one('select * from cotizaciones where id=$1', [req.query.base]) : {};
  page(req, res, 'Registrar cotización', `<h1>Registrar una cotización</h1><form class="card" method=post action=/cotizaciones><input type=hidden name=caso value="${esc(req.query.caso)}"><div class="f">
  <div><label>Viaje</label><input name=viaje required value="${esc(b.viaje)}"></div><div><label>Viaja</label><input name=viaja value="${esc(b.viaja)}"></div><div><label>Cuántos</label><input name=cuantos value="${esc(b.cuantos)}"></div>
  <div><label>Precio por persona USD</label><input name=precio_pp value="${esc(b.precio_pp)}"></div><div><label>Margen %</label><input name=margen value="${esc(b.margen)}"></div>
  <div style="grid-column:1/-1"><label>Detalle (qué incluye)</label><textarea name=detalle rows=3>${esc(b.detalle)}</textarea></div></div><p><button class="p">Guardar</button></p></form>`, '/cotizaciones');
}));
app.post('/cotizaciones', wrap(async (req, res) => {
  const b = req.body, n = v => v === '' || v == null ? null : v;
  await q('insert into cotizaciones(caso_id,viaje,viaja,cuantos,precio_pp,margen,detalle) values($1,$2,$3,$4,$5,$6,$7)', [n(b.caso), b.viaje, b.viaja, b.cuantos, n(b.precio_pp), n(b.margen), b.detalle]);
  if (n(b.caso)) await log(b.caso, req.session.quien, 'Cotización registrada: ' + b.viaje);
  res.redirect(n(b.caso) ? '/caso/' + b.caso : '/cotizaciones');
}));
app.post('/cotizaciones/:id/resultado', wrap(async (req, res) => { await q('update cotizaciones set resultado=$1 where id=$2', [req.body.resultado, req.params.id]); res.redirect('/cotizaciones'); }));

// ---- dashboards ----
app.get('/dashboards', wrap(async (req, res) => {
  const f = await q(`select fase, etapa, count(*)::int n from casos where motivo_baja is distinct from 'No es consulta' group by 1,2`);
  const n = (fase, etapa) => f.filter(r => r.fase === fase && (!etapa || r.etapa === etapa)).reduce((s, r) => s + r.n, 0);
  const motivos = await q(`select motivo_baja m, baja_desde d, count(*)::int n from casos where fase='baja' and motivo_baja<>'No es consulta' group by 1,2 order by 3 desc`);
  const origen = await q(`select coalesce(p.origen,'—') o, count(*)::int n, count(*) filter (where c.fase='venta')::int ventas from casos c join personas p on p.id=c.persona_id group by 1 order by 2 desc`);
  const sem = await one(`select count(*) filter (where creado > now()-interval '7 days')::int consultas from casos`);
  const cot = await one(`select count(*)::int n, count(*) filter (where resultado='vendió')::int v from cotizaciones where mandada > current_date-7`);
  const tot = n('lead') + n('oportunidad') + n('venta') + n('baja') || 1;
  page(req, res, 'Dashboards', `<h1>Dashboards</h1><p class=mut>Se arma solo con lo que registran en el CRM.</p>
  <div class="grid"><div class="card"><div class=mut>Consultas en 7 días</div><h1>${sem.consultas}</h1></div><div class="card"><div class=mut>Cotizaciones en 7 días</div><h1>${cot.n}</h1></div><div class="card"><div class=mut>Ventas en curso</div><h1>${n('venta')}</h1></div><div class="card"><div class=mut>Perdidos</div><h1>${n('baja')}</h1></div></div>
  <div class="card"><h2>Embudo: dónde se cae la gente</h2><table><tr><td>Leads</td><td>${n('lead')}</td></tr><tr><td>Oportunidades</td><td>${n('oportunidad')}</td></tr><tr><td>Ventas</td><td>${n('venta')}</td></tr><tr><td>Perdidos</td><td>${n('baja')} (${Math.round(100 * n('baja') / tot)}%)</td></tr></table></div>
  <div class="grid"><div class="card"><h2>Por qué se pierden</h2><table>${motivos.map(m => `<tr><td>${esc(m.m)}</td><td class=mut>${esc(m.d)}</td><td>${m.n}</td></tr>`).join('') || '<tr><td class=mut>Todavía no hay perdidos.</td></tr>'}</table></div>
  <div class="card"><h2>Qué origen convierte</h2><table><tr><th>Origen</th><th>Consultas</th><th>Ventas</th></tr>${origen.map(o => `<tr><td>${esc(o.o)}</td><td>${o.n}</td><td>${o.ventas}</td></tr>`).join('')}</table></div></div>`, '/dashboards');
}));

// ---- instagram: estado de la conexión ----
app.get('/instagram', wrap(async (req, res) => {
  const e = await ig.estado(), si = v => v ? '✓' : 'Falta', cuando = d => d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
  page(req, res, 'Instagram', `<h1>Instagram</h1><p class=mut>Los mensajes que llegan a la cuenta entran solos: si es una consulta se crea el lead; si no (reels, menciones, reacciones a historias), va a Leads → Filtrados.</p>
  <div class="card"><table><tr><td>Cuenta conectada</td><td>${e.cuenta ? '@' + esc(e.cuenta) : '—'}</td></tr><tr><td>Token (IG_ACCESS_TOKEN)</td><td>${si(e.token)}</td></tr><tr><td>Secreto de la app (IG_APP_SECRET)</td><td>${si(e.secreto)}</td></tr><tr><td>Clave de verificación (IG_VERIFY_TOKEN)</td><td>${si(e.verify)}</td></tr><tr><td>Lectura con IA para completar la ficha (ANTHROPIC_API_KEY)</td><td>${si(e.ia)}</td></tr>
  <tr><td>Toma mensajes desde</td><td>${cuando(e.desde)}</td></tr><tr><td>Mensajes guardados</td><td>${e.mensajes}</td></tr><tr><td>Último mensaje</td><td>${cuando(e.ultimoMensaje)}</td></tr><tr><td>Último aviso de Meta</td><td>${cuando(e.aviso)}</td></tr><tr><td>Última pasada</td><td>${cuando(e.sync)}</td></tr><tr><td>Token renovado</td><td>${cuando(e.tokenFecha)}</td></tr>
  ${e.error ? `<tr><td>Último error</td><td style="color:#B84A53">${esc(e.error)}</td></tr>` : ''}</table>
  <form method=post action=/instagram/sincronizar style="margin-top:12px"><button class="p">Traer mensajes ahora</button> ${req.query.r ? `<span class=mut>${esc(req.query.r)}</span>` : ''}</form></div>`, '/instagram');
}));
// ---- whatsapp: estado de la conexión ----
app.get('/whatsapp', wrap(async (req, res) => {
  const e = await wa.estado(), cuando = d => d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
  page(req, res, 'WhatsApp', `<h1>WhatsApp</h1><p class=mut>Los mensajes que le llegan al número entran solos, y lo que se contesta desde el celular también queda registrado.</p>
  <div class="card"><table><tr><td>Clave de YCloud (YCLOUD_API_KEY)</td><td>${e.clave ? '✓' : 'Falta'}</td></tr><tr><td>Número conectado</td><td>${esc(e.numero || '—')}</td></tr><tr><td>Aviso de mensajes (webhook)</td><td>${e.webhook ? '✓ ' + esc(e.webhook) : 'Falta'}</td></tr>
  <tr><td>Mensajes guardados</td><td>${e.mensajes}</td></tr><tr><td>Último mensaje</td><td>${cuando(e.ultimo)}</td></tr><tr><td>Último aviso de YCloud</td><td>${cuando(e.aviso)}</td></tr>${e.error ? `<tr><td>Último error</td><td style="color:#B84A53">${esc(e.error)}</td></tr>` : ''}</table>
  <form method=post action=/whatsapp/conectar style="margin-top:12px"><button class="p">Volver a conectar</button></form></div>`, '/ajustes');
}));
app.post('/whatsapp/conectar', wrap(async (req, res) => { await q("delete from ajustes where clave in ('wa_webhook_url','wa_numero')"); await wa.iniciar(); res.redirect('/whatsapp'); }));
app.post('/instagram/sincronizar', wrap(async (req, res) => {
  const r = await ig.sincronizar().catch(e => ({ ok: false, motivo: e.message }));
  res.redirect('/instagram?r=' + encodeURIComponent(r.ok ? `Listo: ${r.nuevos} mensajes nuevos.` : 'No se pudo: ' + r.motivo));
}));

app.use((e, req, res, next) => { console.error(e); res.status(500).send('Algo salió mal. Probá de nuevo.'); });
const port = process.env.PORT || 3000;
db.init().then(reglas.migrar).then(conv.limpiarViejos).then(() => app.listen(port, () => { console.log('Paybe CRM en el puerto ' + port); registro.como('instagram', () => ig.iniciar().catch(e => console.error('Instagram:', e.message)))(); registro.como('whatsapp', () => wa.iniciar().catch(e => console.error('WhatsApp:', e.message)))();
  const tarea = registro.como('automático', () => ia.revisarRecordatorios().then(ia.revisarSeguimientos).then(despues.revisar).catch(e => console.error('Recordatorios:', e.message)));
  setTimeout(tarea, 30e3); setInterval(tarea, 5 * 60e3).unref(); })).catch(e => { console.error(e); process.exit(1); });
