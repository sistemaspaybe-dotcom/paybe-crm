const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = d => d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
const usd = n => n == null || n === '' ? '—' : 'USD ' + Number(n).toLocaleString('es-AR');
const CSS = `
:root{--coral:#D8626B;--coral2:#B84A53;--azul:#2B5C7A;--marino:#1F3A4D;--verde:#1E5A3A;--bruma:#FBF0EC;--linea:#E8DCD6}
*{box-sizing:border-box}body{margin:0;background:var(--bruma);color:var(--marino);font:15px/1.45 Figtree,system-ui,sans-serif}
a{color:var(--azul);text-decoration:none}h1,h2{font-family:Newsreader,Georgia,serif;font-weight:500;margin:0}
nav{background:#fff;border-bottom:1px solid var(--linea);padding:10px 24px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
nav b{color:var(--coral);margin-right:8px}nav a{color:var(--marino);font-weight:600;padding:6px 2px;border-bottom:2px solid transparent}nav a.on{border-color:var(--azul);color:var(--azul)}
nav .sp{flex:1}main{max-width:1100px;margin:0 auto;padding:24px}
.card{background:#fff;border:1px solid var(--linea);border-radius:14px;padding:16px 20px;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
table{width:100%;border-collapse:collapse}th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#5A6670;text-align:left;padding:8px}td{padding:10px 8px;border-top:1px solid #F0E6E1;vertical-align:top}
.chip{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700;background:#E3EEF5;color:var(--azul)}
.chip.op{background:#FBE9E6;color:var(--coral2)}.chip.ve{background:#E0F0E6;color:var(--verde)}.chip.ba{background:#EEE;color:#5A6670}
.btn,button{font:inherit;font-weight:700;border:1px solid var(--linea);background:#fff;color:var(--marino);border-radius:10px;padding:9px 14px;cursor:pointer;display:inline-block}
.btn.p,button.p{background:var(--coral);border-color:var(--coral);color:#fff}.btn.g,button.g{background:var(--verde);border-color:var(--verde);color:#fff}
input,select,textarea{font:inherit;border:1px solid var(--linea);border-radius:10px;padding:9px 10px;background:#FFF8F6;color:var(--marino);width:100%}
label{font-size:12px;font-weight:600;color:#5A6670;display:block;margin-bottom:3px}.f{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.bar{display:flex;gap:3px;margin:8px 0}.bar div{flex:1;text-align:center;padding:10px 6px;font-weight:700;font-size:13px;background:#FBE9E6;color:#5A6670;border-radius:8px}
.bar .ok{background:#E0F0E6;color:var(--verde)}.bar .now{background:var(--verde);color:#fff}
.aviso{background:#FFF3D6;border-radius:12px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center}
.aviso.rojo{background:#FBE4E7}.mut{color:#5A6670;font-size:13px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
pre{white-space:pre-wrap;font:inherit;margin:0}
`;
function layout(titulo, body, { quien, activo } = {}) {
  const tabs = [['/', 'Inicio'], ['/leads', 'Leads'], ['/oportunidades', 'Oportunidades'], ['/ventas', 'Ventas'], ['/personas', 'Personas'], ['/cotizaciones', 'Cotizaciones'], ['/dashboards', 'Dashboards']];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · Paybe CRM</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Newsreader:wght@400;500&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<nav><b>paybe CRM</b>${tabs.map(([h, t]) => `<a href="${h}" class="${activo === h ? 'on' : ''}">${t}</a>`).join('')}<span class="sp"></span><a class="btn p" href="/nuevo">+ Agregar lead</a><span class="mut">${esc(quien || '')} · <a href="/salir">salir</a></span></nav>
<main>${body}</main></body></html>`;
}
const chipFase = f => `<span class="chip ${{ oportunidad: 'op', venta: 've', baja: 'ba' }[f] || ''}">`;
module.exports = { esc, fecha, usd, layout, chipFase };
