// Reglas que se configuran en Ajustes: qué preguntar para cotizar, mínimos por destino y cortes del semáforo.
// Los valores por defecto son la propuesta inicial (17/11) para validar con Sol.
const { q, one } = require('./db');

const DEFAULTS = {
  preguntas: {
    'Viaje a medida': ['Para cuándo y cuántos días', 'Cuántos viajan (y si hay menores)', 'Presupuesto aproximado por persona', 'Desde dónde salen', 'Cómo les gustaría viajar: vuelo económico o business, y alojamiento (hotel 3, 4 o 5 estrellas, all inclusive o departamento)', 'Si es por algo especial: cumpleaños, luna de miel, aniversario, despedida de solteros (opcional)'],
    'Aéreo': ['Origen y destino', 'Fechas de ida y vuelta', 'Cuántos pasajeros', 'Si llevan valija en bodega'],
    'Hotel': ['Destino y fechas', 'Cuántas habitaciones y personas', 'Qué categoría buscan'],
    'Visa': ['Qué país', 'Cuándo viajan', 'Si tienen pasaporte vigente', 'Si es la primera vez que la tramitan'],
    'Alquiler de auto': ['Dónde lo retiran y dónde lo devuelven', 'Fechas y cuántos días', 'Qué tipo de auto (chico, mediano, SUV, manual o automático)', 'Edad del conductor'],
    'Asistencia al viajero': ['A qué destino viajan', 'Fechas y cuántos días', 'Cuántos viajan y sus edades', 'Si van a hacer deportes o actividades de aventura'],
    'Salida grupal': ['Qué salida les interesa', 'Cuántos son', 'Habitación doble, triple o single'],
  },
  // destino, palabras para reconocerlo, aéreo USD, costo por día USD
  minimos: [
    ['Japón + China / Corea', 'china, corea', 1700, 200],
    ['Japón', 'japon, japón, tokio, kioto, osaka', 1600, 200],
    ['Tailandia / Sudeste asiático', 'tailandia, vietnam, bali, indonesia, camboya, bangkok, phuket, sudeste', 1500, 100],
    ['Europa', 'europa, italia, españa, francia, grecia, portugal, londres, paris, roma, madrid, croacia, turquia, turquía', 1000, 170],
    ['Estados Unidos', 'estados unidos, eeuu, usa, miami, nueva york, orlando, new york, disney, los angeles', 900, 180],
    ['Caribe all inclusive', 'caribe, cancun, cancún, punta cana, aruba, cuba, playa del carmen, republica dominicana, samaná, bayahibe, riviera maya', 750, 150],
    ['Brasil playa', 'brasil, rio, río, buzios, búzios, florianopolis, florianópolis, salvador, maceio, maceió, natal', 450, 70],
    ['Perú y Sudamérica', 'peru, perú, cusco, machu picchu, chile, colombia, cartagena, bolivia, uruguay', 500, 100],
  ],
  cortes: { verde: 100, rojo: 75, alta: 20, mesesAlta: [12, 1, 7] },
  // mensajes armados (24/11). {nombre}, {destino}, {minimo}, {medio} se reemplazan solos
  mensajes: {
    listo: '¡Muchas gracias, {nombre}! Con esto ya te puedo armar la cotización de {destino}. Te la mando en las próximas 48 h y me contás cómo la ves 🙌',
    cierre_consulta: '¡Hola {nombre}! Como no tuvimos noticias tuyas, por ahora cerramos tu consulta de {destino}. Cuando quieras retomarla, escribinos por acá y te armamos la propuesta. ¡Gracias por pensar en Paybe!',
    propuesta: '¡Hola {nombre}! Te paso la propuesta para {destino} 🌴 La armamos con todo lo que nos contaste. El precio está congelado hasta el {vence}: después de esa fecha, los aéreos y los hoteles pueden cambiar de tarifa. Miralo tranqui y contame qué te parece. Si querés ajustar algo, lo cambiamos sin problema.\n{link}',
    seguimiento_propuesta: '¡Hola {nombre}! ¿Pudiste ver la propuesta? Te recuerdo que el precio está congelado hasta el {vence}. Si algo no te cerró o querés cambiar algo (fechas, hotel, presupuesto), decinos y lo rearmamos. Si no, por ahora cerramos la consulta y cuando quieras la retomamos. ¡Gracias!',
    datos_sena: '¡Genial, {nombre}! Seguimos adelante 🙌 Te cuento cómo trabajamos en Paybe:\n1. Para confirmar el viaje se abona una seña del 50% ({total_sena} en total). Con la seña empezamos a reservar todo.\n2. El otro 50% lo pagás como te quede más cómodo, en las cuotas que quieras. Lo único importante es que el viaje quede pagado 30 días antes de la salida.\nTe paso los datos para transferir:\nAlias: COMPLETAR EN AJUSTES\nCBU: COMPLETAR EN AJUSTES\nTitular: Paybe Turismo\nCuando la hagas, mandanos el comprobante por acá y arrancamos con las reservas. Acordate que el precio está congelado hasta el {vence}.',
    sena: '¡Hola {nombre}! Te cuento que ayer venció el plazo de la tarifa de {destino}, así que por ahora cerramos tu pedido. Si te sigue interesando, avisanos y te recotizamos con los precios actualizados. ¡Gracias!',
    sena_recibida: '¡Recibimos tu seña, {nombre}! Muchas gracias 🙌 Ya empezamos a reservar todo para {destino}. Acordate que el resto lo podés pagar como prefieras, en las cuotas que quieras, hasta {saldo_hasta}. Cualquier duda, acá estamos.',
    saldo_60: '¡Genial, {nombre}! Ya faltan solo dos meses para {destino} 🌴 Te recordamos que el saldo se completa hasta {saldo_hasta}. Si querés, te armamos las cuotas que te queden más cómodas para el último mes.',
    saldo_30: '¡Hola {nombre}! Falta un mes para {destino} 🙌 Hoy es el último día para completar el saldo, así dejamos todas las reservas confirmadas. ¿Lo coordinamos?',
    saludo: '¡Hola! Gracias por escribirnos 😊 Contanos en qué te podemos ayudar y te armamos la cotización. En Paybe hacemos:\n• Viajes a medida\n• Salidas grupales\n• Aéreos\n• Hoteles\n• Visas\n• Alquiler de autos\n• Asistencia al viajero\n\n¿Qué viaje estás pensando?',
    presupuesto_bajo: '¡Hola {nombre}! Gracias por escribirnos 😊 En Paybe cuidamos mucho la calidad de cada viaje (hoteles, traslados, asistencia y que todo salga bien), y para {destino} en esas fechas eso arranca en {minimo} por persona. Te proponemos tres caminos: sumar un poco al presupuesto, hacerlo con menos días, o pensar otro destino que con lo que tenés en mente te dé un viajazo. ¿Cuál te cierra más?',
    pedir_docs: '¡Hola {nombre}! 🙌 Ya estamos con la reserva de {destino}. Para avanzar necesitamos de cada pasajero:\n• Nombre y apellido tal como figuran en el pasaporte\n• Fecha de nacimiento\n• Foto del pasaporte (vigente al menos 6 meses después de la vuelta) o del DNI si viajan por la región\n• Si viajan menores: partida de nacimiento y autorización de viaje si no viajan con ambos padres\n• Un mail y un teléfono de contacto\nPodés mandarnos todo por acá. ¡Gracias!',
    comprobante: '¡Hola {nombre}! Gracias por el pago 🙌 ¿Nos mandás el comprobante de la {medio} así lo dejamos registrado?',
  },
  // borrador con lo que dijo Sol (24/11): que lo lea ella antes de que salga en las propuestas
  bases: 'Para reservar se abona una seña del 50% del total. El saldo se completa hasta 30 días antes de la salida; sin ese pago se pierden las reservas. Los aéreos son intransferibles y, una vez emitidos, no tienen devolución; cualquier cambio está sujeto a penalidad y a la diferencia de tarifa. Los hoteles se reservan con tarifa cancelable según las condiciones de cada uno. Las tarifas están sujetas a disponibilidad hasta el momento de la reserva y valen hasta la fecha indicada en la propuesta.',
};
const ETIQUETAS_MENSAJES = { saludo: '1.0 Saludo (cuando solo escribe "Hola")', listo: '1.3 Ya dio todo para cotizar (sale solo)', cierre_consulta: '1.5 Cerramos la consulta (3 días sin respuesta)', propuesta: '2.1 Mandamos la propuesta', seguimiento_propuesta: '2.2 Propuesta sin respuesta en 3 días (se cierra)', sena_recibida: '3.3 Llegó la seña (sale solo)', pedir_docs: 'Pedir la documentación (al pasar a Venta)', datos_sena: '3.1 Dice que sí: cómo se paga y datos para la seña', presupuesto_bajo: 'Presupuesto bajo (semáforo rojo)', sena: '3.2 Venció la tarifa y no llegó la seña (se cierra)', comprobante: 'Pedir el comprobante', saldo_60: '4.2 Saldo: 2 meses antes', saldo_30: '4.3 Saldo: 1 mes antes' };
const completar = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
// fecha corta como la escribe Sol: 5/12
const diaMes = d => { if (!d) return ''; const x = new Date(String(d.toISOString?.().slice(0, 10) || d).slice(0, 10) + 'T12:00:00Z'); return `${x.getUTCDate()}/${x.getUTCMonth() + 1}`; };
// hasta cuándo se paga el saldo: 30 días antes de la salida
const saldoHasta = sale => { if (!sale) return '30 días antes de la salida'; const x = new Date(String(sale.toISOString?.().slice(0, 10) || sale).slice(0, 10) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 30); return `el ${x.getUTCDate()}/${x.getUTCMonth() + 1} (30 días antes de la salida)`; };
const primerNombre = n => String(n || '').replace(/^@/, '').split(' ')[0];

async function leer(clave) {
  const r = await one('select valor from ajustes where clave=$1', ['reglas_' + clave]);
  if (!r) return DEFAULTS[clave];
  try { return JSON.parse(r.valor); } catch { return DEFAULTS[clave]; }
}
const guardar = (clave, valor) => q('insert into ajustes(clave,valor) values($1,$2) on conflict (clave) do update set valor=excluded.valor', ['reglas_' + clave, JSON.stringify(valor)]);
const todas = async () => ({ preguntas: await leer('preguntas'), minimos: await leer('minimos'), cortes: await leer('cortes') });
const mensajes = async () => ({ ...DEFAULTS.mensajes, ...(await leer('mensajes')) });
// si las preguntas ya se habían editado, se suman una sola vez las dos nuevas de la weekly del 24/11
const VIEJOS_2711 = { sena: '¡Hola {nombre}! ¿Cómo va? Te escribo para saber si siguen con la idea de {destino}. Las tarifas tienen validez limitada, así que si quieren avanzar avisanos y lo reservamos.', datos_sena: '¡Qué bueno, {nombre}! 🙌 Para reservar {destino} se abona una seña de {sena} ({total_sena} en total). Te paso los datos para transferir:\nAlias: COMPLETAR EN AJUSTES\nCBU: COMPLETAR EN AJUSTES\nTitular: Paybe Turismo\nCuando la hagas, mandanos el comprobante por acá y reservamos todo. La tarifa vale hasta el {vence}.', saldo_60: '¡Hola {nombre}! Ya falta poco para {destino} ✈️ Te recordamos que el saldo del viaje se completa hasta 30 días antes de la salida: queda el último mes. Cualquier duda, escribinos.', saldo_30: '¡Hola {nombre}! Faltan 30 días para {destino}. Hoy vence el plazo del saldo: sin el pago se pierden las reservas. ¿Lo coordinamos?' };
async function migrar() {
  if (!await one("select 1 from ajustes where clave='migracion_mensajes_2711'")) {
    const m = await leer('mensajes'); let cambio = false;
    for (const [k, v] of Object.entries(VIEJOS_2711)) if (m[k] === v) { delete m[k]; cambio = true; }
    if (cambio) await guardar('mensajes', m);
    await q("insert into ajustes(clave,valor) values('migracion_mensajes_2711','1') on conflict do nothing");
  }
  const r2 = await one("select valor from ajustes where clave='reglas_preguntas'");
  if (r2) { const p = JSON.parse(r2.valor); let cambio = false; for (const [t, l] of Object.entries(DEFAULTS.preguntas)) if (!p[t]) { p[t] = l; cambio = true; } if (cambio) await guardar('preguntas', p); }
  // 27/11: se saca "cuándo lo quieren confirmado" y se aclaran categoría y ocasión especial en lo guardado
  if (r2 && !await one("select 1 from ajustes where clave='migracion_preguntas_2711'")) {
    const p = JSON.parse((await one("select valor from ajustes where clave='reglas_preguntas'")).valor);
    for (const t of Object.keys(p)) p[t] = p[t].filter(x => !/confirmad/i.test(x)).map(x => /^Qué categoría buscan \(aéreo/i.test(x) ? DEFAULTS.preguntas['Viaje a medida'].find(y => /^Cómo les gustaría viajar/.test(y)) : /^Si es por una ocasión especial/i.test(x) ? DEFAULTS.preguntas['Viaje a medida'].find(y => /^Si es por algo especial/.test(y)) : x);
    await guardar('preguntas', p);
    await q("insert into ajustes(clave, valor) values('migracion_preguntas_2711','1') on conflict do nothing");
  }
  if (await one("select 1 from ajustes where clave='migracion_preguntas_2411'")) return;
  const r = await one("select valor from ajustes where clave='reglas_preguntas'");
  if (r) {
    const p = JSON.parse(r.valor), nuevas = DEFAULTS.preguntas['Viaje a medida'].slice(-2);
    if (p['Viaje a medida']) for (const x of nuevas) if (!p['Viaje a medida'].includes(x)) p['Viaje a medida'].push(x);
    await guardar('preguntas', p);
  }
  await q("insert into ajustes(clave,valor) values('migracion_preguntas_2411', now()::text)");
}
// destinos de Argentina: el cotizador arranca en pesos
const ARGENTINA = /(argentin|bariloche|mendoza|salta|jujuy|ushuaia|calafate|chalten|iguaz|cordoba|mar del plata|puerto madryn|tucuman|catamarca|san juan|san luis|neuquen|patagonia|norte argentino|cataratas|villa la angostura|san martin de los andes|esteros del ibera|tierra del fuego|cafayate|purmamarca)/;
const esArgentina = nombre => ARGENTINA.test(norm(nombre));

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function minimoPara(nombre, minimos) {
  const n = norm(nombre);
  return minimos.find(([, palabras]) => String(palabras).split(',').map(norm).map(x => x.trim()).filter(Boolean).some(p => n.includes(p))) || null;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function temporadaAlta(fechas, nombre, cortes) {
  const f = norm(fechas);
  const mes = MESES.findIndex(m => f.includes(m)) + 1;
  if (mes && (cortes.mesesAlta || []).includes(mes)) return true;
  if (/fin de ano|navidad|vacaciones de invierno/.test(f)) return true;
  return mes === 4 && /japon/.test(norm(nombre)); // cerezos
}
const DIAS_BASE = 7;
const VAGAS = /(ano que viene|algun dia|no se|todavia no|mas adelante|capaz|a definir|sin fecha)/;

// Devuelve { semaforo: 'verde'|'amarillo'|'rojo'|null, motivo }
function evaluar(d, ctx, reglas) {
  const { cortes, minimos } = reglas;
  if (ctx.sinSemaforo) return { semaforo: 'verde', motivo: 'Visas y aéreos sueltos van directo a cotizar.' };
  if (ctx.noContesto) return { semaforo: 'rojo', motivo: 'No contestó ni después del recordatorio.' };
  const NIVEL = ['rojo', 'amarillo', 'verde'];
  let nivel = 2; const motivos = [];
  const m = minimoPara(d.nombre, minimos);
  // los días son opcionales (los propone la agencia): sin días, se compara con un viaje tipo de DIAS_BASE días
  const dias = Number(d.dias) || DIAS_BASE, supuestos = !Number(d.dias);
  if (!d.presupuesto_usd) { nivel = Math.min(nivel, 1); motivos.push('No dijo presupuesto: mandarle salidas armadas para que se ubique.'); }
  else if (m && dias) {
    const alta = temporadaAlta(d.fechas, d.nombre, cortes);
    const minimo = minimoUSD(d, reglas);
    const pct = Math.round(Number(d.presupuesto_usd) / minimo * 100);
    const txt = `Pide USD ${Number(d.presupuesto_usd).toLocaleString('es-AR')} por persona; el mínimo para ${m[0]} ${dias} días${supuestos ? ' (viaje tipo: no dijo días)' : ''}${alta ? ' en temporada alta' : ''} es USD ${minimo.toLocaleString('es-AR')} (${pct}%).`;
    if (pct >= cortes.verde) motivos.push(txt + ' Alcanza.');
    else if (pct >= cortes.rojo) { nivel = Math.min(nivel, 1); motivos.push(txt + ' Se puede ajustando: menos días u hoteles 3★.'); }
    else { nivel = 0; motivos.push(txt + ' Ofrecerle otro destino.'); }
  } else if (!m) motivos.push('Destino sin mínimo cargado en Ajustes: revisar a mano.');
  else motivos.push('No dijo cuántos días: no se pudo comparar con el mínimo.');
  if (!d.fechas || VAGAS.test(norm(d.fechas))) { nivel = Math.min(nivel, 1); motivos.push('Fechas vagas.'); }
  if (ctx.soloPrecio) { nivel = Math.max(0, nivel - 1); motivos.push('Pidió "solo el precio".'); }
  if (ctx.recurrente && nivel === 0) { nivel = 1; motivos.push('Ya es cliente: nunca queda en rojo.'); }
  if (d.preferencia) motivos.push('Le tira más este destino.');
  return { semaforo: NIVEL[nivel], motivo: motivos.join(' ') };
}

// mínimo por persona en USD para un destino (null si no hay mínimo cargado o faltan los días)
function minimoUSD(d, { minimos, cortes }) {
  const m = minimoPara(d.nombre, minimos), dias = Number(d.dias) || DIAS_BASE;
  if (!m) return null;
  const alta = temporadaAlta(d.fechas, d.nombre, cortes);
  return Math.round((Number(m[2]) + dias * Number(m[3])) * (alta ? 1 + cortes.alta / 100 : 1));
}

// Lo que Sol necesita para cotizar, por tipo de consulta (reunión del 18/11). Hasta que esté todo, el lead no pasa a "Para cotizar".
// Ocasión especial y cuándo confirma son opcionales: personalizan la propuesta pero no frenan la cotización.
const NECESARIOS = {
  'Viaje a medida': ['destino', 'fechas', 'cuantos', 'presupuesto', 'salida', 'categoria'],
  'Salida grupal': ['destino', 'cuantos', 'salida'],
  'Aéreo': ['destino', 'fechas', 'cuantos', 'salida', 'categoria'],
  'Hotel': ['destino', 'fechas', 'cuantos', 'categoria'],
  'Visa': ['destino', 'cuantos'],
  'Alquiler de auto': ['destino', 'fechas', 'categoria'],
  'Asistencia al viajero': ['destino', 'fechas', 'cuantos'],
};
const NOMBRE_DATO = { tipo: 'tipo de consulta', destino: 'destino', fechas: 'fechas', dias: 'cuántos días', cuantos: 'cuántos viajan', presupuesto: 'presupuesto', salida: 'desde dónde sale', categoria: 'categoría' };
// una consulta puede pedir varios servicios a la vez (se guardan separados por coma)
const serviciosDe = c => String(c?.servicio || '').split(',').map(x => x.trim()).filter(Boolean);
// lo necesario para cotizar es la suma de lo que pide cada servicio elegido
const necesariosDe = c => { const sv = serviciosDe(c); return sv.length ? [...new Set(sv.flatMap(t => NECESARIOS[t] || NECESARIOS['Viaje a medida']))] : NECESARIOS['Viaje a medida']; };
function faltanParaCotizar(c, destinos) {
  const pide = necesariosDe(c); // sin tipo, se pide lo de un viaje a medida
  const ds = (destinos || []).filter(d => !['descartado', 'no_eligio'].includes(d.estado));
  const vacio = v => v == null || String(v).trim() === '';
  return pide.filter(k => k === 'destino' ? !ds.length
    : k === 'fechas' ? !ds.length || ds.some(d => d.fechas_tipo === 'flexible' ? vacio(d.mes) : d.fechas_tipo === 'fijas' ? !(d.desde && d.hasta) : !(d.desde && d.hasta) && vacio(d.fechas))
    : k === 'dias' ? false // los días los propone la agencia: opcionales
    : k === 'salida' ? vacio(c.salida) && (!ds.length || ds.some(d => vacio(d.salida)))
    : k === 'cuantos' ? vacio(c.cuantos) && !Number(c.adultos)
    : k === 'presupuesto' ? vacio(c.presupuesto) && !ds.some(d => Number(d.presupuesto_usd))
    : vacio(c[k])).concat(c.servicio ? [] : ['tipo']);
}

module.exports = { diaMes, saldoHasta, serviciosDe, necesariosDe, NECESARIOS, NOMBRE_DATO, faltanParaCotizar, DEFAULTS, ETIQUETAS_MENSAJES, leer, guardar, todas, mensajes, migrar, completar, primerNombre, evaluar, minimoPara, minimoUSD, esArgentina };
