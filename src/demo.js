// Consultas de prueba para mostrar el CRM sin créditos de IA: carga lo que la IA haría (preguntas,
// destinos, semáforo, cotizaciones) con personas marcadas como origen 'Demo'. Se borran con un botón.
const crypto = require('crypto');
const { q, one } = require('./db');
const ia = require('./ia');

const tok = () => crypto.randomBytes(12).toString('hex');
const hace = h => new Date(Date.now() - h * 3600e3);
let n = 0;

async function persona(nombre, user) {
  return one(`insert into personas(nombre,origen,instagram_id,instagram_user,notas) values($1,'Demo',$2,$3,'Consulta de prueba para mostrar el CRM') returning *`, [nombre, 'demo-' + user + '-' + Date.now(), user]);
}
async function caso(p, datos) {
  const c = await one(`insert into casos(persona_id,fase,etapa,servicio,cuantos,salida,presupuesto,confirma,tipo_destinos,destino,borrador,borrador_tipo,borrador_en,creado,actualizado,cotizando_por,cotizando_desde,recordatorio_en,total)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$16,$17,$18) returning *`,
    [p.id, datos.fase || 'lead', datos.etapa, datos.servicio || 'Viaje a medida', datos.cuantos || null, datos.salida || null, datos.presupuesto || null, datos.confirma || null, datos.tipo || 'uno', datos.destino || null,
      datos.borrador || null, datos.borrador ? datos.borrador_tipo || 'preguntas' : null, datos.borrador ? new Date() : null, hace(datos.horas || 2), datos.cotizando_por || null, datos.cotizando_por ? hace(0.3) : null, datos.recordatorio_en || null, datos.total || null]);
  return c;
}
async function chat(p, c, mensajes) { // [[horasAtrás, 'c'|'p', texto]]
  for (const [h, quien, texto] of mensajes) await q(`insert into mensajes(persona_id,caso_id,mid,entrante,texto,creado) values($1,$2,$3,$4,$5,$6)`, [p.id, c.id, 'demo-' + Date.now() + '-' + (++n), quien === 'c', texto, hace(h)]);
}
async function destino(c, d) {
  return one(`insert into destinos(caso_id,nombre,fechas,dias,detalle,presupuesto_usd,preferencia,estado) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [c.id, d.nombre, d.fechas || null, d.dias || null, d.detalle || null, d.presupuesto_usd || null, d.preferencia || null, d.estado || 'semaforo']);
}
const actividad = (c, items) => Promise.all(items.map(([quien, texto], i) => q(`insert into actividad(caso_id,quien,texto,creada) values($1,$2,$3,$4)`, [c.id, quien, texto, new Date(Date.now() - (items.length - i) * 60e3)])));
async function cotizacion(c, d, k) {
  const items = k.items.map(([item, detalle, proveedor, costo, margen]) => ({ item, detalle, proveedor, costo, margen }));
  let costo = 0, precio = 0; for (const i of items) { costo += i.costo; precio += i.costo * (1 + i.margen / 100); }
  return one(`insert into cotizaciones(caso_id,destino_id,viaje,viaja,cuantos,version,estado,items,costo_pp,precio_pp,margen,sena_pct,valida_hasta,no_incluye,token,inicio,enviada_en,mandada,quien,detalle,resultado)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,20,current_date + 5,'Comidas no mencionadas, propinas, gastos personales, visa si corresponde',$12,$13,$14,$15,$16,$17,$18) returning *`,
    [c?.id || null, d?.id || null, k.viaje || d?.nombre, d?.fechas || k.viaja || null, c?.cuantos || k.cuantos || '2 adultos', k.version || 1, k.estado, JSON.stringify(items), Math.round(costo), Math.round(precio), Math.round((precio - costo) / precio * 1000) / 10,
      tok(), hace(k.horas || 24), k.estado === 'borrador' ? null : hace(k.horas || 24), k.estado === 'borrador' ? null : hace(k.horas || 24), 'Sol', items.map(i => i.item).join(' · '), k.estado === 'aceptada' ? 'vendió' : 'sin respuesta']);
}

const ITEMS_TAILANDIA = [['Aéreo Buenos Aires – Bangkok', 'Turkish Airlines, con valija', 'Consolidador', 1380, 5], ['Vuelos internos', 'Bangkok – Chiang Mai – Phuket', 'Operador local', 210, 20], ['Hoteles 4★ con desayuno', 'Bangkok 4 · Chiang Mai 3 · Phuket 7 noches', 'Mayorista', 1050, 20], ['Traslados', 'Aeropuerto – hotel en las 3 ciudades', 'Operador local', 140, 20], ['Excursiones', 'Templos, santuario de elefantes, islas Phi Phi', 'Operador local', 330, 20], ['Asistencia al viajero', '15 días', 'Aseguradora', 103, 20]];

async function cargar() {
  await borrar();
  // 0 · Un cliente que ya viajó: su cotización queda en el banco para usar como base
  const pg = await persona('Familia Gómez', 'familiagomez');
  const cg = await caso(pg, { fase: 'venta', etapa: 'fin', cuantos: '2 adultos', destino: 'Tailandia', horas: 24 * 200 });
  const dg = await destino(cg, { nombre: 'Tailandia', fechas: 'abril 2026', dias: 15, estado: 'eligio' });
  await cotizacion(cg, dg, { estado: 'aceptada', items: ITEMS_TAILANDIA.map(i => [i[0], i[1], i[2], Math.round(i[3] * 0.97), i[4]]), viaje: 'Tailandia clásica 15 días', horas: 24 * 210 });

  // 1 · Marina: recién escribió. La IA ya armó el mensaje con todo lo que falta (Preguntando)
  const pm = await persona('Marina G.', 'marinag');
  const cm = await caso(pm, { etapa: 'preguntando', destino: 'Japón', horas: 0.5,
    borrador: '¡Hola Marina! Qué lindo destino 🗾 Para armarte una propuesta a medida, contame:\n1. ¿Para cuándo lo pensás y cuántos días?\n2. ¿Cuántos viajan?\n3. ¿Qué presupuesto manejan por persona, más o menos?\n4. ¿Desde dónde salen?\n5. ¿Para cuándo querrían tenerlo confirmado?' });
  await chat(pm, cm, [[0.5, 'c', 'Hola! Quiero info para ir a Japón 🇯🇵']]);
  await destino(cm, { nombre: 'Japón', estado: 'pendiente' });
  await actividad(cm, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['IA', 'Se completó solo desde la conversación: tipo, destino Japón.'], ['IA', 'La IA armó las preguntas para cotizar. Pasa a Preguntando.']]);

  // 2 · Javier: se le mandaron las preguntas y no contestó en 20 h. La IA armó el recordatorio (Aguardando datos)
  const pj = await persona('Javier R.', 'javi.ruiz');
  const cj = await caso(pj, { etapa: 'aguardando', destino: 'Europa', horas: 21, borrador_tipo: 'recordatorio',
    borrador: '¡Hola Javier! ¿Pudiste ver las preguntas? Con eso ya te armo la propuesta de Europa 😊' });
  await chat(pj, cj, [[21, 'c', 'Hola, cuánto sale un viaje a Europa?'], [20.8, 'p', '¡Hola Javier! Qué buen plan 🙌 Para armarte una propuesta, contame:\n1. ¿Qué países te gustaría conocer?\n2. ¿Para cuándo y cuántos días?\n3. ¿Cuántos viajan?\n4. ¿Qué presupuesto manejan por persona, más o menos?\n5. ¿Desde dónde salen?']]);
  await destino(cj, { nombre: 'Europa', estado: 'pendiente' });
  await actividad(cj, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['Sol', 'Se mandaron las preguntas. Pasa a Aguardando datos.'], ['IA', 'No contestó en 20 h: la IA armó el recordatorio (una sola vez).']]);

  // 3 · Carla: está eligiendo entre Japón y Tailandia. Contestó todo: un semáforo por destino (Para cotizar)
  const pc = await persona('Carla M.', 'carla.mz');
  const cc = await caso(pc, { etapa: 'para_cotizar', tipo: 'opciones', destino: 'Japón / Tailandia', cuantos: '2 adultos', salida: 'Buenos Aires', presupuesto: 'USD 4.000 por persona', confirma: 'Antes de fin de año', horas: 3 });
  await chat(pc, cc, [[5, 'c', 'Hola! Estamos entre Japón o Tailandia para mayo, cuánto sale?'], [4.8, 'p', '¡Hola Carla! Los dos son hermosos 😍 Te armamos una propuesta para Japón y otra para Tailandia, así las comparás.\n\nEstas respuestas nos sirven para las dos. Si para alguno tenés algo en particular o distinto, contanos así lo tenemos en cuenta al cotizar:\n1. ¿Cuántos días tienen?\n2. ¿Cuántos viajan?\n3. ¿Qué presupuesto manejan por persona, más o menos?\n4. ¿Desde dónde salen?\n5. ¿Para cuándo querrían tenerlo confirmado?\n\nY contame: ¿alguno de los dos te tira más? 😊'], [3, 'c', 'Somos 2, unos 15 días. Unos 4 mil dólares cada uno, desde Buenos Aires. Queremos cerrarlo antes de fin de año. Japón me tira más pero no sé si nos da']]);
  await destino(cc, { nombre: 'Japón', fechas: 'mayo', dias: 15, detalle: 'Tokio y Kioto', presupuesto_usd: 4000, preferencia: 'Le tira más' });
  await destino(cc, { nombre: 'Tailandia', fechas: 'mayo', dias: 15, detalle: 'Bangkok, norte y playas', presupuesto_usd: 4000 });
  await actividad(cc, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['IA', 'La IA armó las preguntas para cotizar. Pasa a Preguntando.'], ['Sol', 'Se mandaron las preguntas. Pasa a Aguardando datos.'], ['IA', 'Se completó solo desde la conversación: cuántos, salida, presupuesto, cuándo confirma.']]);

  // 4 · Laura: dos viajes distintos (Brasil en enero, Europa en julio)
  const pl = await persona('Laura P.', 'laurap');
  const cl = await caso(pl, { etapa: 'para_cotizar', tipo: 'distintos', destino: 'Brasil / Europa', cuantos: '2 adultos', salida: 'Buenos Aires', presupuesto: 'Brasil USD 1.500 pp; Europa no sabe', confirma: 'Brasil ya', horas: 6 });
  await chat(pl, cl, [[8, 'c', 'Hola! Quiero Brasil para enero y después Europa en julio'], [7.8, 'p', '¡Hola Laura! Dos viajazos 🙌 Para armarte las dos propuestas, contame:\nPara Brasil:\n1. ¿Cuántos días y qué tipo de playa buscan?\nPara Europa:\n2. ¿Qué países te gustaría conocer y cuántos días?\nPara los dos:\n3. ¿Cuántos viajan?\n4. ¿Qué presupuesto manejan por persona en cada viaje?\n5. ¿Desde dónde salen?\n6. ¿Para cuándo querrían tenerlos confirmados?'], [6, 'c', 'Somos 2. Brasil una semana, algo tranqui tipo Búzios. Europa no sé, Italia capaz, 15 días. Para Brasil 1.500 cada uno, Europa todavía no sé. Desde Buenos Aires. Brasil lo quiero cerrar ya']]);
  await destino(cl, { nombre: 'Brasil', fechas: 'segunda semana de enero', dias: 7, detalle: 'Playa tranquila, Búzios', presupuesto_usd: 1500 });
  await destino(cl, { nombre: 'Europa', fechas: 'julio', dias: 15, detalle: '"Italia capaz"' });
  await actividad(cl, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['Sol', 'Se mandaron las preguntas. Pasa a Aguardando datos.'], ['IA', 'Se completó solo desde la conversación: Brasil y Europa como viajes distintos.']]);

  // 5 · Lucía: presupuesto muy bajo para el destino (rojo)
  const pu = await persona('Lucía P.', 'lu.paz');
  const cu = await caso(pu, { etapa: 'para_cotizar', destino: 'Japón', cuantos: '4 adultos', salida: 'Córdoba', presupuesto: 'USD 1.200 pp con aéreo', horas: 10 });
  await q(`update casos set senales='solo_precio' where id=$1`, [cu.id]);
  await chat(pu, cu, [[12, 'c', 'Hola! Cuánto sale Japón para 4 en agosto? Saliendo de Córdoba'], [11.8, 'p', '¡Hola Lucía! Para armarte la propuesta, contame:\n1. ¿Cuántos días tienen?\n2. ¿Qué presupuesto manejan por persona, con aéreo?\n3. ¿Para cuándo querrían tenerlo confirmado?'], [10, 'c', 'Unos 12 días. Unos 1.200 dólares cada uno con el aéreo, pasame solo el precio total']]);
  await destino(cu, { nombre: 'Japón', fechas: 'agosto', dias: 12, presupuesto_usd: 1200 });
  await actividad(cu, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['IA', 'Se completó solo desde la conversación: cuántos, salida, presupuesto.']]);

  // 6 · Ana: Japón + China en el mismo viaje. Sol la está cotizando (Cotizando)
  const pa = await persona('Ana R.', 'ana.r');
  const ca = await caso(pa, { etapa: 'cotizando', tipo: 'combinado', destino: 'Japón + China', cuantos: '2 adultos', salida: 'Buenos Aires', presupuesto: 'USD 9.000 por persona', confirma: 'En diciembre', cotizando_por: 'Sol', horas: 26 });
  await chat(pa, ca, [[28, 'c', 'Hola! Quiero hacer Japón y China en el mismo viaje'], [27.5, 'p', '¡Hola Ana! Qué viaje lindo 🗾🇨🇳 Para armarte la propuesta, contame:\n1. ¿Para cuándo y cuántos días en total?\n2. ¿Cuántos viajan?\n3. ¿Qué presupuesto manejan por persona, más o menos?\n4. ¿Desde dónde salen?\n5. ¿Para cuándo querrían tenerlo confirmado?'], [26, 'c', 'Somos 2, en marzo, unas 3 semanas. Unos 9 mil dólares cada uno, desde Buenos Aires. Queremos cerrarlo en diciembre']]);
  const da = await destino(ca, { nombre: 'Japón + China', fechas: 'marzo', dias: 21, detalle: 'Tokio, Kioto, Beijing, Shanghái', presupuesto_usd: 9000, estado: 'cotizando' });
  await q(`update destinos set semaforo='verde', motivo='Pide USD 9.000 por persona; el mínimo para Japón + China / Corea 21 días es USD 5.900 (153%). Alcanza.' where id=$1`, [da.id]);
  await cotizacion(ca, da, { estado: 'borrador', horas: 0.3, items: [['Aéreo Buenos Aires – Tokio / Shanghái – Buenos Aires', 'Turkish Airlines, multidestino', 'Consolidador', 1750, 5], ['Hoteles 4★', 'Tokio 5 · Kioto 4 · Beijing 4 · Shanghái 4 noches', 'Mayorista', 2400, 20], ['Tren bala y vuelo interno', 'Tokio – Kioto · Osaka – Beijing', 'Operador local', 520, 20]] });
  await actividad(ca, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['IA', 'Semáforo: Japón + China 🟢. Pasa a Para cotizar.'], ['Sol', 'Empezó a cotizar Japón + China (v1).']]);

  // 7 · Lucas: cotización mandada, esperando respuesta
  const pk = await persona('Lucas y Vale', 'lucasyvale');
  const ck = await caso(pk, { etapa: 'esperando', destino: 'Perú', cuantos: '2 adultos', salida: 'Buenos Aires', presupuesto: 'USD 2.000 por persona', confirma: 'Este mes', horas: 50 });
  await chat(pk, ck, [[60, 'c', 'Hola! Queremos ir a Perú en marzo, Cusco y Machu Picchu'], [59, 'p', '¡Hola! Para armarte la propuesta, contame:\n1. ¿Cuántos días tienen?\n2. ¿Cuántos viajan?\n3. ¿Presupuesto por persona?\n4. ¿Para cuándo querrían tenerlo confirmado?'], [55, 'c', '10 días, somos 2, unos 2 mil cada uno. Lo queremos cerrar este mes'], [50, 'p', '¡Hola Lucas! Te paso la propuesta para Perú 👇 (link a la propuesta)']]);
  const dk = await destino(ck, { nombre: 'Perú', fechas: 'marzo', dias: 10, detalle: 'Lima, Cusco, Valle Sagrado y Machu Picchu', presupuesto_usd: 2000, estado: 'cotizado' });
  await q(`update destinos set semaforo='verde', motivo='Pide USD 2.000 por persona; el mínimo para Perú y Sudamérica 10 días es USD 1.500 (133%). Alcanza.' where id=$1`, [dk.id]);
  await cotizacion(ck, dk, { estado: 'mandada', horas: 50, items: [['Aéreo Buenos Aires – Lima – Cusco', 'LATAM, con valija', 'Consolidador', 620, 5], ['Hoteles 4★ con desayuno', 'Lima 2 · Cusco 4 · Valle Sagrado 3 noches', 'Mayorista', 640, 20], ['Tren a Machu Picchu + entradas', 'PeruRail Vistadome, entrada al santuario', 'Operador local', 310, 20], ['Traslados y excursiones', 'City tour, Valle Sagrado', 'Operador local', 180, 20], ['Asistencia al viajero', '10 días', 'Aseguradora', 60, 20]] });
  await actividad(ck, [['Instagram', 'Lead creado solo: escribió por Instagram.'], ['IA', 'Semáforo: Perú 🟢. Pasa a Para cotizar.'], ['Sol', 'Cotización de Perú v1 mandada. Se armó en 24 min. Pasa a Esperando respuesta.']]);

  // 8 · Silvia: dijo que sí (Oportunidad, falta mandarle los datos de la seña)
  const ps = await persona('Silvia T.', 'silviat');
  const cs = await caso(ps, { fase: 'oportunidad', etapa: 'le_intereso', destino: 'Tailandia', cuantos: '2 adultos', salida: 'Buenos Aires', presupuesto: 'USD 4.000 por persona', horas: 2, total: 3650 });
  await chat(ps, cs, [[30, 'c', 'Hola! Queremos Tailandia en abril'], [3, 'p', '¡Hola Silvia! Te paso la propuesta para Tailandia 👇'], [2, 'c', '¡Nos encantó! Vamos con Tailandia 🙌 ¿Cómo hacemos la seña?']]);
  const ds = await destino(cs, { nombre: 'Tailandia', fechas: 'abril', dias: 15, presupuesto_usd: 4000, estado: 'eligio' });
  await cotizacion(cs, ds, { estado: 'aceptada', horas: 3, items: ITEMS_TAILANDIA });
  await q(`insert into avisos(caso_id,para,texto) values($1,current_date,'Dijo que sí: mandarle los datos para la seña')`, [cs.id]);
  await actividad(cs, [['Sol', 'Cotización de Tailandia v1 mandada. Pasa a Esperando respuesta.'], ['Sol', 'Dijo que sí a Tailandia (v1). Lead Convertido: pasa a Oportunidad.']]);

  // semáforo calculado con las reglas de Ajustes, igual que en una consulta real
  for (const c of [cc, cl, cu]) {
    await ia.ponerSemaforo(c.id);
    await q(`update casos set etapa='para_cotizar' where id=$1`, [c.id]);
    await q(`delete from avisos where caso_id=$1 and texto='Está para cotizar'`, [c.id]);
    const col = await q('select nombre, semaforo from destinos where caso_id=$1 order by id', [c.id]);
    await actividad(c, [['IA', 'Semáforo: ' + col.map(x => `${x.nombre} ${{ verde: '🟢', amarillo: '🟡', rojo: '🔴' }[x.semaforo] || ''}`).join(', ') + '. Pasa a Para cotizar.']]);
  }
  return { consultas: 8 };
}

// "el cliente contesta": simula la respuesta de Marina o de Javier y lo que haría la IA con ella
async function responder(casoId) {
  const c = await one(`select c.*, p.nombre from casos c join personas p on p.id=c.persona_id where c.id=$1 and p.origen='Demo'`, [casoId]);
  if (!c || c.fase !== 'lead') return;
  const esJavier = /javier/i.test(c.nombre);
  const texto = esJavier ? 'Perdón la demora! Seríamos 2 o 3, capaz el año que viene, Italia y España. Presupuesto no sé, estoy viendo precios en varios lados. Desde Buenos Aires'
    : 'Somos 2, la segunda quincena de octubre, unos 14 días. Unos 5 mil dólares cada uno, salimos de Buenos Aires. Queremos confirmar en diciembre';
  await q(`insert into mensajes(persona_id,caso_id,mid,entrante,texto) values($1,$2,$3,true,$4)`, [c.persona_id, c.id, 'demo-' + Date.now(), texto]);
  const d = await one('select * from destinos where caso_id=$1 order by id limit 1', [c.id]);
  if (esJavier) {
    await q(`update casos set cuantos='2 o 3', salida='Buenos Aires', presupuesto='No sabe', confirma=null, senales=null, borrador=null, borrador_tipo=null, etapa='aguardando' where id=$1`, [c.id]);
    await q(`update destinos set nombre='Europa (Italia y España)', fechas='"capaz el año que viene"', detalle='Italia y España', estado='semaforo' where id=$1`, [d.id]);
  } else {
    await q(`update casos set cuantos='2 adultos', salida='Buenos Aires', presupuesto='USD 5.000 por persona', confirma='En diciembre', borrador=null, borrador_tipo=null, etapa='aguardando' where id=$1`, [c.id]);
    await q(`update destinos set fechas='segunda quincena de octubre', dias=14, presupuesto_usd=5000, estado='semaforo' where id=$1`, [d.id]);
  }
  await q(`insert into actividad(caso_id,quien,texto) values($1,'IA',$2)`, [c.id, 'Se completó solo desde la conversación: cuántos, salida, presupuesto, fechas' + (esJavier ? '.' : ', cuándo confirma.')]);
  await ia.ponerSemaforo(c.id);
}

async function borrar() {
  await q(`delete from cotizaciones where caso_id in (select c.id from casos c join personas p on p.id=c.persona_id where p.origen='Demo')`);
  await q(`delete from personas where origen='Demo'`);
}

module.exports = { cargar, responder, borrar };
