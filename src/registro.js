// Registro de todo lo que pasa en el CRM.
// - log_acciones: cada cosa que el equipo manda desde la app (quién, qué pantalla, qué cargó, cuándo).
// - log_cambios: cada fila que se crea, cambia o borra en cualquier tabla (lo llenan triggers de Postgres, ver db.js),
//   con el antes/después y quién lo hizo. Ninguna de las dos se puede editar ni borrar.
const crypto = require('crypto');
const { pool, q, contexto } = require('./db');
const { esc } = require('./views');

const SECRETO = /pass|token|secret|clave_api|api_key/i;
const ARCHIVO = /_b64$|^datos$/i;
// lo que se cargó en el formulario, sin contraseñas ni archivos (los archivos quedan en su tabla)
function limpiar(body) {
  if (!body || typeof body !== 'object') return null;
  const o = {};
  for (const [k, v] of Object.entries(body)) {
    if (SECRETO.test(k)) o[k] = '[oculto]';
    else if (ARCHIVO.test(k)) o[k] = v ? `[archivo: ${Math.round(String(v).length * 0.75 / 1024)} KB]` : '';
    else if (typeof v === 'string' && v.length > 20000) o[k] = v.slice(0, 20000) + `… [${v.length} caracteres]`;
    else o[k] = v;
  }
  return Object.keys(o).length ? o : null;
}

const guardar = a => pool.query(
  'insert into log_acciones(req,quien,origen,metodo,ruta,datos,estado,ms,ip,navegador) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [a.req, a.quien, a.origen, a.metodo, a.ruta, a.datos ? JSON.stringify(a.datos) : null, a.estado, a.ms, a.ip, a.navegador]
).catch(e => console.error('Registro:', e.message));

// Va después de leer el formulario: arma el contexto que usan los triggers y anota la acción al terminar.
function middleware(req, res, next) {
  const store = { req: crypto.randomUUID(), origen: 'página pública', quien: null, ruta: `${req.method} ${req.path}` };
  const t0 = Date.now();
  res.on('finish', () => {
    // se anota todo lo que no es solo mirar; las vistas de páginas del equipo también, sin datos
    if (req.path === '/entrar') return; // los intentos de entrar se anotan aparte, sin contraseña
    const mira = req.method === 'GET' || req.method === 'HEAD';
    if (mira && (!store.quien || /^\/(salud|logo|favicon|registro\/datos)/.test(req.path) || res.statusCode >= 300)) return;
    guardar({ ...store, metodo: req.method, ruta: req.originalUrl.slice(0, 500), datos: mira ? null : limpiar(req.body),
      estado: res.statusCode, ms: Date.now() - t0, ip: req.ip, navegador: String(req.get('user-agent') || '').slice(0, 300) });
  });
  contexto.run(store, next);
}
// cuando ya se sabe quién es (después del login)
function identificar(req, res, next) {
  const s = contexto.getStore();
  if (s) { s.quien = req.session.quien || null; s.origen = 'equipo'; }
  next();
}
// webhooks y tareas automáticas: corren con su propio origen
const como = (origen, f) => (...args) => contexto.run({ req: crypto.randomUUID(), origen, quien: null, ruta: origen }, () => f(...args));
// intentos de entrar (sin la contraseña)
const entrada = (req, ok) => guardar({ req: contexto.getStore()?.req, quien: String(req.body?.quien || '').slice(0, 40), origen: 'login',
  metodo: 'POST', ruta: '/entrar', datos: { resultado: ok ? 'entró' : 'contraseña incorrecta' }, estado: ok ? 302 : 401, ms: 0, ip: req.ip,
  navegador: String(req.get('user-agent') || '').slice(0, 300) });

// ---------- pantalla /registro ----------
const OP = { insert: ['Creó', '#E0F0E6', '#1E5A3A'], update: ['Cambió', '#E3EEF5', '#2B5C7A'], delete: ['Borró', '#FBE4E7', '#B84A53'] };
const TABLAS = { casos: 'Consulta', personas: 'Persona', mensajes: 'Mensaje', cotizaciones: 'Cotización', destinos: 'Destino', avisos: 'Aviso', pagos: 'Pago',
  reservas: 'Reserva', actividad: 'Actividad', chats: 'Chat', documentos: 'Documento', comprobantes: 'Comprobante', conversaciones: 'Conversación',
  caso_pasajeros: 'Pasajero', ajustes: 'Ajuste' };
const hora = d => new Date(d).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const corto = v => { const s = v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v); return s.length > 140 ? s.slice(0, 140) + '…' : s; };
const detalle = r => {
  if (r.cambios) return Object.entries(r.cambios).map(([k, v]) => `<div><b>${esc(k)}</b>: <s class=mut>${esc(corto(v.antes))}</s> → ${esc(corto(v.despues))}</div>`).join('');
  const o = r.despues || r.antes || {};
  return Object.entries(o).filter(([k, v]) => v != null && v !== '' && !['id', 'creado', 'creada', 'actualizado'].includes(k)).slice(0, 8)
    .map(([k, v]) => `<span class=mut>${esc(k)}:</span> ${esc(corto(v))}`).join(' · ');
};

function filtros(qs) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (qs.quien) add(qs.quien === 'automático' ? "(quien is null and ?::text is not null)" : 'quien = ?', qs.quien);
  if (qs.tabla) add('tabla = ?', qs.tabla);
  if (qs.caso) add('caso_id = ?', Number(qs.caso) || 0);
  if (qs.persona) add('persona_id = ?', Number(qs.persona) || 0);
  if (qs.desde) add('en >= ?::date', qs.desde);
  if (qs.hasta) add("en < ?::date + 1", qs.hasta);
  return { where: w.length ? 'where ' + w.join(' and ') : '', p };
}

function rutas(app, { wrap, page }) {
  app.get('/registro', wrap(async (req, res) => {
    const qs = req.query, ver = qs.ver === 'acciones' ? 'acciones' : 'cambios';
    const { where, p } = filtros(qs);
    let body;
    if (ver === 'cambios') {
      const rows = await q(`select * from log_cambios ${where} order by en desc, id desc limit 300`, p);
      body = `<table><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr>${rows.map(r => { const o = OP[r.op] || [r.op, '#EEE', '#555'];
        return `<tr><td class=mut style="white-space:nowrap">${hora(r.en)}</td><td><b>${esc(r.quien || '')}</b><div class=mut>${esc(r.origen || '')}</div></td>
        <td style="white-space:nowrap"><span class=chip style="background:${o[1]};color:${o[2]}">${o[0]}</span> ${esc(TABLAS[r.tabla] || r.tabla)} #${esc(r.fila_id)}
        ${r.caso_id ? `<div><a href="/caso/${r.caso_id}">consulta ${r.caso_id}</a> · <a href="/registro?caso=${r.caso_id}">su historial</a></div>` : ''}</td>
        <td style="font-size:13px">${detalle(r)}${r.ruta ? `<div class=mut style="font-size:11px">${esc(r.ruta)}</div>` : ''}</td></tr>`; }).join('') || '<tr><td class=mut>No hay nada con esos filtros.</td></tr>'}</table>`;
    } else {
      const w = [], pp = [];
      if (qs.quien) { pp.push(qs.quien); w.push('quien = $' + pp.length); }
      if (qs.desde) { pp.push(qs.desde); w.push('en >= $' + pp.length + '::date'); }
      if (qs.hasta) { pp.push(qs.hasta); w.push('en < $' + pp.length + '::date + 1'); }
      const rows = await q(`select * from log_acciones ${w.length ? 'where ' + w.join(' and ') : ''} order by en desc, id desc limit 300`, pp);
      body = `<table><tr><th>Cuándo</th><th>Quién</th><th>Qué hizo</th><th>Qué cargó</th></tr>${rows.map(r => `<tr><td class=mut style="white-space:nowrap">${hora(r.en)}</td>
        <td><b>${esc(r.quien || '')}</b><div class=mut>${esc(r.origen || '')}</div></td><td><code>${esc(r.metodo)} ${esc(r.ruta)}</code><div class=mut>${r.estado} · ${r.ms} ms</div></td>
        <td style="font-size:13px">${r.datos ? Object.entries(r.datos).filter(([, v]) => v !== '').map(([k, v]) => `<span class=mut>${esc(k)}:</span> ${esc(corto(v))}`).join(' · ') : ''}</td></tr>`).join('') || '<tr><td class=mut>No hay nada con esos filtros.</td></tr>'}</table>`;
    }
    const sel = (n, ops, v) => `<select name=${n}><option value="">${n === 'quien' ? 'Todos' : 'Todo'}</option>${ops.map(([k, t]) => `<option value="${esc(k)}"${v === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const link = Object.entries({ ...qs, ver: undefined }).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    page(req, res, 'Registro', `<h1>Registro</h1><p class=mut>Todo lo que se carga, cambia o borra en el CRM, con quién lo hizo y cuándo. No se puede editar ni borrar.</p>
    <div class="row" style="margin:10px 0"><a class="btn${ver === 'cambios' ? ' p' : ''}" href="/registro?${link}">Cambios en los datos</a><a class="btn${ver === 'acciones' ? ' p' : ''}" href="/registro?ver=acciones&${link}">Acciones en la app</a>
    <span class=sp style="flex:1"></span><a class=btn href="/registro/datos.csv?ver=${ver}&${link}">Descargar CSV</a></div>
    <form class="card f" method=get action=/registro><input type=hidden name=ver value=${ver}>
    <div><label>Quién</label>${sel('quien', [['Patricia', 'Patricia'], ['Sol', 'Sol'], ['Betina', 'Betina'], ['Equipo', 'Equipo'], ['automático', 'Automático (IA, Instagram, WhatsApp)']], qs.quien)}</div>
    ${ver === 'cambios' ? `<div><label>Qué</label>${sel('tabla', Object.entries(TABLAS), qs.tabla)}</div><div><label>Consulta #</label><input name=caso value="${esc(qs.caso || '')}"></div>` : ''}
    <div><label>Desde</label><input type=date name=desde value="${esc(qs.desde || '')}"></div><div><label>Hasta</label><input type=date name=hasta value="${esc(qs.hasta || '')}"></div>
    <div style="align-self:end"><button class=p>Filtrar</button></div></form>
    <div class="card" style="overflow-x:auto">${body}<p class=mut>Se muestran los últimos 300. El CSV trae hasta 50.000.</p></div>`, '/ajustes');
  }));
  app.get('/registro/datos.csv', wrap(async (req, res) => {
    const qs = req.query, cel = v => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return '"' + s.replace(/"/g, '""') + '"'; };
    let rows, cols;
    if (qs.ver === 'acciones') {
      rows = await q('select * from log_acciones order by en desc limit 50000'); cols = ['en', 'quien', 'origen', 'metodo', 'ruta', 'datos', 'estado', 'ms', 'ip'];
      if (qs.quien) rows = rows.filter(r => r.quien === qs.quien);
    } else {
      const { where, p } = filtros(qs);
      rows = await q(`select * from log_cambios ${where} order by en desc limit 50000`, p); cols = ['en', 'quien', 'origen', 'tabla', 'op', 'fila_id', 'caso_id', 'persona_id', 'cambios', 'antes', 'despues', 'ruta'];
    }
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="registro-${qs.ver === 'acciones' ? 'acciones' : 'cambios'}.csv"`);
    res.send('﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cel(c === 'en' ? new Date(r.en).toISOString() : r[c])).join(','))].join('\n'));
  }));
}

module.exports = { middleware, identificar, como, entrada, rutas };
