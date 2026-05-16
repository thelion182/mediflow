-- ─────────────────────────────────────────────────────────────────────────
-- Mediflow — Schema inicial
-- Enfoque local-first: cada tabla almacena el objeto completo en `data JSONB`
-- con una PK mínima para upserts eficientes desde el cliente.
-- ─────────────────────────────────────────────────────────────────────────

-- Médicos
create table if not exists medicos (
  "userId"   text primary key,
  data       jsonb not null,
  synced_at  timestamptz default now()
);

-- Convocatorias (incluye invitaciones y asignaciones como JSONB anidado)
create table if not exists convocatorias (
  id        text primary key,
  data      jsonb not null,
  synced_at timestamptz default now()
);

-- Sectores
create table if not exists sectores (
  id        text primary key,
  data      jsonb not null,
  synced_at timestamptz default now()
);

-- Sedes
create table if not exists sedes (
  id        text primary key,
  data      jsonb not null,
  synced_at timestamptz default now()
);

-- Guardias fijas (patrones + turnos como JSONB)
create table if not exists guardias_fijas (
  id        text primary key,
  data      jsonb not null,
  synced_at timestamptz default now()
);

-- Especialidades (mapa nombre → ícono)
create table if not exists especialidades (
  nombre text primary key,
  icono  text not null
);

-- Configuración del sistema (fila única, id=1)
create table if not exists system_config (
  id   integer primary key default 1,
  data jsonb not null
);

-- Auditoría de prioridad manual
create table if not exists prio_audit (
  id        text primary key,
  data      jsonb not null,
  synced_at timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────
-- Política permisiva para herramienta interna.
-- En producción: reemplazar con políticas basadas en JWT/roles.

alter table medicos        enable row level security;
alter table convocatorias  enable row level security;
alter table sectores       enable row level security;
alter table sedes          enable row level security;
alter table guardias_fijas enable row level security;
alter table especialidades enable row level security;
alter table system_config  enable row level security;
alter table prio_audit     enable row level security;

create policy "allow_all" on medicos        for all using (true) with check (true);
create policy "allow_all" on convocatorias  for all using (true) with check (true);
create policy "allow_all" on sectores       for all using (true) with check (true);
create policy "allow_all" on sedes          for all using (true) with check (true);
create policy "allow_all" on guardias_fijas for all using (true) with check (true);
create policy "allow_all" on especialidades for all using (true) with check (true);
create policy "allow_all" on system_config  for all using (true) with check (true);
create policy "allow_all" on prio_audit     for all using (true) with check (true);

-- ── Índices útiles para queries futuras ──────────────────────────────────
create index if not exists idx_convocatorias_estado
  on convocatorias ((data->>'estado'));

create index if not exists idx_convocatorias_inicio
  on convocatorias (((data->>'inicio')::timestamptz));

create index if not exists idx_medicos_activo
  on medicos (((data->>'activo')::boolean));
