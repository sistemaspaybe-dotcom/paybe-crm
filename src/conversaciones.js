// Bandeja de conversaciones abiertas (Instagram, WhatsApp, mail, web) dentro de Leads.
// Una conversación es una persona en un canal. El estado sale solo de quién mandó el último mensaje:
// Nueva (escribió y nadie contestó) · Te toca (el cliente contestó) · Esperando al cliente (contestamos nosotras).
// Al cerrarla (Terminada / Perdida / No es consulta) deja de aparecer; si la persona vuelve a escribir, se reabre sola.
// Los mensajes no crean leads solos: el lead se crea desde la conversación cuando es una consulta de verdad.
const { q, one } = require('./db');
const { esc } = require('./views');

const CANALES = { instagram: ['Instagram', '📷'], whatsapp: ['WhatsApp', '🟢'], mail: ['Mail', '✉️'], web: ['Web', '🌐'] };
const ESTADOS = { nueva: 'Nueva', te_toca: 'Te toca', esperando: 'Esperando al cliente' };
const CIERRES = { terminada: 'Terminada', perdida: 'Perdida', no_consulta: 'No es consulta' };
const icono = canal => (CANALES[canal] || ['', '💬'])[1];

// cada mensaje que entra o sale actualiza su conversación; si estaba cerrada y la persona escribe, se reabre
async function tocar(personaId, canal, entrante, cuando) {
  await q(`insert into conversaciones(persona_id, canal, ultimo_en) values($1,$2,$3)
    on conflict (persona_id, canal) do update set ultimo_en=greatest(conversaciones.ultimo_en, excluded.ultimo_en),
      cerrada=case when $4 then null else conversaciones.cerrada end, cerrada_en=case when $4 then null else conversaciones.cerrada_en end`,
  [personaId, canal || 'instagram', cuando || new Date(), !!entrante]);
}

const SQL = `select cv.*, p.nombre, p.instagram_user, p.instagram_id, p.whatsapp, p.origen, lm.entrante ult_entrante, lm.texto ult_texto, lm.creado ult_en,
  exists (select 1 from mensajes x where x.persona_id=cv.persona_id and x.canal=cv.canal and not x.entrante) respondimos,
  (select id from casos k where k.persona_id=cv.persona_id and k.fase<>'baja' and not (k.fase='venta' and k.etapa='fin') order by k.creado desc limit 1) caso_id
  from conversaciones cv join personas p on p.id=cv.persona_id
  join lateral (select entrante, texto, creado from mensajes m where m.persona_id=cv.persona_id and m.canal=cv.canal order by creado desc limit 1) lm on true`;
const estadoDe = c => c.ult_entrante ? (c.respondimos ? 'te_toca' : 'nueva') : 'esperando';

async function abiertas() {
  const rows = await q(SQL + ' where cv.cerrada is null');
  return rows.map(r => ({ ...r, estado: estadoDe(r) }));
}
// para Inicio: las que esperan respuesta del equipo, de todos los canales
const sinContestar = async () => (await abiertas()).filter(c => c.estado !== 'esperando').sort((a, b) => new Date(a.ult_en) - new Date(b.ult_en));

const hora = d => new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const CHIP = { nueva: 'op', te_toca: 'op', esperando: '' };

function rutas(app, { wrap, page, log, hace, ig, ia }) {
  const enVentana = personaId => one(`select 1 from mensajes where persona_id=$1 and canal='instagram' and entrante and creado > now() - interval '24 hours'`, [personaId]).then(Boolean);

  // ---- la bandeja ----
  app.get('/leads', wrap(async (req, res, next) => {
    if (req.query.tab === 'leads') return next();
    const f = { canal: req.query.canal || '', estado: req.query.estado || '', dias: req.query.dias || '', orden: req.query.orden || 'reciente' };
    const todas = await abiertas();
    const hoy0 = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }) + 'T00:00:00-03:00');
    const desde = f.dias === 'hoy' ? hoy0 : f.dias ? new Date(Date.now() - Number(f.dias) * 864e5) : null;
    let lista = todas.filter(c => (!f.canal || c.canal === f.canal) && (!f.estado || c.estado === f.estado) && (!desde || new Date(c.ult_en) >= desde));
    const t = c => new Date(c.ult_en).getTime();
    lista.sort(f.orden === 'antigua' ? (a, b) => t(a) - t(b) : f.orden === 'te_toca' ? (a, b) => (b.estado !== 'esperando') - (a.estado !== 'esperando') || t(b) - t(a) : (a, b) => t(b) - t(a));
    const sel = req.query.c ? await one(SQL + ' where cv.id=$1', [req.query.c]) : null;
    if (sel) sel.estado = sel.cerrada ? null : estadoDe(sel);
    const url = cambios => '/leads?' + new URLSearchParams(Object.entries({ ...f, ...cambios }).filter(([, v]) => v)).toString();
    const pill = (clave, valor, texto, n) => `<a class="chip ${f[clave] === valor ? 'on' : ''}" href="${url({ [clave]: valor, c: '' })}">${texto}${n != null ? ' · ' + n : ''}</a>`;
    const nLeads = (await one(`select count(*)::int n from casos where fase='lead'`)).n;

    let panel = '<div class="card mut" style="text-align:center;padding:40px 20px">Elegí una conversación para verla.</div>';
    if (sel) {
      const msgs = await q(`select * from (select * from mensajes where persona_id=$1 and canal=$2 order by creado desc limit 60) m order by creado`, [sel.persona_id, sel.canal]);
      const ventana = sel.canal === 'instagram' && sel.instagram_id && await enVentana(sel.persona_id);
      const abrir = sel.canal === 'instagram' && sel.instagram_user ? `<a class="btn" target=_blank href="https://ig.me/m/${encodeURIComponent(sel.instagram_user)}">Abrir Instagram</a>` : sel.whatsapp ? `<a class="btn" target=_blank href="https://wa.me/${esc(sel.whatsapp.replace(/\D/g, ''))}">Abrir WhatsApp</a>` : '';
      panel = `<div class="card"><div class="row" style="justify-content:space-between"><div><b style="font-size:17px">${icono(sel.canal)} ${esc(sel.nombre)}</b>${sel.instagram_user ? ` <span class=mut>@${esc(sel.instagram_user)}</span>` : ''}</div>${sel.estado ? `<span class="chip ${CHIP[sel.estado]}">${ESTADOS[sel.estado]}</span>` : `<span class="chip ba">${esc(CIERRES[sel.cerrada] || 'Cerrada')}</span>`}</div>
        <div class="row" style="margin-top:10px">${sel.caso_id ? `<a class="btn g" href="/caso/${sel.caso_id}">Ver lead</a>` : `<form method=post action=/conversacion/${sel.id}/lead><button class="p">+ Crear lead</button></form>`}${abrir}</div>
        <div style="display:grid;gap:6px;margin-top:12px;max-height:420px;overflow:auto" id=hilo>${msgs.map(m => `<div style="max-width:82%;padding:8px 12px;border-radius:14px;${m.entrante ? 'background:#F3ECE8;justify-self:start' : 'background:#E3EEF5;justify-self:end'}"><pre>${esc(m.texto)}</pre><div class=mut style="font-size:11px">${m.entrante ? '' : 'Paybe · '}${hora(m.creado)}</div></div>`).join('')}</div>
        ${ventana ? `<form method=post action=/conversacion/${sel.id}/responder style="margin-top:10px"><textarea name=texto rows=3 placeholder="Escribí la respuesta" required></textarea><p><button class="p">Enviar por Instagram</button></p></form>`
          : sel.canal === 'instagram' ? '<p class=mut style="margin-top:10px">Pasaron más de 24 h desde su último mensaje: Instagram no deja contestar desde el CRM. Contestá desde la app.</p>' : ''}
        ${sel.cerrada ? '' : `<form method=post action=/conversacion/${sel.id}/cerrar class="row" style="margin-top:10px;border-top:1px solid #F0E6E1;padding-top:10px"><span class=mut>Cerrar:</span>${Object.entries(CIERRES).map(([k, v]) => `<button name=como value=${k}>${v}</button>`).join('')}</form>`}</div>
        <script>const h=document.getElementById('hilo');if(h)h.scrollTop=h.scrollHeight</script>`;
    }
    const cerrada = req.query.cerrada ? await one('select cv.id, cv.cerrada, p.nombre from conversaciones cv join personas p on p.id=cv.persona_id where cv.id=$1', [req.query.cerrada]) : null;
    page(req, res, 'Leads', `<style>.chip.on{background:var(--marino);color:#fff}a.chip{margin:0 4px 6px 0}.bandeja{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1.3fr);gap:14px;align-items:start}@media(max-width:820px){.bandeja{grid-template-columns:1fr}.bandeja .lado{order:${sel ? -1 : 1}}}.conv{display:block;color:inherit;padding:10px 12px;border-top:1px solid #F0E6E1}.conv:first-child{border-top:0}.conv.sel{background:#FFF8F6}</style>
    <div class="row" style="justify-content:space-between"><h1>Leads</h1><div class="row"><a class="btn" href="/nuevo?oficina=1">+ Visita a la oficina</a><a class="btn p" href="/nuevo">+ Agregar lead</a></div></div>
    <div class="row" style="margin:12px 0;gap:0;border-bottom:1px solid var(--linea)"><a href="/leads" style="padding:10px 14px;font-weight:700;border-bottom:3px solid var(--coral);color:var(--marino)">Conversaciones abiertas · ${todas.length}</a><a href="/leads?tab=leads" style="padding:10px 14px;font-weight:700;color:#5A6670">Leads · ${nLeads}</a></div>
    ${cerrada ? `<div class="aviso"><span>Conversación de <b>${esc(cerrada.nombre)}</b> cerrada como ${esc(CIERRES[cerrada.cerrada] || '')}. Ya no aparece en abiertas.</span><form method=post action=/conversacion/${cerrada.id}/reabrir><button>Deshacer</button></form></div>` : ''}
    <div style="margin-bottom:6px">${pill('canal', '', 'Todos los canales')}${Object.entries(CANALES).map(([k, [n, i]]) => pill('canal', k, `${i} ${n}${k === 'web' ? ' <span style="font-weight:400">(poco volumen)</span>' : ''}`, todas.filter(c => c.canal === k).length)).join('')}</div>
    <div style="margin-bottom:6px">${pill('estado', '', 'Todos')}${Object.entries(ESTADOS).map(([k, n]) => pill('estado', k, n, todas.filter(c => c.estado === k).length)).join('')}</div>
    <div class="row" style="margin-bottom:12px"><span>${pill('dias', '', 'Todas')}${pill('dias', 'hoy', 'Hoy')}${pill('dias', '7', '7 días')}${pill('dias', '30', '30 días')}</span><span class=sp style="flex:1"></span>
      <form class=row><input type=hidden name=canal value="${esc(f.canal)}"><input type=hidden name=estado value="${esc(f.estado)}"><input type=hidden name=dias value="${esc(f.dias)}"><select name=orden onchange="this.form.submit()" style="width:auto">${[['reciente', 'Más reciente primero'], ['antigua', 'Más antigua primero'], ['te_toca', 'Te toca primero']].map(([v, t]) => `<option value=${v}${f.orden === v ? ' selected' : ''}>${t}</option>`).join('')}</select></form></div>
    <div class="bandeja"><div class="card" style="padding:4px 0">${lista.map(c => `<a class="conv ${sel && sel.id === c.id ? 'sel' : ''}" href="${url({ c: c.id })}"><div class="row" style="justify-content:space-between"><b>${icono(c.canal)} ${c.origen === 'Demo' ? '🧪 ' : ''}${esc(c.nombre)}</b><span class="chip ${CHIP[c.estado]}">${ESTADOS[c.estado]}</span></div>
      <div class=mut style="margin-top:2px">${c.ult_entrante ? '' : 'Vos: '}${esc((c.ult_texto || '').slice(0, 80))}</div><div class=mut style="font-size:12px">${hora(c.ult_en)} · ${hace(c.ult_en)}${c.caso_id ? ' · con lead' : ''}</div></a>`).join('') || '<p class=mut style="padding:12px 16px">No hay conversaciones con estos filtros.</p>'}</div>
    <div class="lado">${panel}</div></div>
    <p class=mut>Hoy entra solo Instagram. WhatsApp, mail y web se suman cuando estén conectados.</p>`, '/leads');
  }));

  // ---- crear el lead desde la conversación ----
  app.post('/conversacion/:id/lead', wrap(async (req, res) => {
    const cv = await one(SQL + ' where cv.id=$1', [req.params.id]); if (!cv) return res.redirect('/leads');
    if (cv.caso_id) return res.redirect('/caso/' + cv.caso_id);
    const c = await one('insert into casos(persona_id) values($1) returning id', [cv.persona_id]);
    await q('update mensajes set caso_id=$1 where persona_id=$2 and canal=$3 and caso_id is null', [c.id, cv.persona_id, cv.canal]);
    await log(c.id, req.session.quien, `Lead creado desde la conversación de ${(CANALES[cv.canal] || [cv.canal])[0]}.`);
    if (cv.canal === 'instagram' && !cv.origen) await q(`update personas set origen='Instagram' where id=$1`, [cv.persona_id]);
    ia.programar(c.id);
    res.redirect('/caso/' + c.id);
  }));

  // ---- contestar desde la conversación (Instagram, dentro de las 24 h) ----
  app.post('/conversacion/:id/responder', wrap(async (req, res) => {
    const cv = await one(SQL + ' where cv.id=$1', [req.params.id]); if (!cv) return res.redirect('/leads');
    const texto = String(req.body.texto || '').trim();
    const volver = `/leads?c=${cv.id}`;
    if (!texto || cv.canal !== 'instagram' || !cv.instagram_id) return res.redirect(volver);
    try {
      const mid = await ig.enviar(cv.instagram_id, texto);
      await ig.enCola(() => ig.registrar({ igsid: cv.instagram_id, mid: mid || 'crm-' + Date.now(), entrante: false, texto, cuando: new Date() }));
      if (cv.caso_id) await log(cv.caso_id, req.session.quien, 'Contestó desde Conversaciones por Instagram.');
    } catch (e) { if (cv.caso_id) await log(cv.caso_id, 'CRM', 'No se pudo mandar por Instagram: ' + e.message); }
    res.redirect(volver);
  }));

  // ---- cerrar y deshacer ----
  app.post('/conversacion/:id/cerrar', wrap(async (req, res) => {
    const como = CIERRES[req.body.como] ? req.body.como : 'terminada';
    await q('update conversaciones set cerrada=$1, cerrada_en=now(), cerrada_por=$2 where id=$3', [como, req.session.quien, req.params.id]);
    res.redirect('/leads?cerrada=' + req.params.id);
  }));
  app.post('/conversacion/:id/reabrir', wrap(async (req, res) => {
    await q('update conversaciones set cerrada=null, cerrada_en=null, cerrada_por=null where id=$1', [req.params.id]);
    res.redirect('/leads?c=' + req.params.id);
  }));
}

module.exports = { tocar, abiertas, sinContestar, rutas, CANALES, ESTADOS, icono };
