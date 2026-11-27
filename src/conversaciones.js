// Una sola lista: Leads. Cuando alguien escribe por primera vez, el CRM decide si es una consulta:
// 1) reglas fijas para lo obvio (reels, menciones, "hermoso" a una historia); 2) la IA para lo dudoso.
// Lo que no es consulta va a Filtrados (no se borra; "Es consulta" lo pasa a Leads).
// El estado del chat (Nueva / Te toca / Esperando al cliente) se muestra en cada lead.
const { q, one } = require('./db');
const { esc } = require('./views');

const CANALES = { instagram: ['Instagram', '📷'], whatsapp: ['WhatsApp', '🟢'], mail: ['Mail', '✉️'], web: ['Web', '🌐'] };
const ESTADOS = { nueva: 'Nueva', te_toca: 'Te toca', esperando: 'Esperando al cliente' };
const icono = canal => (CANALES[canal] || ['', '💬'])[1];
const ia = () => require('./ia'); // se carga al usarlo (ia también usa este módulo)

// cada mensaje actualiza su conversación; un mensaje nuevo reabre una cerrada, salvo las filtradas (eso lo decide el filtro)
async function tocar(personaId, canal, entrante, cuando) {
  await q(`insert into conversaciones(persona_id, canal, ultimo_en) values($1,$2,$3)
    on conflict (persona_id, canal) do update set ultimo_en=greatest(conversaciones.ultimo_en, excluded.ultimo_en),
      cerrada=case when $4 and conversaciones.cerrada is distinct from 'filtrado' then null else conversaciones.cerrada end`,
  [personaId, canal || 'instagram', cuando || new Date(), !!entrante]);
}

// ---- filtro con reglas fijas: lo que seguro no es una consulta ----
const ADJUNTO_RUIDO = /^\[(reel|publicación compartida|mención en una historia|mensaje sin texto)\]$/;
const PIDE_ALGO = /(\?|precio|cu[aá]nto|cotiz|info|viaj|quiero|quisiera|querr|consult|paquete|salida|disponib|lugar|fecha|reserv|pasaje|vuelo|hotel|tour|itinerar|excursi|crucero|visa|seña|cuota|price|trip|cost|\d)/i;
const REACCION = /^(ja|je|hermos|ame|amo|amé|me encant|que lind|qué lind|divin|genial|gracias|wow|guau|increible|increíble|precios|bell|top|tremend|uff|💙|❤|😍|🔥|👏|🙌)/i;
function esRuido(texto) {
  const historia = /^\(respondió a una historia\)/.test(texto || '');
  const t = String(texto || '').replace(/^\(respondió a una historia\)\s*/, '').trim();
  if (!t) return true;
  const tokens = t.match(/\[[^\]]+\]/g) || [];
  const sinAdjuntos = t.replace(/\[[^\]]+\]/g, '').trim();
  if (!sinAdjuntos) return tokens.length > 0 && tokens.every(x => ADJUNTO_RUIDO.test(x)); // solo un reel, una mención…
  if (PIDE_ALGO.test(sinAdjuntos)) return false;
  if (!sinAdjuntos.replace(/[^\p{L}]/gu, '')) return true; // solo emojis
  return (historia && sinAdjuntos.length <= 60) || (sinAdjuntos.length <= 30 && REACCION.test(sinAdjuntos));
}

// ¿escribió solo un saludo? ("Hola!", "Buenas tardes", "hola, ¿cómo estás?") → se le contesta solo con el saludo armado
const PALABRAS_SALUDO = new Set(['hola', 'holis', 'holi', 'buenas', 'buen', 'buenos', 'buena', 'dia', 'dias', 'tardes', 'noches', 'que', 'tal', 'como', 'estas', 'esta', 'va', 'hey', 'hi', 'hello', 'saludos', 'todo', 'bien']);
const ABRE_SALUDO = /^(hol[aiy]s?|buen[oa]?s?|hey|hi|hello|saludos)$/;
function esSaludo(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/(.)\1+/g, '$1').trim();
  const w = t.split(/\s+/).filter(Boolean);
  return w.length > 0 && w.length <= 6 && ABRE_SALUDO.test(w[0]) && w.every(x => PALABRAS_SALUDO.has(x) || ABRE_SALUDO.test(x));
}
// manda el saludo por el canal por el que escribió. Si no se puede (o está apagada la respuesta automática), queda armado para mandarlo a mano
async function saludar(casoId) {
  const c = await one('select c.*, p.nombre from casos c join personas p on p.id=c.persona_id where c.id=$1', [casoId]);
  if (!c || c.fase !== 'lead' || c.etapa !== 'nuevo') return;
  if (await one('select 1 from mensajes where caso_id=$1 and not entrante limit 1', [casoId])) return; // ya le contestaron
  const texto = (await require('./reglas').mensajes()).saludo;
  await q(`update casos set borrador=$1, borrador_tipo='saludo', borrador_en=now() where id=$2`, [texto, casoId]);
  const auto = (await one(`select valor from ajustes where clave='auto_preguntas'`))?.valor !== 'no';
  if (!auto) return q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, 'CRM', 'Solo saludó: quedó armado el saludo para mandarlo.']);
  try {
    const por = await require('./canales').enviar(casoId, texto, { auto: true });
    await q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, 'CRM', `Solo saludó: se le mandó solo el saludo por ${por}. Cuando conteste, la IA sigue con las preguntas para cotizar.`]);
  } catch (e) { await q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, 'CRM', 'No se pudo mandar solo el saludo: ' + e.message + '. Quedó armado para mandarlo a mano.']); }
}
// el saludo salió (desde el CRM o desde el celu): se marca como automático y se limpia el borrador
async function saludoMandado(c, mensajeId) {
  await q(`update casos set borrador=null, borrador_tipo=null where id=$1 and borrador_tipo='saludo'`, [c.id]);
  if (mensajeId) await q(`update mensajes set auto='saludo' where id=$1`, [mensajeId]);
  c.borrador_tipo = null;
}

// por qué se filtró (lo elige el equipo con el botón Filtrar; la regla y la IA ponen "No es una consulta")
const MOTIVOS_FILTRO = { no_consulta: 'No es una consulta', proveedor: 'Proveedor u otra agencia', spam: 'Spam o publicidad' };
// ¿la respuesta del equipo le pidió datos? Solo así el lead pasa a Aguardando datos.
// Cuenta si mandaron las preguntas armadas, o si el mensaje pregunta algo; un "¡dale!" o un saludo no.
function preguntoAlgo(texto, c) {
  const t = String(texto || '').trim();
  if (c.borrador_tipo === 'saludo') return false; // el saludo automático no son las preguntas para cotizar
  if (c.borrador_tipo === 'preguntas' && c.borrador && t.slice(0, 40) === String(c.borrador).trim().slice(0, 40)) return true;
  // tiene que preguntar algo del viaje: "¿quién es el chico del cumple?" no cuenta
  return /[?¿]/.test(t) && /viaj|fecha|cu[aá]nd|cu[aá]nt|presupuesto|destino|sal[ei]n|d[ií]as|persona|adulto|menor|hotel|alojamiento|vuelo|a[eé]reo|categor|cotiz|propuesta/i.test(t);
}
async function filtrarConversacion(personaId, canal, quien, motivo = 'no_consulta') {
  await q(`update conversaciones set cerrada='filtrado', cerrada_en=now(), cerrada_por=$3, motivo=$4 where persona_id=$1 and canal=$2`, [personaId, canal, quien, motivo]);
}
// la IA o el equipo dicen que un lead no era consulta: sale de Leads y va a Filtrados
async function filtrarCaso(casoId, quien, motivo = 'no_consulta') {
  const c = await one('select * from casos where id=$1', [casoId]); if (!c || c.fase !== 'lead') return;
  await q(`update casos set fase='baja', etapa='baja', baja_desde='lead', motivo_baja='No es consulta', borrador=null, borrador_tipo=null, actualizado=now() where id=$1`, [c.id]);
  await q('update avisos set hecho=true where caso_id=$1', [c.id]);
  const canales = await q('select distinct canal from mensajes where caso_id=$1', [c.id]);
  for (const { canal } of canales) await filtrarConversacion(c.persona_id, canal, quien, motivo);
  await q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [c.id, quien, `${MOTIVOS_FILTRO[motivo] || 'No es una consulta'}: pasa a Filtrados.`]);
}

// crea el lead para la consulta de una persona (o recupera el que estaba filtrado) y la IA arranca a leer
async function crearLead(personaId, canal, quien, texto) {
  const previo = await one(`select * from casos where persona_id=$1 order by creado desc limit 1`, [personaId]);
  let casoId;
  if (previo && previo.fase === 'baja' && previo.motivo_baja === 'No es consulta') {
    await q(`update casos set fase='lead', etapa='nuevo', baja_desde=null, motivo_baja=null, actualizado=now() where id=$1`, [previo.id]);
    casoId = previo.id;
  } else casoId = (await one('insert into casos(persona_id) values($1) returning id', [personaId])).id;
  await q('update mensajes set caso_id=$1 where persona_id=$2 and caso_id is null', [casoId, personaId]);
  await q(`update conversaciones set cerrada=null, cerrada_en=null, cerrada_por=null where persona_id=$1`, [personaId]);
  await q(`update personas set origen=coalesce(origen,$2) where id=$1`, [personaId, (CANALES[canal] || [canal])[0]]);
  await q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, quien, texto]);
  // si solo saludó, se le contesta el saludo (sin esperar a la IA, que a un "Hola" solo lo mandaría a Filtrados)
  const recibidos = ['Instagram', 'WhatsApp'].includes(quien) ? await q('select texto from mensajes where caso_id=$1 and entrante', [casoId]) : [];
  if (recibidos.length && recibidos.every(m => esSaludo(m.texto))) ia().enCola(() => saludar(casoId), casoId); // en otra cola: no se espera acá
  else ia().programar(casoId);
  return casoId;
}

// estado del chat de un lead, según quién mandó el último mensaje
const estadoChat = c => c.ult_entrante == null ? null : c.ult_entrante ? (c.respondimos ? 'te_toca' : 'nueva') : 'esperando';
const CHIP = { nueva: 'op', te_toca: 'op', esperando: '' };
const chipChat = c => { const e = estadoChat(c); return e ? `<span class="chip ${CHIP[e]}" style="margin-left:6px">💬 ${ESTADOS[e]}</span>` : ''; };

// Inicio: chats que esperan respuesta del equipo (sin los filtrados)
async function sinContestar() {
  return q(`select cv.canal, p.nombre, lm.texto ult_texto, lm.creado ult_en,
      (select id from casos k where k.persona_id=cv.persona_id and k.fase<>'baja' order by k.creado desc limit 1) caso_id
    from conversaciones cv join personas p on p.id=cv.persona_id
    join lateral (select entrante, texto, creado from mensajes m where m.persona_id=cv.persona_id and m.canal=cv.canal order by creado desc limit 1) lm on true
    where cv.cerrada is null and lm.entrante order by lm.creado limit 20`);
}

// botón Filtrar de la ficha: un desplegable con el porqué
const BOTON_FILTRAR = casoId => `<details class=filtrar style="position:relative"><summary class="btn" style="list-style:none;cursor:pointer">Filtrar ▾</summary>
  <form method=post action=/caso/${casoId}/filtrar style="position:absolute;right:0;top:calc(100% + 6px);z-index:5;background:#fff;border:1px solid var(--linea);border-radius:12px;padding:8px;display:grid;gap:6px;min-width:260px;box-shadow:0 6px 20px rgba(31,58,77,.12)">
  <span class=mut style="padding:2px 6px">¿Por qué no va a Leads?</span>
  ${Object.entries({ ...MOTIVOS_FILTRO, personal: 'Personal (de Sol)' }).map(([k, t]) => `<button name=motivo value=${k} style="text-align:left"${k === 'personal' ? ` onclick="return confirm('¿Es un contacto personal? Se borran sus mensajes del CRM y no vuelve a entrar nada de este contacto.')"` : ''}>${t}</button>`).join('')}
  <span class=mut style="padding:2px 6px;font-size:12px">Personal borra sus mensajes y no vuelve a entrar. Lo demás va a Filtrados y se puede recuperar.</span></form></details>`;
// marcar como personal: borra lo guardado y ese contacto no vuelve a entrar
const BOTON_PERSONAL = id => `<form method=post action=/persona/${id}/personal onsubmit="return confirm('¿Es un contacto personal? Se borran sus mensajes del CRM y no vuelve a entrar nada de este contacto.')"><button>Personal</button></form>`;
const hora = d => new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

// pestañas de arriba de Leads
async function encabezado(activa, nLeads, nFiltrados) {
  if (nFiltrados == null) nFiltrados = (await one(`select count(*)::int n from conversaciones where cerrada='filtrado'`)).n;
  const tab = (on, href, txt) => `<a href="${href}" style="padding:10px 14px;font-weight:700;${on ? 'border-bottom:3px solid var(--coral);color:var(--marino)' : 'color:#5A6670'}">${txt}</a>`;
  return `<div class="row" style="justify-content:space-between"><h1>Leads</h1><div class="row"><a class="btn" href="/nuevo?oficina=1">+ Visita a la oficina</a><a class="btn p" href="/nuevo">+ Agregar lead</a></div></div>
  <div class="row" style="margin:12px 0;gap:0;border-bottom:1px solid var(--linea)">${tab(activa === 'leads', '/leads', 'Leads · ' + nLeads)}${tab(activa === 'filtrados', '/leads/filtrados', 'Filtrados · ' + nFiltrados)}</div>`;
}

function rutas(app, { wrap, page, log, ig }) {
  // ---- Filtrados ----
  app.get('/leads/filtrados', wrap(async (req, res) => {
    const rows = await q(`select cv.*, p.nombre, p.instagram_user, lm.texto, lm.creado ult_en,
        (select count(*)::int from mensajes m where m.persona_id=cv.persona_id and m.canal=cv.canal) n
      from conversaciones cv join personas p on p.id=cv.persona_id
      join lateral (select texto, creado from mensajes m where m.persona_id=cv.persona_id and m.canal=cv.canal and m.entrante order by creado desc limit 1) lm on true
      where cv.cerrada='filtrado' order by lm.creado desc limit 200`);
    const nLeads = (await one(`select count(*)::int n from casos where fase='lead'`)).n;
    const por = r => r.cerrada_por === 'IA' ? 'la IA' : r.cerrada_por === 'Regla' ? 'el filtro automático' : esc(r.cerrada_por || '—');
    page(req, res, 'Filtrados', `${await encabezado('filtrados', nLeads, rows.length)}
    <p class=mut>Mensajes que no son consultas: reacciones a historias, reels, menciones, proveedores. No hace falta mirarlos. Si alguno sí era una consulta, tocá "Es consulta" y pasa a Leads.</p>
    <div class="card"><table>${rows.map(r => `<tr><td><b>${icono(r.canal)} ${esc(r.nombre)}</b>${r.instagram_user ? ` <span class=mut>@${esc(r.instagram_user)}</span>` : ''}<div class=mut>${esc((r.texto || '').slice(0, 140))}${r.n > 1 ? ` · ${r.n} mensajes` : ''}</div><div class=mut style="font-size:12px">${hora(r.ult_en)} · ${esc(MOTIVOS_FILTRO[r.motivo] || 'No es una consulta')} · lo filtró ${por(r)}</div></td>
      <td style="text-align:right"><div class=row style="justify-content:flex-end"><form method=post action=/conversacion/${r.id}/es-consulta><button>Es consulta</button></form>${BOTON_PERSONAL(r.persona_id)}</div></td></tr>`).join('') || '<tr><td class=mut>No hay nada filtrado.</td></tr>'}</table></div>`, '/leads');
  }));
  app.post('/conversacion/:id/es-consulta', wrap(async (req, res) => {
    const cv = await one('select * from conversaciones where id=$1', [req.params.id]); if (!cv) return res.redirect('/leads/filtrados');
    const caso = await crearLead(cv.persona_id, cv.canal, req.session.quien, 'Era una consulta: pasó de Filtrados a Leads.');
    res.redirect('/caso/' + caso);
  }));
  app.post('/caso/:id/no-es-consulta', wrap(async (req, res) => {
    await filtrarCaso(req.params.id, req.session.quien);
    res.redirect('/leads');
  }));
  // botón Filtrar de la ficha: elige el porqué
  app.post('/caso/:id/filtrar', wrap(async (req, res, next) => {
    const c = await one('select * from casos where id=$1', [req.params.id]); if (!c) return res.redirect('/leads');
    if (req.body.motivo === 'personal') { req.url = `/persona/${c.persona_id}/personal`; return next('route'); }
    await filtrarCaso(c.id, req.session.quien, MOTIVOS_FILTRO[req.body.motivo] ? req.body.motivo : 'no_consulta');
    res.redirect('/leads?filtrado=1');
  }));

  // ---- personal: Sol usa su número también para lo personal. Se marca una vez y ese contacto no vuelve a entrar ----
  app.post('/persona/:id/personal', wrap(async (req, res) => {
    const p = await one('select * from personas where id=$1', [req.params.id]); if (!p) return res.redirect('/leads');
    if (await one(`select 1 from casos where persona_id=$1 and fase in ('oportunidad','venta')`, [p.id])) return res.redirect(req.get('referer') || '/leads');
    await q('delete from mensajes where persona_id=$1', [p.id]);
    await q('delete from conversaciones where persona_id=$1', [p.id]);
    await q(`delete from casos where persona_id=$1 and fase in ('lead','baja') and not exists (select 1 from cotizaciones k where k.caso_id=casos.id and k.estado<>'borrador')`, [p.id]);
    await q(`update personas set personal=true, notas=null where id=$1`, [p.id]);
    res.redirect('/leads?personal=1');
  }));
  app.post('/persona/:id/no-personal', wrap(async (req, res) => {
    await q('update personas set personal=false where id=$1', [req.params.id]);
    res.redirect('/ajustes#personales');
  }));

  // ---- contestar desde la ficha (Instagram o WhatsApp, dentro de las 24 h) ----
  app.post('/caso/:id/responder', wrap(async (req, res) => {
    const texto = String(req.body.texto || '').trim();
    if (texto) {
      try { const por = await require('./canales').enviar(req.params.id, texto); await log(req.params.id, req.session.quien, 'Contestó por ' + por + ' desde el CRM.'); }
      catch (e) { await log(req.params.id, 'CRM', 'No se pudo mandar: ' + e.message); }
    }
    res.redirect('/caso/' + req.params.id + '#chat');
  }));
}

// una sola vez: a los leads viejos que siguen en Nuevo sin que nadie los toque, se les pasa el filtro de reglas
async function limpiarViejos() {
  if (await one("select 1 from ajustes where clave='migracion_filtro_2611'")) return;
  const cs = await q(`select c.id from casos c where c.fase='lead' and c.etapa='nuevo'
    and not exists (select 1 from mensajes m where m.caso_id=c.id and not m.entrante)
    and not exists (select 1 from actividad a where a.caso_id=c.id and a.quien in ('Patricia','Sol','Betina','Equipo'))
    and exists (select 1 from mensajes m where m.caso_id=c.id)`);
  for (const c of cs) {
    const ms = await q('select texto from mensajes where caso_id=$1 and entrante', [c.id]);
    if (ms.length && ms.every(m => esRuido(m.texto))) await filtrarCaso(c.id, 'Regla');
  }
  await q("insert into ajustes(clave,valor) values('migracion_filtro_2611', now()::text)");
}

module.exports = { esSaludo, saludar, saludoMandado, preguntoAlgo, BOTON_PERSONAL, BOTON_FILTRAR, MOTIVOS_FILTRO, tocar, esRuido, filtrarConversacion, filtrarCaso, crearLead, estadoChat, chipChat, sinContestar, rutas, encabezado, limpiarViejos, CANALES, ESTADOS, icono };
