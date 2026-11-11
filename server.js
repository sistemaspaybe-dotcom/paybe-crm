const express = require('express');
const cookieSession = require('cookie-session');
const db = require('./src/db');
const { q, one } = db;
const { FASES, ACCIONES, BAJAS, MOTIVOS, accionesPara } = require('./src/flow');
const { esc, fecha, usd, layout, chipFase } = require('./src/views');
const ig = require('./src/instagram');

const app = express();
const EQUIPO = ['Patricia', 'Sol', 'Betina'];
const PASS = process.env.APP_PASSWORD;
app.set('trust proxy', 1);
app.use(express.static(__dirname + '/public'));
// Instagram avisa acá cuando alguien escribe; va antes del login porque lo llama Meta (se valida con la firma)
app.get('/webhooks/instagram', ig.verificar);
app.post('/webhooks/instagram', express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }), ig.recibir);
app.get('/privacidad', (req, res) => res.send(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Privacidad · Paybe</title><body style="font:16px/1.6 system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#1F3A4D"><h1>Política de privacidad</h1><p>Esta es una herramienta interna de Paybe Turismo (EVT 6263, Av. Fleming 1897, Martínez, Buenos Aires) para organizar las consultas de sus clientes.</p><p>Cuando alguien le escribe a Paybe por Instagram, guardamos su nombre de usuario y los mensajes de esa conversación, solo para poder responder la consulta y hacer el seguimiento del viaje. No vendemos ni compartimos esos datos con terceros, y no los usamos para publicidad.</p><p>Si querés que borremos tus datos, escribinos por Instagram a @paybe.turismo o acercate a la oficina y los eliminamos.</p></body>`));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
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
  if (PASS && req.body.pass !== PASS) return res.redirect('/entrar?mal=1');
  req.session.quien = EQUIPO.includes(req.body.quien) ? req.body.quien : 'Equipo';
  res.redirect('/');
});
app.get('/salir', (req, res) => { req.session = null; res.redirect('/entrar'); });
app.get('/salud', (req, res) => res.send('ok'));
app.use((req, res, next) => (req.session.quien || (!PASS && process.env.NODE_ENV !== 'production')) ? next() : res.redirect('/entrar'));
app.use((req, res, next) => { if (!req.session.quien) req.session.quien = 'Equipo'; next(); });

// ---- listas ----
const filaCaso = c => `<tr><td><a href="/caso/${c.id}"><b>${esc(c.nombre)}</b></a><div class="mut">${esc(c.destino || '')}</div></td><td>${chipFase(c.fase)}${esc(FASES[c.fase].etapas[c.etapa])}</span></td><td>${esc(c.servicio || '')}</td><td class="mut">${esc(c.fechas || '')} ${c.cuantos ? '· ' + esc(c.cuantos) : ''}</td><td class="mut">${fecha(c.actualizado)}</td></tr>`;
async function lista(req, res, fase, titulo, ruta) {
  const rows = await q('select c.*, p.nombre from casos c join personas p on p.id=c.persona_id where c.fase=$1 order by c.actualizado desc', [fase]);
  const orden = Object.keys(FASES[fase].etapas);
  const porEtapa = orden.map(e => `<span class="chip">${FASES[fase].etapas[e]} · ${rows.filter(r => r.etapa === e).length}</span>`).join(' ');
  page(req, res, titulo, `<h1>${titulo} · ${rows.length}</h1><p>${porEtapa}</p><div class="card"><table><tr><th>Persona</th><th>Etapa</th><th>Servicio</th><th>Viaje</th><th>Último cambio</th></tr>${rows.map(filaCaso).join('') || '<tr><td colspan=5 class=mut>Todavía no hay nada acá.</td></tr>'}</table></div>`, ruta);
}
app.get('/leads', wrap((req, res) => lista(req, res, 'lead', 'Leads', '/leads')));
app.get('/oportunidades', wrap((req, res) => lista(req, res, 'oportunidad', 'Oportunidades', '/oportunidades')));
app.get('/ventas', wrap((req, res) => lista(req, res, 'venta', 'Ventas', '/ventas')));

// ---- inicio ----
app.get('/', wrap(async (req, res) => {
  const avisos = await q(`select a.*, p.nombre, c.id caso from avisos a join casos c on c.id=a.caso_id join personas p on p.id=c.persona_id where not a.hecho order by a.para limit 20`);
  const hoy = new Date().toISOString().slice(0, 10);
  const nuevos = await q(`select c.*, p.nombre from casos c join personas p on p.id=c.persona_id where c.fase='lead' and c.etapa in ('nuevo','para_cotizar') order by c.actualizado limit 10`);
  const sinContestar = await q(`select c.id, p.nombre, m.texto, m.creado from casos c join personas p on p.id=c.persona_id
    join lateral (select * from mensajes where caso_id=c.id order by creado desc limit 1) m on true where m.entrante and c.fase<>'baja' order by m.creado limit 20`);
  page(req, res, 'Inicio', `<h1>Lo de hoy</h1>
  ${sinContestar.length ? `<h2 style="margin:16px 0 8px">Sin contestar en Instagram · ${sinContestar.length}</h2>${sinContestar.map(m => `<a class="aviso rojo" href="/caso/${m.id}" style="color:inherit"><span><b>${esc(m.nombre)}</b> · ${esc((m.texto || '').slice(0, 90))}</span><span class="mut">${hace(m.creado)}</span></a>`).join('')}` : ''}
  <h2 style="margin:16px 0 8px">Avisos</h2>${avisos.map(a => `<div class="aviso ${String(a.para.toISOString?.().slice(0, 10) || a.para) < hoy ? 'rojo' : ''}"><span><b>${esc(a.nombre)}</b> · ${esc(a.texto)} <span class="mut">(${fecha(a.para)})</span></span><form method=post action=/aviso/${a.id}/hecho><button>Listo</button></form></div>`).join('') || '<p class=mut>No hay avisos pendientes.</p>'}
  <h2 style="margin:16px 0 8px">Para hacer</h2><div class="card"><table>${nuevos.map(filaCaso).join('') || '<tr><td class=mut>Nada pendiente.</td></tr>'}</table></div>`, '/');
}));
app.post('/aviso/:id/hecho', wrap(async (req, res) => { await q('update avisos set hecho=true where id=$1', [req.params.id]); res.redirect(req.get('referer') || '/'); }));

// ---- alta de lead ----
app.get('/nuevo', (req, res) => page(req, res, 'Agregar lead', `<h1>Agregar lead</h1><form class="card" method=post action=/nuevo><div class="f">
<div><label>Nombre</label><input name=nombre required></div><div><label>WhatsApp</label><input name=whatsapp></div><div><label>Mail</label><input name=mail></div>
<div><label>De dónde vino</label><select name=origen>${['Instagram', 'WhatsApp', 'Mail', 'Recomendado', 'Oficina o teléfono', 'Cliente que vuelve'].map(o => `<option>${o}</option>`).join('')}</select></div>
<div><label>Qué pide</label><select name=servicio>${['', 'Aéreo', 'Hotel', 'Paquete', 'Visa', 'Grupal', 'Crucero'].map(o => `<option>${o}</option>`).join('')}</select></div>
<div><label>Destino</label><input name=destino></div><div><label>Fechas</label><input name=fechas></div><div><label>Cuántos</label><input name=cuantos></div><div><label>Presupuesto</label><input name=presupuesto></div></div>
<p><button class="p">Crear lead</button></p></form>`));
app.post('/nuevo', wrap(async (req, res) => {
  const b = req.body;
  let p = b.whatsapp && await one('select id from personas where whatsapp=$1', [b.whatsapp]);
  if (!p) p = await one('insert into personas(nombre,whatsapp,mail,origen) values($1,$2,$3,$4) returning id', [b.nombre, b.whatsapp, b.mail, b.origen]);
  const c = await one('insert into casos(persona_id,destino,servicio,fechas,cuantos,presupuesto) values($1,$2,$3,$4,$5,$6) returning id', [p.id, b.destino, b.servicio, b.fechas, b.cuantos, b.presupuesto]);
  await log(c.id, req.session.quien, `Lead creado (${b.origen}).`);
  res.redirect('/caso/' + c.id);
}));

// ---- caso ----
app.get('/caso/:id', wrap(async (req, res) => {
  const c = await one('select c.*, p.nombre, p.whatsapp, p.mail, p.origen, p.instagram_user from casos c join personas p on p.id=c.persona_id where c.id=$1', [req.params.id]);
  if (!c) return res.status(404).send('No existe');
  const [acts, avisos, chats, pagos, reservas, cots, msgs] = await Promise.all([
    q('select * from actividad where caso_id=$1 order by creada desc limit 30', [c.id]),
    q('select * from avisos where caso_id=$1 and not hecho order by para', [c.id]),
    q('select * from chats where caso_id=$1 order by creado desc', [c.id]),
    q('select * from pagos where caso_id=$1 order by fecha', [c.id]),
    q('select * from reservas where caso_id=$1 order by id', [c.id]),
    q('select * from cotizaciones where caso_id=$1 order by creada desc', [c.id]),
    q('select * from (select * from mensajes where caso_id=$1 order by creado desc limit 60) m order by creado', [c.id]),
  ]);
  const igBtn = c.instagram_user ? `<a class="btn" target=_blank href="https://ig.me/m/${encodeURIComponent(c.instagram_user)}">Abrir Instagram</a>` : '';
  const hilo = msgs.length ? `<div class="card"><div class="row" style="justify-content:space-between"><h2>Instagram${c.instagram_user ? ` <span class=mut>@${esc(c.instagram_user)}</span>` : ''}</h2>${msgs[msgs.length - 1].entrante ? '<span class="chip op">Sin contestar</span>' : '<span class="chip ve">Contestado</span>'}</div>
  <div style="display:grid;gap:6px;margin-top:10px;max-height:420px;overflow:auto">${msgs.map(m => `<div style="max-width:78%;padding:8px 12px;border-radius:14px;${m.entrante ? 'background:#F3ECE8;justify-self:start' : 'background:#E3EEF5;justify-self:end'}"><pre>${esc(m.texto)}</pre><div class=mut style="font-size:11px">${m.entrante ? '' : 'Paybe · '}${new Date(m.creado).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' })}</div></div>`).join('')}</div></div>` : '';
  const etapas = Object.entries(FASES[c.fase].etapas); const idx = etapas.findIndex(([k]) => k === c.etapa);
  const bar = c.fase === 'baja' ? '' : `<div class="bar">${etapas.map(([k, n], i) => `<div class="${i < idx ? 'ok' : i === idx ? 'now' : ''}">${n}${i < idx ? ' ✓' : ''}</div>`).join('')}</div>`;
  const acc = accionesPara(c).map(a => `<form method=post action=/caso/${c.id}/${a.k}>${a.pago ? `<input name=monto placeholder="Monto USD" style="width:130px"> <select name=medio style="width:140px">${['Transferencia', 'Efectivo', 'Tarjeta'].map(m => `<option>${m}</option>`).join('')}</select> ` : ''}<button class="g">${esc(a.label)}</button></form>`).join('');
  const baja = BAJAS[c.fase] ? `<form method=post action=/caso/${c.id}/baja class="row"><select name=motivo style="width:210px">${MOTIVOS.map(m => `<option>${m}</option>`).join('')}</select><button>${BAJAS[c.fase]}</button></form>` : '';
  const wa = c.whatsapp ? `<a class="btn" target=_blank href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}">Abrir WhatsApp</a>` : '';
  page(req, res, c.nombre, `<div class="row" style="justify-content:space-between"><div><div class=mut>${FASES[c.fase].nombre}</div><h1>${esc(c.nombre)}</h1></div><div class="row">${igBtn}${wa}<a class="btn" href="/persona/${c.persona_id}">Ver persona</a></div></div>${bar}
  ${c.motivo_baja ? `<div class="aviso rojo">Dada de baja: ${esc(c.motivo_baja)}</div>` : ''}
  ${avisos.map(a => `<div class="aviso"><span>${esc(a.texto)} <span class=mut>(${fecha(a.para)})</span></span><form method=post action=/aviso/${a.id}/hecho><button>Listo</button></form></div>`).join('')}
  <div class="card"><div class="row">${acc}${baja}</div></div>
  ${hilo}
  <div class="grid"><div class="card"><h2>Datos</h2><form method=post action=/caso/${c.id}/datos class="f" style="margin-top:8px">
  <div><label>Servicio</label><input name=servicio value="${esc(c.servicio)}"></div><div><label>Destino</label><input name=destino value="${esc(c.destino)}"></div>
  <div><label>Fechas</label><input name=fechas value="${esc(c.fechas)}"></div><div><label>Cuántos</label><input name=cuantos value="${esc(c.cuantos)}"></div>
  <div><label>Presupuesto</label><input name=presupuesto value="${esc(c.presupuesto)}"></div><div><label>Total venta USD</label><input name=total value="${c.total ?? ''}"></div>
  <div><label>Sale</label><input type=date name=sale value="${c.sale ? new Date(c.sale).toISOString().slice(0, 10) : ''}"></div><div><label>Vuelve</label><input type=date name=vuelve value="${c.vuelve ? new Date(c.vuelve).toISOString().slice(0, 10) : ''}"></div>
  <div style="grid-column:1/-1"><button class="p">Guardar</button></div></form></div>
  <div class="card"><h2>Recordame</h2><form method=post action=/caso/${c.id}/aviso class="f" style="margin-top:8px"><div><label>Cuándo</label><input type=date name=para required value="${new Date(Date.now() + 864e5 * 2).toISOString().slice(0, 10)}"></div><div><label>Qué</label><input name=texto required placeholder="Chequear si contestó"></div><div><button>Crear aviso</button></div></form></div></div>
  <div class="card"><h2>Chat con la persona</h2><p class=mut>Pegá el chat y se guarda con un resumen. Después lo podemos analizar para mejorar las ventas.</p>
  <form method=post action=/caso/${c.id}/chat><textarea name=texto rows=5 placeholder="Pegá acá el chat de WhatsApp"></textarea><p><button class="p">Guardar y resumir</button></p></form>
  ${chats.map(h => `<div class="card" style="background:#FFF8F6"><b>${fecha(h.creado)}</b><pre>${esc(h.resumen || '(sin resumen: falta la clave de IA)')}</pre></div>`).join('')}</div>
  <div class="grid"><div class="card"><h2>Pagos</h2><table>${pagos.map(p => `<tr><td>${fecha(p.fecha)}</td><td>${esc(p.que)}</td><td>${esc(p.medio)}</td><td>${usd(p.monto)}</td></tr>`).join('') || '<tr><td class=mut>Sin pagos.</td></tr>'}</table></div>
  <div class="card"><h2>Reservas</h2>${reservas.map(r => `<div class=row style="justify-content:space-between"><span>${esc(r.servicio)}</span><form method=post action=/reserva/${r.id}/toggle><button>${r.estado === 'confirmada' ? 'Confirmada ✓' : 'Pendiente'}</button></form></div>`).join('') || '<p class=mut>Sin reservas.</p>'}
  <form method=post action=/caso/${c.id}/reserva class="row" style="margin-top:8px"><input name=servicio placeholder="Aéreo, hotel…" style="flex:1"><button>Agregar</button></form></div></div>
  <div class="card"><h2>Cotizaciones</h2>${cots.map(k => `<div>${esc(k.viaje)} · ${usd(k.precio_pp)} pp · ${esc(k.resultado)}</div>`).join('') || '<p class=mut>Ninguna registrada.</p>'}<p><a class="btn" href="/cotizaciones/nueva?caso=${c.id}">+ Registrar una cotización</a></p></div>
  <div class="card"><h2>Actividad</h2>${acts.map(a => `<div>• ${esc(a.texto)} <span class=mut>${esc(a.quien || '')} · ${fecha(a.creada)}</span></div>`).join('')}</div>`, '/' + { lead: 'leads', oportunidad: 'oportunidades', venta: 'ventas', baja: 'leads' }[c.fase]);
}));
app.post('/caso/:id/datos', wrap(async (req, res) => {
  const b = req.body, n = v => v === '' ? null : v;
  await q('update casos set servicio=$1,destino=$2,fechas=$3,cuantos=$4,presupuesto=$5,total=$6,sale=$7,vuelve=$8,actualizado=now() where id=$9', [b.servicio, b.destino, b.fechas, b.cuantos, b.presupuesto, n(b.total), n(b.sale), n(b.vuelve), req.params.id]);
  res.redirect('/caso/' + req.params.id);
}));
app.post('/caso/:id/aviso', wrap(async (req, res) => {
  await q('insert into avisos(caso_id,para,texto) values($1,$2,$3)', [req.params.id, req.body.para, req.body.texto]);
  await log(req.params.id, req.session.quien, 'Aviso creado: ' + req.body.texto); res.redirect('/caso/' + req.params.id);
}));
app.post('/caso/:id/baja', wrap(async (req, res) => {
  const c = await one('select * from casos where id=$1', [req.params.id]);
  await q(`update casos set fase='baja', etapa='baja', baja_desde=$1, motivo_baja=$2, actualizado=now() where id=$3`, [c.fase, req.body.motivo, c.id]);
  await q('update avisos set hecho=true where caso_id=$1', [c.id]);
  await log(c.id, req.session.quien, `Dada de baja (${c.fase}): ${req.body.motivo}.`); res.redirect('/caso/' + c.id);
}));
app.post('/caso/:id/reserva', wrap(async (req, res) => { await q('insert into reservas(caso_id,servicio) values($1,$2)', [req.params.id, req.body.servicio]); res.redirect('/caso/' + req.params.id); }));
app.post('/reserva/:id/toggle', wrap(async (req, res) => {
  const r = await one(`update reservas set estado=case when estado='confirmada' then 'pendiente' else 'confirmada' end where id=$1 returning caso_id`, [req.params.id]); res.redirect('/caso/' + r.caso_id);
}));
app.post('/caso/:id/chat', wrap(async (req, res) => {
  const resumen = await resumir(req.body.texto);
  await q('insert into chats(caso_id,texto,resumen) values($1,$2,$3)', [req.params.id, req.body.texto, resumen]);
  await log(req.params.id, req.session.quien, 'Chat importado.'); res.redirect('/caso/' + req.params.id);
}));
async function resumir(texto) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 600, messages: [{ role: 'user', content: 'Sos asistente de una agencia de viajes. Resumí este chat de WhatsApp en español rioplatense, con viñetas cortas: qué quiere la persona, qué datos faltan, qué se le prometió y cómo conviene seguir. Al final, una línea con una mejora de venta posible.\n\n' + texto.slice(0, 20000) }] }) });
    const j = await r.json(); return j.content?.[0]?.text || null;
  } catch (e) { console.error('IA:', e.message); return null; }
}
// acciones de etapa
app.post('/caso/:id/:accion', wrap(async (req, res, next) => {
  const a = ACCIONES[req.params.accion]; if (!a) return next();
  const c = await one('select * from casos where id=$1', [req.params.id]);
  if (!c || `${c.fase}.${c.etapa}` !== a.desde) return res.redirect('/caso/' + req.params.id);
  await q('update casos set fase=$1, etapa=$2, actualizado=now() where id=$3', [...a.a, c.id]);
  await log(c.id, req.session.quien, a.log);
  if (a.pago) await q('insert into pagos(caso_id,que,monto,medio) values($1,$2,$3,$4)', [c.id, a.pago, req.body.monto || null, req.body.medio]);
  if (a.aviso) await q(`insert into avisos(caso_id,para,texto) values($1,current_date + $2::int,$3)`, [c.id, a.aviso[0], a.aviso[1]]);
  res.redirect('/caso/' + c.id);
}));

// ---- personas ----
app.get('/personas', wrap(async (req, res) => {
  const s = '%' + (req.query.q || '') + '%';
  const rows = await q(`select p.*, (select count(*) from casos where persona_id=p.id) casos, (select count(*) from casos where persona_id=p.id and fase='venta' and etapa='fin') viajes from personas p where nombre ilike $1 or coalesce(whatsapp,'') ilike $1 order by creada desc`, [s]);
  page(req, res, 'Personas', `<h1>Personas · ${rows.length}</h1><form class="row" style="margin:10px 0"><input name=q value="${esc(req.query.q || '')}" placeholder="Buscar por nombre o WhatsApp" style="max-width:340px"><button>Buscar</button></form>
  <div class="card"><table><tr><th>Nombre</th><th>WhatsApp</th><th>Origen</th><th>Consultas</th><th>Viajes</th></tr>${rows.map(p => `<tr><td><a href="/persona/${p.id}"><b>${esc(p.nombre)}</b></a></td><td>${esc(p.whatsapp)}</td><td>${esc(p.origen)}</td><td>${p.casos}</td><td>${p.viajes}</td></tr>`).join('')}</table></div>`, '/personas');
}));
app.get('/persona/:id', wrap(async (req, res) => {
  const p = await one('select * from personas where id=$1', [req.params.id]); if (!p) return res.status(404).send('No existe');
  const cs = await q('select * from casos where persona_id=$1 order by creado desc', [p.id]);
  page(req, res, p.nombre, `<h1>${esc(p.nombre)}</h1>${p.instagram_user ? `<p><a target=_blank href="https://www.instagram.com/${encodeURIComponent(p.instagram_user)}/">Instagram: @${esc(p.instagram_user)}</a></p>` : ''}<div class="card"><form method=post action=/persona/${p.id} class="f"><div><label>Nombre</label><input name=nombre value="${esc(p.nombre)}"></div><div><label>WhatsApp</label><input name=whatsapp value="${esc(p.whatsapp)}"></div><div><label>Mail</label><input name=mail value="${esc(p.mail)}"></div>
  <div style="grid-column:1/-1"><label>Lo que sabemos (gustos, documentos, con quién viaja)</label><textarea name=notas rows=4>${esc(p.notas)}</textarea></div><div><button class="p">Guardar</button></div></form></div>
  <div class="card"><h2>Consultas</h2><table>${cs.map(c => `<tr><td><a href="/caso/${c.id}">${esc(c.destino || c.servicio || 'Consulta')}</a></td><td>${chipFase(c.fase)}${FASES[c.fase].nombre} · ${esc(FASES[c.fase].etapas[c.etapa])}</span></td><td class=mut>${fecha(c.creado)}</td></tr>`).join('')}</table></div>`, '/personas');
}));
app.post('/persona/:id', wrap(async (req, res) => { const b = req.body; await q('update personas set nombre=$1,whatsapp=$2,mail=$3,notas=$4 where id=$5', [b.nombre, b.whatsapp, b.mail, b.notas, req.params.id]); res.redirect('/persona/' + req.params.id); }));

// ---- cotizaciones ----
app.get('/cotizaciones', wrap(async (req, res) => {
  const s = '%' + (req.query.q || '') + '%';
  const rows = await q('select * from cotizaciones where viaje ilike $1 order by mandada desc, id desc', [s]);
  page(req, res, 'Cotizaciones', `<div class="row" style="justify-content:space-between"><div><h1>Cotizaciones</h1><p class=mut>Las últimas que mandaste, guardadas. Cuando otro cliente pide lo mismo, la reutilizás de base.</p></div><a class="btn p" href="/cotizaciones/nueva">+ Registrar una cotización</a></div>
  <form class="row" style="margin:10px 0"><input name=q value="${esc(req.query.q || '')}" placeholder="Buscar por viaje" style="max-width:340px"><button>Buscar</button></form>
  <div class="card"><table><tr><th>Viaje</th><th>Mandada</th><th>Cuántos</th><th>Precio pp</th><th>Margen</th><th>Resultado</th><th></th></tr>${rows.map(k => `<tr><td><b>${esc(k.viaje)}</b><div class=mut>${esc(k.detalle)}</div></td><td>${fecha(k.mandada)}</td><td>${esc(k.cuantos)}</td><td>${usd(k.precio_pp)}</td><td>${k.margen != null ? k.margen + '%' : '—'}</td><td>${esc(k.resultado)}</td><td><a class="btn" href="/cotizaciones/nueva?base=${k.id}">Reutilizar</a></td></tr>`).join('') || '<tr><td colspan=7 class=mut>Todavía no hay cotizaciones.</td></tr>'}</table></div>`, '/cotizaciones');
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
  const f = await q(`select fase, etapa, count(*)::int n from casos group by 1,2`);
  const n = (fase, etapa) => f.filter(r => r.fase === fase && (!etapa || r.etapa === etapa)).reduce((s, r) => s + r.n, 0);
  const motivos = await q(`select motivo_baja m, baja_desde d, count(*)::int n from casos where fase='baja' group by 1,2 order by 3 desc`);
  const origen = await q(`select coalesce(p.origen,'—') o, count(*)::int n, count(*) filter (where c.fase='venta')::int ventas from casos c join personas p on p.id=c.persona_id group by 1 order by 2 desc`);
  const sem = await one(`select count(*) filter (where creado > now()-interval '7 days')::int consultas from casos`);
  const cot = await one(`select count(*)::int n, count(*) filter (where resultado='vendió')::int v from cotizaciones where mandada > current_date-7`);
  const tot = n('lead') + n('oportunidad') + n('venta') + n('baja') || 1;
  page(req, res, 'Dashboards', `<h1>Dashboards</h1><p class=mut>Se arma solo con lo que registran en el CRM.</p>
  <div class="grid"><div class="card"><div class=mut>Consultas en 7 días</div><h1>${sem.consultas}</h1></div><div class="card"><div class=mut>Cotizaciones en 7 días</div><h1>${cot.n}</h1></div><div class="card"><div class=mut>Ventas en curso</div><h1>${n('venta')}</h1></div><div class="card"><div class=mut>Dadas de baja</div><h1>${n('baja')}</h1></div></div>
  <div class="card"><h2>Embudo: dónde se cae la gente</h2><table><tr><td>Leads</td><td>${n('lead')}</td></tr><tr><td>Oportunidades</td><td>${n('oportunidad')}</td></tr><tr><td>Ventas</td><td>${n('venta')}</td></tr><tr><td>Dadas de baja</td><td>${n('baja')} (${Math.round(100 * n('baja') / tot)}%)</td></tr></table></div>
  <div class="grid"><div class="card"><h2>Por qué se cierran</h2><table>${motivos.map(m => `<tr><td>${esc(m.m)}</td><td class=mut>${esc(m.d)}</td><td>${m.n}</td></tr>`).join('') || '<tr><td class=mut>Todavía no hay bajas.</td></tr>'}</table></div>
  <div class="card"><h2>Qué origen convierte</h2><table><tr><th>Origen</th><th>Consultas</th><th>Ventas</th></tr>${origen.map(o => `<tr><td>${esc(o.o)}</td><td>${o.n}</td><td>${o.ventas}</td></tr>`).join('')}</table></div></div>`, '/dashboards');
}));

// ---- instagram: estado de la conexión ----
app.get('/instagram', wrap(async (req, res) => {
  const e = await ig.estado(), si = v => v ? '✓' : 'Falta', cuando = d => d ? new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
  page(req, res, 'Instagram', `<h1>Instagram</h1><p class=mut>Los mensajes que llegan a la cuenta entran solos como leads.</p>
  <div class="card"><table><tr><td>Cuenta conectada</td><td>${e.cuenta ? '@' + esc(e.cuenta) : '—'}</td></tr><tr><td>Token (IG_ACCESS_TOKEN)</td><td>${si(e.token)}</td></tr><tr><td>Secreto de la app (IG_APP_SECRET)</td><td>${si(e.secreto)}</td></tr><tr><td>Clave de verificación (IG_VERIFY_TOKEN)</td><td>${si(e.verify)}</td></tr><tr><td>Lectura con IA para completar la ficha (ANTHROPIC_API_KEY)</td><td>${si(e.ia)}</td></tr>
  <tr><td>Toma mensajes desde</td><td>${cuando(e.desde)}</td></tr><tr><td>Mensajes guardados</td><td>${e.mensajes}</td></tr><tr><td>Último mensaje</td><td>${cuando(e.ultimoMensaje)}</td></tr><tr><td>Último aviso de Meta</td><td>${cuando(e.aviso)}</td></tr><tr><td>Última pasada</td><td>${cuando(e.sync)}</td></tr><tr><td>Token renovado</td><td>${cuando(e.tokenFecha)}</td></tr>
  ${e.error ? `<tr><td>Último error</td><td style="color:#B84A53">${esc(e.error)}</td></tr>` : ''}</table>
  <form method=post action=/instagram/sincronizar style="margin-top:12px"><button class="p">Traer mensajes ahora</button> ${req.query.r ? `<span class=mut>${esc(req.query.r)}</span>` : ''}</form></div>`, '/instagram');
}));
app.post('/instagram/sincronizar', wrap(async (req, res) => {
  const r = await ig.sincronizar().catch(e => ({ ok: false, motivo: e.message }));
  res.redirect('/instagram?r=' + encodeURIComponent(r.ok ? `Listo: ${r.nuevos} mensajes nuevos.` : 'No se pudo: ' + r.motivo));
}));

app.use((e, req, res, next) => { console.error(e); res.status(500).send('Algo salió mal. Probá de nuevo.'); });
const port = process.env.PORT || 3000;
db.init().then(() => app.listen(port, () => { console.log('Paybe CRM en el puerto ' + port); ig.iniciar().catch(e => console.error('Instagram:', e.message)); })).catch(e => { console.error(e); process.exit(1); });
