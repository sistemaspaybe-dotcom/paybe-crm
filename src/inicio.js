// Inicio: qué hay que hacer hoy, en tres columnas (Contestar, Cotizar, Cobrar y seguir), con el botón de cada cosa a mano.
const { q, one } = require('./db');
const { FASES } = require('./flow');
const { esc, fecha, usd } = require('./views');
const conv = require('./conversaciones');

const CSS = `<style>
.hola{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.hola p{margin:4px 0 0;color:#5A6670}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.kpi{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:14px 16px;color:inherit;display:block;border-top:4px solid var(--c)}
.kpi:hover{box-shadow:0 4px 14px rgba(31,58,77,.08)}
.kpi .n{font:500 34px/1 Newsreader,Georgia,serif;color:var(--c)}.kpi .t{font-weight:700;margin-top:6px}.kpi .s{font-size:12px;color:#5A6670;margin-top:2px}
.embudo{display:flex;gap:4px;margin-top:10px}.embudo a{flex:1;min-width:0;border-radius:8px;padding:8px 6px;text-align:center;color:inherit;font-size:12px;line-height:1.2}
.embudo b{display:block;font-size:18px}.embudo a{overflow-wrap:anywhere;hyphens:auto}.embudo .cero{opacity:.45}
.fases{display:flex;gap:4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5A6670}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.col{background:#fff;border:1px solid var(--linea);border-radius:14px;overflow:hidden}
.col>h2{font-size:20px;padding:14px 16px 10px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #F0E6E1}
.col>h2 .num{font:700 13px Figtree,system-ui;background:var(--c);color:#fff;border-radius:999px;padding:2px 10px}
.it{padding:12px 16px;border-bottom:1px solid #F0E6E1;display:grid;gap:6px}.it:last-child{border-bottom:0}
.it .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.it .txt{font-size:13px;color:#5A6670;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.it .acc{display:flex;gap:6px;flex-wrap:wrap}.it .acc .btn,.it .acc button{padding:6px 12px;font-size:13px}
.t-rojo{color:#B84A53;font-weight:700;font-size:12px;white-space:nowrap}.t-amar{color:#8A5A00;font-weight:700;font-size:12px;white-space:nowrap}.t-ok{color:#5A6670;font-size:12px;white-space:nowrap}
.vacio{padding:22px 16px;text-align:center;color:#5A6670;font-size:14px}
.sub{font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5A6670;padding:10px 16px 0}
.dos{display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-top:14px;align-items:start}
.av{display:flex;gap:10px;align-items:center;padding:10px 16px;border-bottom:1px solid #F0E6E1}.av:last-child{border-bottom:0}
.av .q{flex:1;min-width:0}.av .acc{display:flex;gap:6px}.av button{padding:5px 10px;font-size:12px}
.dia{min-width:46px;text-align:center;border-radius:10px;padding:4px 0;font-weight:700;font-size:12px;line-height:1.1;background:#F3ECE9;color:#5A6670}
.dia.rojo{background:#FBE4E7;color:#B84A53}.dia.hoy{background:#FFF3D6;color:#8A5A00}.dia b{display:block;font-size:17px}
.hola2{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:6px}.hola2 span{color:#5A6670;font-size:17px}
.res{color:#5A6670;margin:0 0 18px}
.anillos{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
.an{background:#fff;border:1px solid var(--linea);border-radius:18px;padding:20px 24px}
.an .tit{display:flex;align-items:center;gap:10px}.an .tit h2{font:700 20px Figtree,system-ui}
.an .ico{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:var(--c);color:#fff}
.an .bajada{color:#5A6670;margin:4px 0 14px}
.an .cuerpo{display:grid;grid-template-columns:150px 1fr;align-items:center;gap:24px}
.dona{position:relative;width:150px;height:150px;flex:none}.dona svg{transform:rotate(-90deg)}
.dona .cen{position:absolute;inset:0;display:grid;place-content:center;text-align:center}.dona .cen b{font:700 38px/1 Figtree,system-ui}.dona .cen span{font-size:13px;color:#5A6670;margin-top:4px}
.pills{display:grid;gap:8px;justify-items:start}
.pill{display:inline-flex;align-items:baseline;gap:8px;line-height:1.3;padding:7px 14px;border-radius:10px;font-size:15px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,#fff)}
.pill::before{content:'';width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;align-self:center}.pill b{font-weight:800}.pill.cero{opacity:.45}
.pill:hover{background:color-mix(in srgb,var(--c) 20%,#fff)}
.pill{font-size:14px}
@media (max-width:900px){.anillos{grid-template-columns:1fr}.an .cuerpo{grid-template-columns:120px 1fr;gap:16px}.dona{width:120px;height:120px}.dona svg{width:120px;height:120px}.dona .cen b{font-size:30px}}
@media (max-width:900px){.kpis{grid-template-columns:repeat(2,1fr)}.cols,.dos{grid-template-columns:1fr}.embudo{overflow-x:auto;padding-bottom:4px}.embudo a{flex:0 0 76px;font-size:11px}.fases{display:none}.kpi .n{font-size:28px}}
</style>`;

const minDesde = d => (Date.now() - new Date(d)) / 60e3;
const espera = d => { const m = minDesde(d); return m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
// color según cuánto lleva esperando: más de 1 día rojo, más de 2 h amarillo
const tiempo = (d, rojoMin = 1440, amarMin = 120) => { const m = minDesde(d); return `<span class="${m > rojoMin ? 't-rojo' : m > amarMin ? 't-amar' : 't-ok'}">⏱ ${espera(d)}</span>`; };
const dias = d => Math.floor((Date.now() - new Date(d)) / 864e5);
const destinos = ds => (ds || []).filter(d => d && d.nombre).map(d => `<span class="chip">${esc(d.nombre)}</span>`).join(' ');
const hoyAR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const COLOR = { lead: ['#E3EEF5', '#2B5C7A'], oportunidad: ['#FBE9E6', '#B84A53'], venta: ['#E0F0E6', '#1E5A3A'] };
const RUTA = { lead: '/leads', oportunidad: '/oportunidades', venta: '/ventas' };

// anillo con un tramo por cada estado, y el total en el centro
function dona(segs, centro, etiqueta) {
  segs = segs.filter(x => !x.fuera);
  const r = 62, C = 2 * Math.PI * r, tot = segs.reduce((a, x) => a + x.n, 0), gap = segs.filter(x => x.n).length > 1 ? 4 : 0;
  let off = 0;
  const arcos = tot ? segs.filter(x => x.n).map(x => { const l = C * x.n / tot; const a = `<circle cx=75 cy=75 r=${r} fill=none stroke="${x.c}" stroke-width="24" stroke-dasharray="${Math.max(l - gap, 1)} ${C}" stroke-dashoffset="${-off}"/>`; off += l; return a; }).join('') : '';
  return `<div class="dona"><svg viewBox="0 0 150 150" width=150 height=150><circle cx=75 cy=75 r=${r} fill=none stroke="#F3ECE9" stroke-width="24"/>${arcos}</svg><div class="cen"><b>${centro}</b><span>${etiqueta}</span></div></div>`;
}
const pills = (segs, href) => `<div class="pills">${segs.map(x => `<a class="pill ${x.n ? '' : 'cero'}" style="--c:${x.c}" href="${x.href || href}"><b>${x.n}</b> ${x.t}</a>`).join('')}</div>`;
const tarjeta = (color, ico, titulo, bajada, segs, centro, etiqueta, href) => `<section class="an" style="--c:${color}"><div class="tit"><span class="ico">${ico}</span><h2>${titulo}</h2></div><p class="bajada">${bajada}</p><div class="cuerpo">${dona(segs, centro, etiqueta)}${pills(segs, href)}</div></section>`;

module.exports = (app, { wrap, page }) => {
  app.get('/', wrap(async (req, res) => {
    const hoy = hoyAR();
    const DESTS = `(select json_agg(json_build_object('id',d.id,'nombre',d.nombre,'estado',d.estado) order by d.id) from destinos d where d.caso_id=c.id and d.estado<>'descartado') dests`;
    const [chats, cotizar, cobrar, avisos, etapas, salidas] = await Promise.all([
      conv.sinContestar(),
      q(`select c.*, p.nombre, ${DESTS} from casos c join personas p on p.id=c.persona_id
         where c.fase='lead' and (c.etapa in ('para_cotizar','cotizando','recotizar') or c.borrador is not null)
         order by c.borrador is null, c.actualizado limit 30`),
      q(`select c.*, p.nombre, ${DESTS},
           (select max(creado) from mensajes m where m.caso_id=c.id and not m.entrante) ult_nuestro
         from casos c join personas p on p.id=c.persona_id
         where (c.fase='oportunidad' and c.etapa in ('le_intereso','falta_sena','sena_pagada'))
            or (c.fase='venta' and c.etapa in ('reservando','saldo'))
            or (c.fase='lead' and c.etapa='esperando' and c.actualizado < now() - interval '3 days')
         order by c.actualizado limit 30`),
      q(`select a.*, p.nombre, c.id caso from avisos a join casos c on c.id=a.caso_id join personas p on p.id=c.persona_id
         where not a.hecho order by a.para limit 30`),
      q(`select fase, etapa, count(*)::int n, coalesce(sum(total),0)::float total from casos where fase<>'baja' group by 1,2`),
      q(`select c.id, c.sale, c.destino, c.cuantos, p.nombre, ${DESTS} from casos c join personas p on p.id=c.persona_id
         where c.fase='venta' and c.sale between current_date and current_date + 30 order by c.sale limit 8`),
    ]);
    const n = (f, e) => etapas.filter(r => r.fase === f && (!e || [].concat(e).includes(r.etapa))).reduce((s, r) => s + r.n, 0);
    const porCobrar = etapas.filter(r => (r.fase === 'oportunidad' && r.etapa !== 'sena_pagada') || (r.fase === 'venta' && r.etapa === 'saldo')).reduce((s, r) => s + r.total, 0);
    const vencidos = avisos.filter(a => String(a.para.toISOString?.().slice(0, 10) || a.para) < hoy).length;
    const chatsViejos = chats.filter(m => minDesde(m.ult_en) > 1440).length;

    // ---- arriba: saludo y números ----
    const quien = req.session.quien && req.session.quien !== 'Equipo' ? req.session.quien : '';
    const fechaLarga = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
    const pendientes = chats.length + cotizar.length + cobrar.length;
    const resumen = pendientes ? `Hay ${pendientes} cosas para mover hoy${chatsViejos ? `; ${chatsViejos === 1 ? '1 chat espera' : chatsViejos + ' chats esperan'} hace más de un día` : ''}.` : 'Está todo al día. 🙌';
    const R = '#C24B55', A = '#B7791F', AZ = '#2B5C7A', V = '#2F7A50', G = '#8A97A3';
    const mChats = chats.map(m => minDesde(m.ult_en));
    const hoyAv = avisos.filter(a => String(a.para.toISOString?.().slice(0, 10) || a.para) === hoy).length;
    const anillos = `<div class="anillos">
      ${tarjeta(R, '💬', 'Chats', 'Mensajes de clientes que esperan respuesta', [
        { n: mChats.filter(x => x > 1440).length, t: 'esperan hace más de 1 día', c: R },
        { n: mChats.filter(x => x > 120 && x <= 1440).length, t: 'esperan hace más de 2 h', c: A },
        { n: mChats.filter(x => x <= 120).length, t: 'recién llegados', c: AZ }], chats.length, 'sin contestar', '#contestar')}
      ${tarjeta(AZ, '✈️', 'Cotizaciones', 'Lo que hay que cotizar o mandarle al cliente', [
        { n: cotizar.filter(c => c.borrador).length, t: 'mensajes listos para mandar', c: R },
        { n: cotizar.filter(c => !c.borrador && c.etapa === 'para_cotizar').length, t: 'para cotizar', c: AZ },
        { n: cotizar.filter(c => !c.borrador && c.etapa === 'recotizar').length, t: 'para recotizar', c: A },
        { n: cotizar.filter(c => !c.borrador && c.etapa === 'cotizando').length, t: 'cotizándose ahora', c: G },
        { n: n('lead', 'esperando'), t: 'esperando respuesta del cliente', c: V, href: '/leads', fuera: true }], cotizar.length, 'para hacer', '#cotizar')}
      ${tarjeta(V, '💰', 'Cobros', porCobrar ? usd(Math.round(porCobrar)) + ' por cobrar entre señas y saldos' : 'Señas y saldos pendientes', [
        { n: n('oportunidad', 'le_intereso'), t: 'mandar datos de la seña', c: R },
        { n: n('oportunidad', 'falta_sena'), t: 'falta la seña', c: A },
        { n: n('oportunidad', 'sena_pagada'), t: 'seña pagada: pasar a Venta', c: AZ },
        { n: n('venta', 'saldo'), t: 'falta el saldo', c: V }], n('oportunidad') + n('venta', 'saldo'), 'por cobrar', '#cobrar')}
      ${tarjeta(A, '🔔', 'Recordatorios', `${salidas.length ? salidas.length + ' salida' + (salidas.length > 1 ? 's' : '') + ' en los próximos 30 días' : 'Avisos que dejó el equipo o el sistema'}`, [
        { n: vencidos, t: 'vencidos', c: R },
        { n: hoyAv, t: 'para hoy', c: A },
        { n: avisos.length - vencidos - hoyAv, t: 'próximos', c: AZ }], vencidos + hoyAv, 'para hoy', '#recordatorios')}
    </div>`;

    // ---- columna 1: contestar ----
    const colChats = chats.map(m => `<div class="it"><div class="top"><b>${conv.icono(m.canal)} ${esc(m.nombre)}</b>${tiempo(m.ult_en)}</div>
      <div class="txt">“${esc((m.ult_texto || '').slice(0, 160))}”</div>
      <div class="acc"><a class="btn p" href="${m.caso_id ? '/caso/' + m.caso_id + '#chat' : '/leads'}">Responder</a></div></div>`).join('');

    // ---- columna 2: cotizar (primero los mensajes armados para mandar) ----
    const paraCotizar = d => (d || []).find(x => ['pendiente', 'semaforo', 'cotizando'].includes(x.estado));
    const itCot = c => {
      const d = paraCotizar(c.dests);
      const etiqueta = c.borrador ? '✎ Mensaje listo para mandar' : FASES.lead.etapas[c.etapa];
      const boton = c.borrador ? `<a class="btn p" href="/caso/${c.id}">Revisar y mandar</a>`
        : c.etapa === 'cotizando' ? `<a class="btn" href="${d ? '/destino/' + d.id + '/cotizar' : '/caso/' + c.id}">Seguir cotizando${c.cotizando_por ? ' (' + esc(c.cotizando_por) + ')' : ''}</a>`
        : `<a class="btn p" href="${d ? '/destino/' + d.id + '/cotizar' : '/caso/' + c.id}">${c.etapa === 'recotizar' ? 'Recotizar' : 'Cotizar'}</a>`;
      return `<div class="it"><div class="top"><a href="/caso/${c.id}"><b>${esc(c.nombre)}</b></a>${tiempo(c.borrador_en || c.actualizado, 2880, 1440)}</div>
        <div>${destinos(c.dests) || `<span class=mut>${esc(c.destino || '')}</span>`}</div>
        <div class="mut">${esc(etiqueta)}${c.cuantos ? ' · ' + esc(c.cuantos) : ''}</div><div class="acc">${boton}</div></div>`;
    };
    const colCot = cotizar.map(itCot).join('');

    // ---- columna 3: cobrar y hacer seguimiento ----
    const itCob = c => {
      let estado, boton;
      if (c.etapa === 'le_intereso') { estado = '🎉 Dijo que sí: mandarle los datos de la seña'; boton = `<form method=post action=/caso/${c.id}/datos_sena><button class="p">Ya le mandé los datos</button></form>`; }
      else if (c.etapa === 'falta_sena') { const d = dias(c.datos_sena_en || c.actualizado); estado = `Falta la seña · le mandamos los datos hace ${d} d`; boton = `<a class="btn g" href="/caso/${c.id}">Llegó la seña</a>${d >= 3 ? `<a class="btn" href="/caso/${c.id}#chat">Preguntarle</a>` : ''}`; }
      else if (c.etapa === 'sena_pagada') { estado = 'Seña pagada: pasar a Venta y reservar'; boton = `<form method=post action=/caso/${c.id}/a_venta><button class="g">Pasar a Venta</button></form>`; }
      else if (c.etapa === 'reservando') { estado = 'Reservando'; boton = `<a class="btn" href="/caso/${c.id}">Ver reservas</a>`; }
      else if (c.etapa === 'saldo') { estado = `Falta el saldo${c.sale ? ' · viajan el ' + fecha(c.sale) : ''}`; boton = `<a class="btn g" href="/caso/${c.id}">Llegó el saldo</a>`; }
      else { estado = `Le mandamos la cotización hace ${dias(c.actualizado)} d y no contestó`; boton = `<a class="btn" href="/caso/${c.id}#chat">Hacer seguimiento</a>`; }
      return `<div class="it"><div class="top"><a href="/caso/${c.id}"><b>${esc(c.nombre)}</b></a>${c.total ? `<b style="font-size:13px">${usd(Math.round(c.total))}</b>` : ''}</div>
        <div>${destinos(c.dests) || `<span class=mut>${esc(c.destino || '')}</span>`}</div><div class="mut">${estado}</div><div class="acc">${boton}</div></div>`;
    };
    const colCob = cobrar.map(itCob).join('');

    const col = (id, color, titulo, items, total, vacio) => `<section class="col" id="${id}" style="--c:${color}"><h2>${titulo}<span class="num">${total}</span></h2>${items || `<div class="vacio">${vacio}</div>`}</section>`;
    const cols = `<div class="cols">
      ${col('contestar', '#B84A53', '💬 Contestar', colChats, chats.length, 'No hay chats esperando. ✓')}
      ${col('cotizar', '#2B5C7A', '✈️ Cotizar', colCot, cotizar.length, 'Nada para cotizar. ✓')}
      ${col('cobrar', '#1E5A3A', '💰 Cobrar y seguir', colCob, cobrar.length, 'Nada pendiente de cobro. ✓')}</div>`;

    // ---- abajo: recordatorios y próximas salidas ----
    const itAv = a => {
      const f = String(a.para.toISOString?.().slice(0, 10) || a.para), cls = f < hoy ? 'rojo' : f === hoy ? 'hoy' : '';
      const d = new Date(f + 'T12:00:00');
      return `<div class="av"><div class="dia ${cls}"><b>${d.getDate()}</b>${d.toLocaleDateString('es-AR', { month: 'short' })}</div>
        <div class="q"><a href="/caso/${a.caso}"><b>${esc(a.nombre)}</b></a><div class="mut">${esc(a.texto)}${cls === 'rojo' ? ' · <b style="color:#B84A53">vencido</b>' : ''}</div></div>
        <div class="acc"><form method=post action=/aviso/${a.id}/posponer><button title="Pasarlo a mañana">Mañana</button></form><form method=post action=/aviso/${a.id}/hecho><button class="g">Listo</button></form></div></div>`;
    };
    const itSal = s => { const d = Math.ceil((new Date(s.sale) - new Date(hoy)) / 864e5); return `<div class="av"><div class="dia ${d <= 7 ? 'hoy' : ''}"><b>${d}</b>días</div><div class="q"><a href="/caso/${s.id}"><b>${esc(s.nombre)}</b></a><div class="mut">${(s.dests || []).map(x => esc(x.nombre)).join(' + ') || esc(s.destino || '')} · sale el ${fecha(s.sale)}</div></div></div>`; };
    const abajo = `<div class="dos">
      <section class="col" id="recordatorios"><h2>🔔 Recordatorios${vencidos ? `<span class="num" style="background:#B84A53">${vencidos} vencido${vencidos > 1 ? 's' : ''}</span>` : ''}</h2>${avisos.map(itAv).join('') || '<div class="vacio">No hay recordatorios. ✓</div>'}</section>
      <section class="col"><h2>🧳 Próximas salidas</h2>${salidas.map(itSal).join('') || '<div class="vacio">Nadie sale en los próximos 30 días.</div>'}</section></div>`;

    const fechaAnio = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).replace(',', '');
    page(req, res, 'Inicio', `${CSS}<div class="hola2"><h1>${quien ? 'Hola, ' + esc(quien) : 'Hola'}</h1><span>${fechaAnio.charAt(0).toUpperCase() + fechaAnio.slice(1)}</span></div><p class="res">${resumen}</p>
      ${anillos}${cols}${abajo}`, '/');
  }));
  // pasar un recordatorio a mañana
  app.post('/aviso/:id/posponer', wrap(async (req, res) => {
    await q(`update avisos set para=(now() at time zone 'America/Argentina/Buenos_Aires')::date + 1 where id=$1`, [req.params.id]);
    res.redirect(req.get('referer') || '/');
  }));
};
