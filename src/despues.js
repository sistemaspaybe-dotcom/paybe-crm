// Lo que pasa solo después del "sí" (weekly con Sol, 24/11):
// - Seña que no llega: a los 3 días de mandar los datos, UN mensaje preguntando si sigue. Si no contesta en 3 días más, pasa a Perdido.
// - Saldo: 2 meses antes de la salida, aviso + mensaje ("queda el último mes"); 1 mes antes, otro ("sin pago se pierden las reservas").
// Si el cliente contestó por WhatsApp y no quedó en el CRM, cuenta como que no contestó (deja de pasar cuando WhatsApp esté conectado).
const { q, one } = require('./db');
const reglas = require('./reglas');

const ESPERA_SENA_DIAS = 3;
const anotar = (casoId, texto) => q('insert into actividad(caso_id,quien,texto) values($1,$2,$3)', [casoId, 'CRM', texto]);

async function revisarSena() {
  const M = await reglas.mensajes();
  // 1 · pasaron 3 días desde los datos de la seña: se arma el mensaje (una sola vez)
  const rs = await q(`select c.id, c.destino, p.nombre from casos c join personas p on p.id=c.persona_id
    where c.fase='oportunidad' and c.etapa='falta_sena' and c.sena_seguimiento_en is null and c.borrador is null
      and c.datos_sena_en < now() - make_interval(days => $1)`, [ESPERA_SENA_DIAS]);
  for (const r of rs) {
    const texto = reglas.completar(M.sena, { nombre: reglas.primerNombre(r.nombre), destino: r.destino || 'el viaje' });
    await q(`update casos set borrador=$1, borrador_tipo='sena', borrador_en=now(), sena_seguimiento_en=now() where id=$2`, [texto, r.id]);
    await q(`insert into avisos(caso_id,para,texto) values($1,current_date,$2)`, [r.id, 'La seña no llegó: mandarle el mensaje (una sola vez)']);
    await anotar(r.id, `Pasaron ${ESPERA_SENA_DIAS} días sin la seña: se armó un mensaje para preguntarle si sigue.`);
  }
  // 2 · 3 días más sin respuesta: Perdido, sin insistir
  const sin = await q(`select c.id from casos c where c.fase='oportunidad' and c.etapa='falta_sena'
      and c.sena_seguimiento_en < now() - make_interval(days => $1)
      and not exists (select 1 from mensajes m where m.caso_id=c.id and m.entrante and m.creado > c.sena_seguimiento_en)`, [ESPERA_SENA_DIAS]);
  for (const s of sin) {
    await q(`update casos set fase='baja', etapa='baja', baja_desde='oportunidad', motivo_baja='No contestó más', borrador=null, borrador_tipo=null, actualizado=now() where id=$1`, [s.id]);
    await q('update avisos set hecho=true where caso_id=$1', [s.id]);
    await anotar(s.id, `No pagó la seña ni contestó en ${ESPERA_SENA_DIAS} días después del mensaje: pasa a Perdido.`);
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
    const v = { nombre: reglas.primerNombre(r.nombre), destino: r.destino || 'el viaje' };
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
