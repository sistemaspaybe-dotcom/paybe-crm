// Fases y etapas del CRM. Las etapas avanzan solas con lo que hace el equipo o el cliente.
// Un lead termina Convertido (pasa a Oportunidad) o Perdido (baja con motivo).
const FASES = {
  lead: { nombre: 'Lead', etapas: { nuevo: 'Nuevo', preguntando: 'Preguntando', aguardando: 'Aguardando datos', para_cotizar: 'Para cotizar', cotizando: 'Cotizando', esperando: 'Esperando respuesta', recotizar: 'Recotizar' } },
  oportunidad: { nombre: 'Oportunidad', etapas: { le_intereso: 'Le interesó', falta_sena: 'Falta la seña', sena_pagada: 'Seña pagada' } },
  venta: { nombre: 'Venta', etapas: { reservando: 'Reservando', saldo: 'Saldo', previaje: 'Pre-viaje', viaja: 'Viajando', fin: 'Volvieron' } },
  baja: { nombre: 'Perdido', etapas: { baja: 'Perdido' } },
};
// acciones de un toque: clave -> { desde, a:[fase,etapa], label, log, pago?, aviso? }
const ACCIONES = {
  datos_sena: { desde: 'oportunidad.le_intereso', a: ['oportunidad', 'falta_sena'], label: 'Ya le mandé los datos de la seña', log: 'Se mandaron los datos para la seña. Si en 3 días no llega, se arma un mensaje para preguntarle si sigue.' },
  sena: { desde: 'oportunidad.falta_sena', a: ['oportunidad', 'sena_pagada'], label: 'Llegó la seña', log: 'Llegó la seña.', pago: 'Seña' },
  a_venta: { desde: 'oportunidad.sena_pagada', a: ['venta', 'reservando'], label: 'Pasar a Venta', log: 'Pasó a Venta.' },
  reservado: { desde: 'venta.reservando', a: ['venta', 'saldo'], label: 'Ya reservé todo', log: 'Todo reservado. Pasa a Saldo.', aviso: [5, 'Recordar el saldo'] },
  saldo: { desde: 'venta.saldo', a: ['venta', 'previaje'], label: 'Llegó el saldo', log: 'Llegó el saldo. Pasa a Pre-viaje.', pago: 'Saldo' },
  salio: { desde: 'venta.previaje', a: ['venta', 'viaja'], label: 'Salieron de viaje', log: 'Están viajando.' },
  volvio: { desde: 'venta.viaja', a: ['venta', 'fin'], label: 'Volvieron', log: 'Volvieron. Mandar la encuesta.', aviso: [1, 'Mandar la encuesta y pedir la reseña'] },
};
// formas de pago (24/11). Transferencia y depósito piden el comprobante
const MEDIOS = ['Transferencia', 'Depósito', 'Efectivo en la agencia'];
const PIDE_COMPROBANTE = ['Transferencia', 'Depósito'];
const BAJAS = { lead: 'Perdido (no va)', oportunidad: 'Perdido (no va)', venta: null };
const MOTIVOS = ['Precio', 'Fechas', 'No contestó más', 'Lo compró en otro lado', 'Cambió de idea', 'Presupuesto bajo para el destino', 'Otro'];
// estados de cada destino adentro de la consulta
const ESTADOS_DESTINO = { pendiente: 'Faltan datos', semaforo: 'Para decidir', cotizando: 'Cotizando', cotizado: 'Cotizado', eligio: 'Eligió ✓', no_eligio: 'No eligió', descartado: 'Descartado' };
const key = c => `${c.fase}.${c.etapa}`;
const accionesPara = c => Object.entries(ACCIONES).filter(([, a]) => a.desde === key(c)).map(([k, a]) => ({ k, ...a }));
module.exports = { FASES, ACCIONES, BAJAS, MOTIVOS, ESTADOS_DESTINO, MEDIOS, PIDE_COMPROBANTE, accionesPara };
