// Contestarle al cliente por el canal por el que escribió (Instagram o WhatsApp).
// Las dos plataformas dejan mandar desde el CRM solo dentro de las 24 h de su último mensaje.
const { one } = require('./db');

const NOMBRES = { instagram: 'Instagram', whatsapp: 'WhatsApp' };

async function canalDe(casoId) {
  const m = await one(`select m.canal, m.creado, p.instagram_id, p.whatsapp from mensajes m join personas p on p.id=m.persona_id
    where m.caso_id=$1 and m.entrante and m.canal in ('instagram','whatsapp') order by m.creado desc limit 1`, [casoId]);
  if (!m) return null;
  const destino = m.canal === 'instagram' ? m.instagram_id : m.whatsapp;
  const conectado = m.canal === 'instagram' || !!process.env.YCLOUD_API_KEY || String(destino).startsWith('demo-');
  return { canal: m.canal, nombre: NOMBRES[m.canal], destino, ventana: Date.now() - new Date(m.creado) < 24 * 3600e3, puede: !!destino && conectado && Date.now() - new Date(m.creado) < 24 * 3600e3 };
}

async function enviar(casoId, texto) {
  const k = await canalDe(casoId);
  if (!k || !k.puede) throw new Error(k && !k.ventana ? `pasaron más de 24 h desde su último mensaje por ${k.nombre}` : 'no hay un chat abierto para contestarle');
  const cuando = new Date();
  if (k.canal === 'instagram') {
    const ig = require('./instagram');
    const mid = await ig.enviar(k.destino, texto);
    await ig.enCola(() => ig.registrar({ igsid: k.destino, mid: mid || 'crm-' + Date.now(), entrante: false, texto, cuando }));
  } else {
    const wa = require('./whatsapp');
    const mid = await wa.enviar(k.destino, texto);
    await wa.enCola(() => wa.registrar({ tel: k.destino, mid: mid || 'crm-' + Date.now(), entrante: false, texto, cuando }));
  }
  return k.nombre;
}

module.exports = { canalDe, enviar, NOMBRES };
