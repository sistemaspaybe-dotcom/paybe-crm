// Lo que pasa solo después del "sí" (weekly con Sol, 24/11):
// - Seña que no llega: el día después de que vence la tarifa, queda armado UN mensaje; al mandarlo, la consulta se cierra (27/11).
// - Saldo: 2 meses antes de la salida, aviso + mensaje ("queda el último mes"); 1 mes antes, otro ("sin pago se pierden las reservas").
// Si el cliente contestó por WhatsApp y no quedó en el CRM, cuenta como que no contestó (deja de pasar cuando WhatsApp esté conectado).
const { q, one } = require('./db');
const reglas = require('./reglas');

const ESPERA_SENA_DIAS = 3;
const anotar = (casoId, texto) => q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, 'CRM', texto]);

async function revisarSena() {
  const M = await reglas.mensajes();
  // 3.2 · venció la tarifa de la cotización aceptada y la seña no llegó: queda armado el mensaje; al mandarlo, se cierra
  const rs = await q(`select c.id, c.destino, p.nombre, d.nombre dnombre from casos c join personas p on p.id=c.persona_id
    join lateral (select * from cotizaciones where caso_id=c.id and estado='aceptada' order by id desc limit 1) k on true
    left join destinos d on d.id=k.destino_id
    where c.fase='oportunidad' and c.etapa in ('le_intereso','falta_sena') and c.borrador is null
      and k.valida_hasta < (now() at time zone 'America/Argentina/Buenos_Aires')::date
      and not exists (select 1 from pagos g where g.caso_id=c.id and g.que='Seña')
      and not exists (select 1 from actividad a where a.caso_id=c.id and a.texto like '3.2%')`);
  for (const r of rs) {
    const texto = reglas.completar(M.sena, { nombre: reglas.primerNombre(r.nombre), destino: r.dnombre || r.destino || 'el viaje' });
    await q(`update casos set borrador=$1, borrador_tipo='sena', borrador_en=now(), sena_seguimiento_en=now() where id=$2`, [texto, r.id]);
    await q(`insert into avisos(caso_id,para,texto) values($1,current_date,$2)`, [r.id, 'Venció la tarifa y no llegó la seña: mandarle el mensaje y se cierra']);
    await anotar(r.id, '3.2 · Venció la tarifa sin seña: quedó armado el mensaje. Al mandarlo, la consulta se cierra.');
  }
}

async function revisarSaldos() {
  const M = await reglas.mensajes();
  const rs = await q(`select c.id, c.destino, c.sale, p.nombre, (c.sale - current_date) faltan,
      exists (select 1 from actividad a where a.caso_id=c.id and a.texto like 'Saldo 2 meses%') hecho60,
      exists (select 1 from actividad a where a.caso_id=c.id and a.texto like 'Saldo 1 mes%') hecho30
    from casos c join personas p on p.id=c.persona_id
    where c.fase='venta' and c.etapa in ('pedir_docs','docs','reservando','saldo') and c.sale is not null and c.sale - current_date <= 60 and c.sale >= current_date`);
  for (const r of rs) {
    const v = { nombre: reglas.primerNombre(r.nombre), destino: r.destino || 'el viaje', saldo_hasta: reglas.saldoHasta(r.sale) };
    if (r.faltan <= 30 && !r.hecho30) {
      await q(`update casos set borrador=$1, borrador_tipo='saldo', borrador_en=now() where id=$2`, [reglas.completar(M.saldo_30, v), r.id]);
      await q(`insert into avisos(caso_id,para,texto) values($1,current_date,$2)`, [r.id, 'Falta 1 mes: vence el saldo (sin pago se pierden las reservas)']);
      await anotar(r.id, 'Saldo 1 mes antes: se armó el aviso y el mensaje.' + (r.hecho60 ? '' : ' (Saldo 2 meses ya pasado.)'));
    } else if (r.faltan > 30 && !r.hecho60) {
      await q(`update casos set borrador=$1, borrador_tipo='saldo', borrador_en=now() where id=$2`, [reglas.completar(M.saldo_60, v), r.id]);
      await q(`insert into avisos(caso_id,para,texto) values($1,current_date,$2)`, [r.id, 'Faltan 2 meses: recordarle el saldo (queda el último mes)']);
      await anotar(r.id, 'Saldo 2 meses antes: se armó el aviso y el mensaje.');
    }
  }
}

const revisar = () => revisarSena().then(revisarSaldos);
module.exports = { revisar, revisarSena, revisarSaldos, ESPERA_SENA_DIAS };
