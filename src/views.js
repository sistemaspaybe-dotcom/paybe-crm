const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = d => d ? new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : '';
const usd = n => n == null || n === '' ? '—' : 'USD ' + Number(n).toLocaleString('es-AR');
const dinero = (n, mon) => n == null || n === '' ? '—' : (mon === 'ARS' ? '$ ' : 'USD ') + Math.round(Number(n)).toLocaleString('es-AR');
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
  const tabs = [['/', 'Inicio'], ['/leads', 'Leads'], ['/oportunidades', 'Oportunidades'], ['/ventas', 'Ventas'], ['/personas', 'Personas'], ['/cotizaciones', 'Cotizaciones'], ['/dashboards', 'Dashboards'], ['/ajustes', 'Ajustes']];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · Paybe</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Newsreader:wght@400;500&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
${process.env.STAGING === 'true' ? '<div style="background:#8A5A00;color:#fff;text-align:center;font-weight:700;padding:6px">STAGING · entorno de prueba: nada de esto le llega a clientes</div>' : ''}<nav><a href="/" style="display:flex;align-items:center;gap:8px;padding:0"><img src="/logo.png" alt="" style="height:38px" onerror="this.remove()"></a>${tabs.map(([h, t]) => `<a href="${h}" class="${activo === h ? 'on' : ''}">${t}</a>`).join('')}<span class="sp"></span><a class="btn p" href="/nuevo">+ Agregar lead</a><span class="mut">${esc(quien || '')} · <a href="/salir">salir</a></span></nav>
<main>${body}</main></body></html>`;
}
const chipFase = f => `<span class="chip ${{ oportunidad: 'op', venta: 've', baja: 'ba' }[f] || ''}">`;
// fecha de un campo "date" (nacimiento, vencimiento): sin corrimiento de zona horaria y con año
const fechaDia = d => d ? new Date(String(d.toISOString?.().slice(0, 10) || d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
// de dónde viene: el canal del último mensaje, o el origen con que se cargó
const CANALES = { instagram: ['Instagram', '#C13584', '#FCE8F3'], whatsapp: ['WhatsApp', '#128C4B', '#E3F6EA'], mail: ['Mail', '#2B5C8A', '#E3EEF7'], oficina: ['Oficina', '#8A5A00', '#FFF3D6'], otro: ['Cargado a mano', '#5A6670', '#F1F1F1'] };
const canalDeCaso = c => { const x = String(c.u_canal || c.origen || '').toLowerCase(); return x.includes('insta') ? 'instagram' : x.includes('whats') ? 'whatsapp' : x.includes('mail') ? 'mail' : /oficina|tel/.test(x) ? 'oficina' : 'otro'; };
const LOGOS = {
  instagram: '<svg width=28 height=28 viewBox="0 0 24 24"><defs><radialGradient id=ig cx="30%" cy="107%" r="150%"><stop offset="0" stop-color="#fdf497"/><stop offset=".1" stop-color="#fdf497"/><stop offset=".5" stop-color="#fd5949"/><stop offset=".7" stop-color="#d6249f"/><stop offset="1" stop-color="#285AEB"/></radialGradient></defs><rect width=24 height=24 rx=6 fill="url(#ig)"/><rect x=5 y=5 width=14 height=14 rx=4 fill=none stroke=#fff stroke-width=1.8 /><circle cx=12 cy=12 r=3.3 fill=none stroke=#fff stroke-width=1.8 /><circle cx=16.6 cy=7.4 r=1.1 fill=#fff /></svg>',
  whatsapp: '<svg width=28 height=28 viewBox="0 0 24 24"><rect width=24 height=24 rx=6 fill="#25D366"/><path d="M12 4.6a7.3 7.3 0 0 0-6.3 11l-1 3.8 3.9-1A7.3 7.3 0 1 0 12 4.6z" fill=none stroke=#fff stroke-width=1.6 stroke-linejoin=round /><path d="M9.6 8.6c.2-.4.4-.4.6-.4h.4c.2 0 .3.1.4.3l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.1.3 0 .4.5.9 1.2 1.6 2.1 2.1.2.1.3.1.4 0l.5-.6c.1-.2.3-.2.5-.1l1.4.6c.2.1.3.2.3.4 0 .5-.2 1-.6 1.3-.4.3-1 .4-1.5.3-2.1-.6-3.8-2.3-4.4-4.4-.2-.5-.1-1.1.2-1.6z" fill=#fff /></svg>',
  mail: '<svg width=28 height=28 viewBox="0 0 24 24"><rect width=24 height=24 rx=6 fill="#2B5C8A"/><rect x=5 y=7 width=14 height=10 rx=1.5 fill=none stroke=#fff stroke-width=1.6 /><path d="M5.5 7.8 12 12.5l6.5-4.7" fill=none stroke=#fff stroke-width=1.6 /></svg>',
  oficina: '<svg width=28 height=28 viewBox="0 0 24 24"><rect width=24 height=24 rx=6 fill="#C9A227"/><path d="M6 18V9l6-4 6 4v9M10 18v-4h4v4" fill=none stroke=#fff stroke-width=1.7 stroke-linejoin=round /></svg>',
  otro: '<svg width=28 height=28 viewBox="0 0 24 24"><rect width=24 height=24 rx=6 fill="#8A949C"/><path d="M8 16l7.5-7.5 1.5 1.5L9.5 17.5H8z" fill=#fff /></svg>',
};
module.exports = { esc, fecha, fechaDia, usd, dinero, layout, chipFase, CANALES, LOGOS, canalDeCaso };
