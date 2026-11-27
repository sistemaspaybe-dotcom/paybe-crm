const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const q = (sql, p) => pool.query(sql, p).then(r => r.rows);
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
module.exports = { pool, q, one, init: () => pool.query(SCHEMA).then(migrar) };
