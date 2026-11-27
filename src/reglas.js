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
    saludo: '¡Hola! Gracias por escribirnos 😊 Contanos en qué te podemos ayudar y te armamos la cotización. En Paybe hacemos:\n• Viajes a medida\n• Salidas grupales\n• Aéreos\n• Hoteles\n• Visas\n• Alquiler de autos\n• Asistencia al viajero\n\n¿Qué viaje estás pensando?',
    presupuesto_bajo: '¡Hola {nombre}! Gracias por escribirnos 😊 En Paybe cuidamos mucho la calidad de cada viaje (hoteles, traslados, asistencia y que todo salga bien), y para {destino} en esas fechas eso arranca en {minimo} por persona. Te proponemos tres caminos: sumar un poco al presupuesto, hacerlo con menos días, o pensar otro destino que con lo que tenés en mente te dé un viajazo. ¿Cuál te cierra más?',
    sena: '¡Hola {nombre}! ¿Cómo va? Te escribo para saber si siguen con la idea de {destino}. Las tarifas tienen validez limitada, así que si quieren avanzar avisanos y lo reservamos.',
    datos_sena: '¡Qué bueno, {nombre}! 🙌 Para reservar {destino} se abona una seña de {sena} ({total_sena} en total). Te paso los datos para transferir:\nAlias: COMPLETAR EN AJUSTES\nCBU: COMPLETAR EN AJUSTES\nTitular: Paybe Turismo\nCuando la hagas, mandanos el comprobante por acá y reservamos todo. La tarifa vale hasta el {vence}.',
    pedir_docs: '¡Hola {nombre}! 🙌 Ya estamos con la reserva de {destino}. Para avanzar necesitamos de cada pasajero:\n• Nombre y apellido tal como figuran en el pasaporte\n• Fecha de nacimiento\n• Foto del pasaporte (vigente al menos 6 meses después de la vuelta) o del DNI si viajan por la región\n• Si viajan menores: partida de nacimiento y autorización de viaje si no viajan con ambos padres\n• Un mail y un teléfono de contacto\nPodés mandarnos todo por acá. ¡Gracias!',
    comprobante: '¡Hola {nombre}! Gracias por el pago 🙌 ¿Nos mandás el comprobante de la {medio} así lo dejamos registrado?',
    saldo_60: '¡Hola {nombre}! Ya falta poco para {destino} ✈️ Te recordamos que el saldo del viaje se completa hasta 30 días antes de la salida: queda el último mes. Cualquier duda, escribinos.',
    saldo_30: '¡Hola {nombre}! Faltan 30 días para {destino}. Hoy vence el plazo del saldo: sin el pago se pierden las reservas. ¿Lo coordinamos?',
  },
  // borrador con lo que dijo Sol (24/11): que lo lea ella antes de que salga en las propuestas
  bases: 'Para reservar se abona una seña del 50% del total. El saldo se completa hasta 30 días antes de la salida; sin ese pago se pierden las reservas. Los aéreos son intransferibles y, una vez emitidos, no tienen devolución; cualquier cambio está sujeto a penalidad y a la diferencia de tarifa. Los hoteles se reservan con tarifa cancelable según las condiciones de cada uno. Las tarifas están sujetas a disponibilidad hasta el momento de la reserva y valen hasta la fecha indicada en la propuesta.',
};
const ETIQUETAS_MENSAJES = { saludo: 'Saludo (cuando solo escribe "Hola")', pedir_docs: 'Pedir la documentación (al pasar a Venta)', datos_sena: 'Datos para la seña (cuando dice que sí)', presupuesto_bajo: 'Presupuesto bajo (semáforo rojo)', sena: 'La seña no llega (a los 3 días)', comprobante: 'Pedir el comprobante', saldo_60: 'Saldo: 2 meses antes', saldo_30: 'Saldo: 1 mes antes' };
const completar = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
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
async function migrar() {
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

module.exports = { serviciosDe, necesariosDe, NECESARIOS, NOMBRE_DATO, faltanParaCotizar, DEFAULTS, ETIQUETAS_MENSAJES, leer, guardar, todas, mensajes, migrar, completar, primerNombre, evaluar, minimoPara, minimoUSD, esArgentina };
