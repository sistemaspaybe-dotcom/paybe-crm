// Reglas que se configuran en Ajustes: qué preguntar para cotizar, mínimos por destino y cortes del semáforo.
// Los valores por defecto son la propuesta inicial (17/11) para validar con Sol.
const { q, one } = require('./db');

const DEFAULTS = {
  preguntas: {
    'Viaje a medida': ['Para cuándo y cuántos días', 'Cuántos viajan (y si hay menores)', 'Presupuesto aproximado por persona', 'Desde dónde salen', 'Para cuándo querrían tenerlo confirmado'],
    'Aéreo': ['Origen y destino', 'Fechas de ida y vuelta', 'Cuántos pasajeros', 'Si llevan valija en bodega'],
    'Hotel': ['Destino y fechas', 'Cuántas habitaciones y personas', 'Qué categoría buscan'],
    'Visa': ['Qué país', 'Cuándo viajan', 'Si tienen pasaporte vigente', 'Si es la primera vez que la tramitan'],
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
};

async function leer(clave) {
  const r = await one('select valor from ajustes where clave=$1', ['reglas_' + clave]);
  if (!r) return DEFAULTS[clave];
  try { return JSON.parse(r.valor); } catch { return DEFAULTS[clave]; }
}
const guardar = (clave, valor) => q('insert into ajustes(clave,valor) values($1,$2) on conflict (clave) do update set valor=excluded.valor', ['reglas_' + clave, JSON.stringify(valor)]);
const todas = async () => ({ preguntas: await leer('preguntas'), minimos: await leer('minimos'), cortes: await leer('cortes') });

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
const VAGAS = /(ano que viene|algun dia|no se|todavia no|mas adelante|capaz|a definir|sin fecha)/;

// Devuelve { semaforo: 'verde'|'amarillo'|'rojo'|null, motivo }
function evaluar(d, ctx, reglas) {
  const { cortes, minimos } = reglas;
  if (ctx.sinSemaforo) return { semaforo: 'verde', motivo: 'Visas y aéreos sueltos van directo a cotizar.' };
  if (ctx.noContesto) return { semaforo: 'rojo', motivo: 'No contestó ni después del recordatorio.' };
  const NIVEL = ['rojo', 'amarillo', 'verde'];
  let nivel = 2; const motivos = [];
  const m = minimoPara(d.nombre, minimos);
  const dias = Number(d.dias) || 0;
  if (!d.presupuesto_usd) { nivel = Math.min(nivel, 1); motivos.push('No dijo presupuesto: mandarle salidas armadas para que se ubique.'); }
  else if (m && dias) {
    const alta = temporadaAlta(d.fechas, d.nombre, cortes);
    const minimo = Math.round((Number(m[2]) + dias * Number(m[3])) * (alta ? 1 + cortes.alta / 100 : 1));
    const pct = Math.round(Number(d.presupuesto_usd) / minimo * 100);
    const txt = `Pide USD ${Number(d.presupuesto_usd).toLocaleString('es-AR')} por persona; el mínimo para ${m[0]} ${dias} días${alta ? ' en temporada alta' : ''} es USD ${minimo.toLocaleString('es-AR')} (${pct}%).`;
    if (pct >= cortes.verde) motivos.push(txt + ' Alcanza.');
    else if (pct >= cortes.rojo) { nivel = Math.min(nivel, 1); motivos.push(txt + ' Se puede ajustando: menos días u hoteles 3★.'); }
    else { nivel = 0; motivos.push(txt + ' Ofrecerle otro destino.'); }
  } else if (!m) motivos.push('Destino sin mínimo cargado en Ajustes: revisar a mano.');
  else motivos.push('No dijo cuántos días: no se pudo comparar con el mínimo.');
  if (!d.fechas || VAGAS.test(norm(d.fechas))) { nivel = Math.min(nivel, 1); motivos.push('Fechas vagas.'); }
  if (ctx.soloPrecio) { nivel = Math.max(0, nivel - 1); motivos.push('Pidió "solo el precio".'); }
  if (ctx.confirmaVago) { nivel = Math.min(nivel, 1); motivos.push('No dijo cuándo confirmaría.'); }
  if (ctx.recurrente && nivel === 0) { nivel = 1; motivos.push('Ya es cliente: nunca queda en rojo.'); }
  if (d.preferencia) motivos.push('Le tira más este destino.');
  return { semaforo: NIVEL[nivel], motivo: motivos.join(' ') };
}

module.exports = { DEFAULTS, leer, guardar, todas, evaluar, minimoPara };
