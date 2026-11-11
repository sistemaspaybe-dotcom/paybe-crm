// Fases y etapas del CRM (V0, todo manual). Cada acción mueve el caso a otra etapa.
const FASES = {
  lead: { nombre: 'Lead', etapas: { nuevo: 'Nuevo', preguntando: 'Preguntando', para_cotizar: 'Para cotizar', mandada: 'Mandada' } },
  oportunidad: { nombre: 'Oportunidad', etapas: { le_intereso: 'Le interesó', falta_sena: 'Falta la seña', sena_pagada: 'Seña pagada' } },
  venta: { nombre: 'Venta', etapas: { sena: 'Seña', saldo: 'Saldo', previaje: 'Pre-viaje', viaja: 'Viaja', fin: 'Fin de viaje' } },
  baja: { nombre: 'Dada de baja', etapas: { baja: 'Dada de baja' } },
};
// acciones: clave -> { desde:[fase.etapa], a:[fase,etapa], label, log, pide? }
const ACCIONES = {
  preguntas: { desde: 'lead.nuevo', a: ['lead', 'preguntando'], label: 'Ya le mandé las preguntas', log: 'Se mandaron las preguntas. Pasa a Preguntando.' },
  contesto: { desde: 'lead.preguntando', a: ['lead', 'para_cotizar'], label: 'Contestó todo', log: 'Contestó todo. Pasa a Para cotizar.' },
  mandada: { desde: 'lead.para_cotizar', a: ['lead', 'mandada'], label: 'Ya se la mandé', log: 'Se mandó la cotización. Pasa a Mandada.', aviso: [3, 'Chequear si contestó la cotización'] },
  convertir: { desde: 'lead.mandada', a: ['oportunidad', 'le_intereso'], label: 'Convertir en oportunidad', log: 'Dijo que sí. Pasa a Oportunidad.' },
  datos_sena: { desde: 'oportunidad.le_intereso', a: ['oportunidad', 'falta_sena'], label: 'Ya le mandé los datos de la seña', log: 'Se mandaron los datos para la seña.', aviso: [2, 'Reclamar la seña'] },
  sena: { desde: 'oportunidad.falta_sena', a: ['oportunidad', 'sena_pagada'], label: 'Llegó la seña', log: 'Llegó la seña.', pago: 'Seña' },
  a_venta: { desde: 'oportunidad.sena_pagada', a: ['venta', 'sena'], label: 'Pasar a Venta', log: 'Pasó a Venta.' },
  reservado: { desde: 'venta.sena', a: ['venta', 'saldo'], label: 'Ya reservé todo', log: 'Todo reservado. Pasa a Saldo.', aviso: [5, 'Recordar el saldo'] },
  saldo: { desde: 'venta.saldo', a: ['venta', 'previaje'], label: 'Llegó el saldo', log: 'Llegó el saldo. Pasa a Pre-viaje.', pago: 'Saldo' },
  salio: { desde: 'venta.previaje', a: ['venta', 'viaja'], label: 'Salieron de viaje', log: 'Están viajando.' },
  volvio: { desde: 'venta.viaja', a: ['venta', 'fin'], label: 'Volvieron', log: 'Volvieron. Mandar la encuesta.', aviso: [1, 'Mandar la encuesta y pedir la reseña'] },
};
const BAJAS = { lead: 'Cerrar lead', oportunidad: 'No va', venta: null };
const MOTIVOS = ['Precio', 'Fechas', 'No contestó más', 'Lo compró en otro lado', 'Cambió de idea', 'Otro'];
const key = c => `${c.fase}.${c.etapa}`;
const accionesPara = c => Object.entries(ACCIONES).filter(([, a]) => a.desde === key(c)).map(([k, a]) => ({ k, ...a }));
module.exports = { FASES, ACCIONES, BAJAS, MOTIVOS, accionesPara };
