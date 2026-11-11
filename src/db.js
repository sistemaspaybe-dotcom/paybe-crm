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
`;
module.exports = { pool, q, one, init: () => pool.query(SCHEMA) };
