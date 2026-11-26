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
    const kpi = (c, num, t, s, href) => `<a class="kpi" href="${href}" style="--c:${c}"><div class="n">${num}</div><div class="t">${t}</div><div class="s">${s}</div></a>`;
    const kpis = `<div class="kpis">
      ${kpi('#B84A53', chats.length, 'Para contestar', chatsViejos ? `${chatsViejos} hace más de 1 día` : 'chats que esperan respuesta', '#contestar')}
      ${kpi('#2B5C7A', cotizar.length, 'Para cotizar o mandar', `${cotizar.filter(c => c.borrador).length} mensajes listos · ${n('lead', 'cotizando')} cotizándose`, '#cotizar')}
      ${kpi('#8A5A00', n('lead', 'esperando'), 'Esperando al cliente', 'cotizaciones mandadas', '/leads')}
      ${kpi('#1E5A3A', porCobrar ? usd(Math.round(porCobrar)) : n('oportunidad') + n('venta', 'saldo'), 'Por cobrar', `${n('oportunidad', ['le_intereso', 'falta_sena'])} seña${n('oportunidad', ['le_intereso', 'falta_sena']) === 1 ? '' : 's'} y ${n('venta', 'saldo')} saldo${n('venta', 'saldo') === 1 ? '' : 's'}`, '#cobrar')}
    </div>`;

    // ---- embudo: cuántos hay en cada etapa, tocás y vas a la lista ----
    const embudo = `<div class="card" style="padding:14px 16px"><div class="fases">${['lead', 'oportunidad', 'venta'].map(f => `<span style="flex:${Object.keys(FASES[f].etapas).length}">${FASES[f].nombre}s · ${n(f)}</span>`).join('')}</div>
      <div class="embudo">${['lead', 'oportunidad', 'venta'].flatMap(f => Object.entries(FASES[f].etapas).map(([e, t]) => { const k = n(f, e); return `<a href="${RUTA[f]}" class="${k ? '' : 'cero'}" style="background:${COLOR[f][0]};color:${COLOR[f][1]}" title="${esc(t)}"><b>${k}</b>${esc(t)}</a>`; })).join('')}</div></div>`;

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
      <section class="col"><h2>🔔 Recordatorios${vencidos ? `<span class="num" style="background:#B84A53">${vencidos} vencido${vencidos > 1 ? 's' : ''}</span>` : ''}</h2>${avisos.map(itAv).join('') || '<div class="vacio">No hay recordatorios. ✓</div>'}</section>
      <section class="col"><h2>🧳 Próximas salidas</h2>${salidas.map(itSal).join('') || '<div class="vacio">Nadie sale en los próximos 30 días.</div>'}</section></div>`;

    page(req, res, 'Inicio', `${CSS}<div class="hola"><div><h1>${quien ? 'Hola, ' + esc(quien) : 'Lo de hoy'}</h1><p>${fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)} · ${resumen}</p></div></div>
      ${kpis}${embudo}${cols}${abajo}`, '/');
  }));
  // pasar un recordatorio a mañana
  app.post('/aviso/:id/posponer', wrap(async (req, res) => {
    await q(`update avisos set para=(now() at time zone 'America/Argentina/Buenos_Aires')::date + 1 where id=$1`, [req.params.id]);
    res.redirect(req.get('referer') || '/');
  }));
};
