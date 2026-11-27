const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const { AsyncLocalStorage } = require('async_hooks');
// Quién está haciendo cada cosa (equipo, Instagram, WhatsApp, automático). Lo leen los triggers del registro.
const contexto = new AsyncLocalStorage();
const ESCRIBE = /^\s*(insert|update|delete|with)\b/i;
async function query(sql, p) {
  const c = contexto.getStore();
  if (!c || !ESCRIBE.test(sql)) return pool.query(sql, p);
  const cli = await pool.connect();
  try {
    await cli.query('begin');
    await cli.query(`select set_config('app.quien',$1,true), set_config('app.origen',$2,true), set_config('app.ruta',$3,true), set_config('app.req',$4,true)`,
      [c.quien || '', c.origen || '', c.ruta || '', c.req || '']);
    const r = await cli.query(sql, p);
    await cli.query('commit');
    return r;
  } catch (e) { await cli.query('rollback').catch(() => {}); throw e; } finally { cli.release(); }
}
const q = (sql, p) => query(sql, p).then(r => r.rows);
const one = (sql, p) => q(sql, p).then(r => r[0]);

const SCHEMA = `
create table if not exists personas (
  id serial primary key, nombre text not null, whatsapp text, mail text, origen text,
  notas text, creada timestamptz default now());
create table if not exists casos (
  id serial primary key, persona_id int references personas(id) on delete cascade,
  fase text not null default 'lead', etapa text not null default 'nuevo',
  destino text, servicio text, fechas text, cuantos text, presupuesto text,
  total numeric, resumen text, motivo_baja text, baja_desde text,
  sale date, vuelve date, creado timestamptz default now(), actualizado timestamptz default now());
create table if not exists cotizaciones (
  id serial primary key, caso_id int references casos(id) on delete set null,
  viaje text not null, mandada date default current_date, viaja text, cuantos text,
  precio_pp numeric, margen numeric, resultado text default 'sin respuesta', detalle text,
  creada timestamptz default now());
create table if not exists avisos (
  id serial primary key, caso_id int references casos(id) on delete cascade,
  para date not null, texto text not null, hecho boolean default false, creado timestamptz default now());
create table if not exists chats (
  id serial primary key, caso_id int references casos(id) on delete cascade,
  texto text not null, resumen text, creado timestamptz default now());
create table if not exists actividad (
  id serial primary key, caso_id int references casos(id) on delete cascade,
  quien text, texto text not null, creada timestamptz default now());
create table if not exists pagos (
  id serial primary key, caso_id int references casos(id) on delete cascade,
  que text not null, monto numeric, medio text, fecha date default current_date);
create table if not exists reservas (
  id serial primary key, caso_id int references casos(id) on delete cascade,
  servicio text not null, estado text default 'pendiente');
alter table personas add column if not exists instagram_id text;
alter table personas add column if not exists instagram_user text;
create unique index if not exists personas_instagram_id on personas(instagram_id);
create table if not exists mensajes (
  id serial primary key, persona_id int references personas(id) on delete cascade,
  caso_id int references casos(id) on delete set null, canal text not null default 'instagram',
  mid text unique, entrante boolean not null, texto text, creado timestamptz default now());
create index if not exists mensajes_caso on mensajes(caso_id, creado);
alter table mensajes add column if not exists auto text; -- 'saludo': respuesta automática a un "Hola" (no cuenta como que el equipo contestó)
create table if not exists ajustes (clave text primary key, valor text);
alter table casos add column if not exists borrador text;
alter table casos add column if not exists borrador_tipo text;
alter table casos add column if not exists borrador_en timestamptz;
alter table casos add column if not exists tipo_destinos text;
alter table casos add column if not exists salida text;
alter table casos add column if not exists confirma text;
alter table casos add column if not exists senales text;
alter table casos add column if not exists preguntas_en timestamptz;
alter table casos add column if not exists recordatorio_en timestamptz;
alter table casos add column if not exists cotizando_por text;
alter table casos add column if not exists cotizando_desde timestamptz;
alter table casos add column if not exists viene_de int;
create table if not exists destinos (
  id serial primary key, caso_id int references casos(id) on delete cascade, nombre text not null,
  fechas text, dias int, detalle text, presupuesto text, presupuesto_usd numeric, preferencia text,
  semaforo text, motivo text, estado text not null default 'pendiente', creado timestamptz default now());
create index if not exists destinos_caso on destinos(caso_id);
alter table cotizaciones add column if not exists destino_id int references destinos(id) on delete set null;
alter table cotizaciones add column if not exists version int default 1;
alter table cotizaciones add column if not exists estado text;
alter table cotizaciones add column if not exists items jsonb default '[]';
alter table cotizaciones add column if not exists costo_pp numeric;
alter table cotizaciones add column if not exists sena_pct numeric default 20;
alter table cotizaciones add column if not exists valida_hasta date;
alter table cotizaciones add column if not exists no_incluye text;
alter table cotizaciones add column if not exists token text;
alter table cotizaciones add column if not exists mandada_por text;
alter table cotizaciones add column if not exists aviso_vence_en timestamptz;
alter table personas add column if not exists nacimiento date;
alter table personas add column if not exists documento text;
alter table reservas add column if not exists proveedor text;
alter table reservas add column if not exists link text;
alter table reservas add column if not exists codigo text;
alter table reservas add column if not exists reservada_en timestamptz;
alter table casos add column if not exists sugerencia text;
alter table casos add column if not exists sugerencia_por text;
create table if not exists caso_pasajeros (caso_id int, persona_id int, creado timestamptz default now(), primary key (caso_id, persona_id));
create table if not exists documentos (id serial primary key, persona_id int, caso_id int, tipo text, nombre text, mime text, datos bytea, vence date, creado timestamptz default now());
create table if not exists comprobantes (id serial primary key, caso_id int, pago_id int, nombre text, tipo text, datos bytea, creado timestamptz default now());
alter table cotizaciones add column if not exists base_id int;
alter table cotizaciones add column if not exists inicio timestamptz;
alter table cotizaciones add column if not exists enviada_en timestamptz;
alter table cotizaciones add column if not exists quien text;
create unique index if not exists cotizaciones_token on cotizaciones(token);
update cotizaciones set estado='mandada' where estado is null;
alter table cotizaciones alter column estado set default 'borrador';
create table if not exists conversaciones (
  id serial primary key, persona_id int references personas(id) on delete cascade, canal text not null,
  cerrada text, cerrada_en timestamptz, cerrada_por text, ultimo_en timestamptz default now(), creada timestamptz default now(),
  unique (persona_id, canal));
insert into conversaciones(persona_id, canal, ultimo_en) select persona_id, canal, max(creado) from mensajes where persona_id is not null group by 1,2 on conflict do nothing;
alter table casos add column if not exists ocasion text;
alter table casos add column if not exists categoria text;
alter table casos add column if not exists atendio text;
alter table casos add column if not exists datos_sena_en timestamptz;
alter table casos add column if not exists sena_seguimiento_en timestamptz;
alter table cotizaciones add column if not exists moneda text default 'USD';
alter table cotizaciones alter column sena_pct set default 50;
alter table pagos add column if not exists moneda text default 'USD';
alter table pagos add column if not exists comprobante boolean default true;
alter table personas add column if not exists personal boolean default false;
alter table conversaciones add column if not exists motivo text;
alter table casos add column if not exists repreguntas int default 0;
alter table destinos add column if not exists ciudades jsonb;
alter table destinos add column if not exists desde date;
alter table destinos add column if not exists hasta date;
alter table destinos add column if not exists salida text;
alter table destinos add column if not exists fechas_tipo text;
alter table destinos add column if not exists mes text;
alter table casos add column if not exists adultos int;
alter table casos add column if not exists menores int;
-- un aviso pendiente no se repite: si ya hay uno igual para la misma consulta, no se crea otro
delete from avisos a using avisos b where not a.hecho and not b.hecho and a.caso_id=b.caso_id and a.texto=b.texto and a.id>b.id;
create or replace function aviso_sin_repetir() returns trigger as $f$ begin
  if exists (select 1 from avisos where caso_id=new.caso_id and texto=new.texto and not hecho) then return null; end if;
  return new; end $f$ language plpgsql;
drop trigger if exists aviso_sin_repetir on avisos;
create trigger aviso_sin_repetir before insert on avisos for each row execute function aviso_sin_repetir();
`;
// ---- Registro (auditoría): todo cambio en cualquier tabla queda guardado, con quién, desde dónde y qué cambió ----
const REGISTRO = `
create table if not exists log_cambios (
  id bigserial primary key, en timestamptz not null default now(), quien text, origen text, ruta text, req text,
  tabla text not null, op text not null, fila_id text, caso_id int, persona_id int,
  antes jsonb, despues jsonb, cambios jsonb);
create index if not exists log_cambios_en on log_cambios(en desc);
create index if not exists log_cambios_caso on log_cambios(caso_id, en desc);
create index if not exists log_cambios_persona on log_cambios(persona_id, en desc);
create index if not exists log_cambios_tabla on log_cambios(tabla, fila_id);
create table if not exists log_acciones (
  id bigserial primary key, en timestamptz not null default now(), req text, quien text, origen text,
  metodo text, ruta text, datos jsonb, estado int, ms int, ip text, navegador text);
create index if not exists log_acciones_en on log_acciones(en desc);
create index if not exists log_acciones_quien on log_acciones(quien, en desc);
create or replace function registrar_cambio() returns trigger as $f$
declare a jsonb; d jsonb; ch jsonb; fila jsonb;
  vquien text := nullif(current_setting('app.quien', true), '');
  vorigen text := coalesce(nullif(current_setting('app.origen', true), ''), 'sistema');
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old) - 'datos'; end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new) - 'datos'; end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', a->k, 'despues', d->k)) into ch
      from jsonb_object_keys(d) as k where (a->k) is distinct from (d->k) and k <> 'actualizado';
    if ch is null then return null; end if; -- no cambió nada de verdad
  end if;
  -- la sincronización de Instagram/WhatsApp guarda marcas de tiempo en ajustes cada pocos minutos: eso no es una acción
  if tg_table_name = 'ajustes' and vquien is null and vorigen = 'sistema' then return null; end if;
  fila := coalesce(d, a);
  insert into log_cambios(quien, origen, ruta, req, tabla, op, fila_id, caso_id, persona_id, antes, despues, cambios)
  values (vquien, vorigen, nullif(current_setting('app.ruta', true), ''), nullif(current_setting('app.req', true), ''),
    tg_table_name, lower(tg_op),
    coalesce(fila->>'id', fila->>'clave', concat_ws('-', fila->>'caso_id', fila->>'persona_id')),
    case when tg_table_name = 'casos' then (fila->>'id')::int else (fila->>'caso_id')::int end,
    case when tg_table_name = 'personas' then (fila->>'id')::int else (fila->>'persona_id')::int end,
    case when tg_op = 'UPDATE' then null else a end, case when tg_op = 'UPDATE' then null else d end, ch);
  return null;
exception when others then
  raise warning 'registro: %', sqlerrm; return null; -- el registro nunca frena el trabajo del equipo
end $f$ language plpgsql;
create or replace function registro_inmutable() returns trigger as $f$ begin
  raise exception 'El registro no se puede modificar ni borrar'; end $f$ language plpgsql;
drop trigger if exists registro_inmutable on log_cambios;
create trigger registro_inmutable before update or delete on log_cambios for each row execute function registro_inmutable();
drop trigger if exists registro_inmutable on log_acciones;
create trigger registro_inmutable before update or delete on log_acciones for each row execute function registro_inmutable();
do $d$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = current_schema() and tablename not in ('log_cambios', 'log_acciones') loop
    execute format('drop trigger if exists zz_registro on %I', t);
    execute format('create trigger zz_registro after insert or update or delete on %I for each row execute function registrar_cambio()', t);
  end loop; end $d$;
`;
// cambios de etapas de una sola vez (17/11): Mandada pasa a Esperando respuesta; el viejo Preguntando (ya contestaron) es Aguardando datos
async function migrar() {
  const hecho = await one("select 1 from ajustes where clave='migracion_etapas_v4'");
  if (hecho) return;
  await q("update casos set etapa='esperando' where fase='lead' and etapa='mandada'");
  await q("update casos set etapa='aguardando' where fase='lead' and etapa='preguntando'");
  await q("update casos set etapa='reservando' where fase='venta' and etapa='sena'");
  await q("update casos set baja_desde='lead' where fase='baja' and baja_desde is null");
  await q(`insert into destinos(caso_id,nombre,fechas,presupuesto,estado) select id, destino, fechas, presupuesto, case when fase='lead' then 'pendiente' else 'eligio' end from casos c where destino is not null and destino<>'' and not exists (select 1 from destinos d where d.caso_id=c.id)`);
  await q("insert into ajustes(clave,valor) values('migracion_etapas_v4', now()::text)");
}
async function limpiezas() {
  // 27/11, una sola vez: borrar las pruebas que pidió Sofi (demo 🧪 y sus chats de prueba en Instagram y WhatsApp).
  // Solo si el caso es de una persona con ese nombre, para no tocar nada más.
  if (!await one("select 1 from ajustes where clave='limpieza_pruebas_2711'")) {
    await q(`delete from cotizaciones where caso_id in (select c.id from casos c join personas p on p.id=c.persona_id where p.origen='Demo')`);
    await q(`delete from personas where origen='Demo'`);
    const ps = await q(`select distinct p.id from casos c join personas p on p.id=c.persona_id where c.id in (1,20,22,34) and p.nombre in ('Sofia','Sopia') and c.fase='lead'`);
    for (const { id } of ps) {
      await q(`delete from cotizaciones where caso_id in (select id from casos where persona_id=$1)`, [id]);
      await q('delete from mensajes where persona_id=$1', [id]);
      await q('delete from personas where id=$1', [id]);
    }
    await q("insert into ajustes(clave,valor) values('limpieza_pruebas_2711', $1)", [String(ps.length)]);
  }
}
module.exports = { pool, q, one, contexto, init: () => pool.query(SCHEMA).then(() => pool.query(REGISTRO)).then(migrar).then(limpiezas) };
