-- ============================================================
-- MEDIFLOW - Schema inicial
-- ============================================================
-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ============================================================
-- TIPOS ENUM
-- ============================================================
CREATE TYPE role_tipo AS ENUM ('SUPER_ADMIN', 'ADMIN', 'COORDINADOR', 'MEDICO');
CREATE TYPE medico_tipo AS ENUM ('TITULAR', 'SUPLENTE', 'INDEPENDIENTE');
CREATE TYPE sede_tipo AS ENUM ('SANATORIO', 'FILIAL');
CREATE TYPE canal_tipo AS ENUM ('APP', 'WHATSAPP', 'SMS', 'EMAIL');
CREATE TYPE prioridad_tipo AS ENUM ('NORMAL', 'ALTA');
CREATE TYPE modo_envio AS ENUM ('MASIVO', 'SECUENCIAL');

CREATE TYPE conv_estado AS ENUM (
  'BORRADOR', 'ENVIADA', 'PARCIAL', 'CUBIERTA', 'VENCIDA', 'CANCELADA'
);
CREATE TYPE inv_estado AS ENUM (
  'EN_ESPERA', 'ENVIADA', 'VISTA', 'ACEPTO', 'RECHAZO', 'SIN_RESPUESTA', 'VENCIDA'
);
CREATE TYPE asig_estado AS ENUM (
  'CONFIRMADA', 'CANCELADA_POR_MEDICO', 'REEMPLAZADA', 'CUMPLIDA', 'NO_CUMPLIDA'
);

-- ============================================================
-- PROFILES (extiende auth.users)
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        role_tipo   NOT NULL DEFAULT 'MEDICO',
  display_name TEXT       NOT NULL DEFAULT '',
  -- Si es médico, apunta al registro en medicos
  medico_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEDICOS (catálogo)
-- ============================================================
CREATE TABLE medicos (
  user_id       TEXT        PRIMARY KEY,   -- "CI-xxxx" o "F-xxxx"
  display_name  TEXT        NOT NULL,
  cedula        TEXT,
  funcionario   TEXT,
  especialidad  TEXT,
  telefono      TEXT,
  tipo          medico_tipo NOT NULL DEFAULT 'SUPLENTE',
  prioridad     INTEGER,                   -- NULL = sin prioridad (efectiva = 9999)
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEDES (catálogo)
-- ============================================================
CREATE TABLE sedes (
  id            TEXT        PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  tipo          sede_tipo   NOT NULL DEFAULT 'FILIAL',
  departamento  TEXT,
  direccion     TEXT,
  telefono      TEXT,
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SECTORES (catálogo)
-- ============================================================
CREATE TABLE sectores (
  id            TEXT        PRIMARY KEY,
  nombre        TEXT        NOT NULL,
  color         TEXT,
  activo        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SYSTEM_CONFIG
-- Fila única por organización (id = 'default')
-- ============================================================
CREATE TABLE system_config (
  id            TEXT        PRIMARY KEY DEFAULT 'default',
  organizacion  JSONB       NOT NULL DEFAULT '{
    "nombre": "Organización Médica",
    "whatsappSuplencias": ""
  }'::jsonb,
  fotos         JSONB       NOT NULL DEFAULT '{
    "baseUrl": "",
    "campo": "funcionario",
    "extension": "jpg"
  }'::jsonb,
  canales       JSONB       NOT NULL DEFAULT '{
    "app":      {"enabled": true},
    "whatsapp": {"enabled": true,  "provider": "ENLACE_MANUAL"},
    "sms":      {"enabled": false, "provider": "TWILIO"},
    "email":    {"enabled": false, "provider": "SENDGRID"}
  }'::jsonb,
  default_canales canal_tipo[] NOT NULL DEFAULT ARRAY['APP', 'WHATSAPP']::canal_tipo[],
  convocatorias JSONB       NOT NULL DEFAULT '{
    "defaultModoEnvio": "SECUENCIAL",
    "defaultCupos": 1,
    "defaultSinVerMin": 30,
    "defaultSinResponderMin": 15,
    "defaultPrioridad": "NORMAL"
  }'::jsonb,
  -- Scoring: configuración completa con pesos y parámetros adicionales
  scoring       JSONB       NOT NULL DEFAULT '{
    "enabled": false,
    "periodosDias": 90,
    "pesoAceptacion": 40,
    "pesoVelocidad": 25,
    "pesoPuntualidad": 25,
    "pesoDisponibilidad": 10,
    "reglas": []
  }'::jsonb,
  -- Secrets canales (cifrado a nivel app, no en RLS)
  canal_secrets JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID        REFERENCES auth.users(id)
);

-- Fila inicial
INSERT INTO system_config (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- ============================================================
-- SCORING_REGLAS
-- Cada fila es una regla adicional que pondera el score.
-- El usuario las carga cuando quiera (pending user config).
-- ============================================================
CREATE TABLE scoring_reglas (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        TEXT        NOT NULL,
  descripcion   TEXT,
  -- tipo de criterio: 'SECTOR', 'HORARIO', 'SEDE', 'TURNO_TIPO', 'CUSTOM'
  tipo          TEXT        NOT NULL DEFAULT 'CUSTOM',
  -- condición: JSONB flexible para filtrar convocatorias/invitaciones
  condicion     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- modificador: puede ser un multiplicador (1.2) o puntos adicionales (+5)
  modificador_tipo TEXT     NOT NULL DEFAULT 'MULTIPLICADOR', -- 'MULTIPLICADOR' | 'PUNTOS'
  modificador_valor NUMERIC NOT NULL DEFAULT 1.0,
  activa        BOOLEAN     NOT NULL DEFAULT TRUE,
  orden         INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID        REFERENCES auth.users(id)
);

-- ============================================================
-- CONVOCATORIAS
-- ============================================================
CREATE TABLE convocatorias (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector        TEXT        NOT NULL,
  sede          TEXT,
  inicio        TIMESTAMPTZ NOT NULL,
  fin           TIMESTAMPTZ NOT NULL,
  cupos         INTEGER     NOT NULL DEFAULT 1,
  vencimiento   TIMESTAMPTZ NOT NULL,
  prioridad     prioridad_tipo NOT NULL DEFAULT 'NORMAL',
  notas         TEXT,
  modo_envio    modo_envio  NOT NULL DEFAULT 'SECUENCIAL',
  canales       canal_tipo[] NOT NULL DEFAULT ARRAY['APP']::canal_tipo[],
  timeouts      JSONB       NOT NULL DEFAULT '{"sinVerMin": 30, "sinResponderMin": 15}'::jsonb,
  estado        conv_estado NOT NULL DEFAULT 'ENVIADA',
  cancel_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID        NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_conv_estado      ON convocatorias(estado);
CREATE INDEX idx_conv_inicio      ON convocatorias(inicio);
CREATE INDEX idx_conv_created_at  ON convocatorias(created_at DESC);

-- ============================================================
-- INVITACIONES
-- ============================================================
CREATE TABLE invitaciones (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  convocatoria_id UUID      NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id     TEXT        NOT NULL REFERENCES medicos(user_id),
  estado        inv_estado  NOT NULL DEFAULT 'EN_ESPERA',
  canal         canal_tipo  NOT NULL DEFAULT 'APP',
  orden         INTEGER     NOT NULL DEFAULT 0,  -- para secuencial
  sent_at       TIMESTAMPTZ,
  seen_at       TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inv_conv      ON invitaciones(convocatoria_id);
CREATE INDEX idx_inv_medico    ON invitaciones(medico_id);
CREATE INDEX idx_inv_estado    ON invitaciones(estado);

-- ============================================================
-- ASIGNACIONES
-- ============================================================
CREATE TABLE asignaciones (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  convocatoria_id UUID      NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id     TEXT        NOT NULL REFERENCES medicos(user_id),
  estado        asig_estado NOT NULL DEFAULT 'CONFIRMADA',
  horas         NUMERIC,
  cierre_nota   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  created_by    UUID        REFERENCES auth.users(id)
);

CREATE INDEX idx_asig_conv   ON asignaciones(convocatoria_id);
CREATE INDEX idx_asig_medico ON asignaciones(medico_id);

-- ============================================================
-- SCORES_CACHE
-- Caché de scores calculados (se recalcula con pg_cron)
-- ============================================================
CREATE TABLE scores_cache (
  medico_id         TEXT        PRIMARY KEY REFERENCES medicos(user_id) ON DELETE CASCADE,
  score             NUMERIC     NOT NULL DEFAULT 0,
  pct_aceptacion    NUMERIC     NOT NULL DEFAULT 0,
  pct_velocidad     NUMERIC     NOT NULL DEFAULT 0,
  pct_puntualidad   NUMERIC     NOT NULL DEFAULT 0,
  pct_disponibilidad NUMERIC    NOT NULL DEFAULT 0,
  inv_total         INTEGER     NOT NULL DEFAULT 0,
  calculated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- UPDATED_AT triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_medicos_updated_at
  BEFORE UPDATE ON medicos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_convocatorias_updated_at
  BEFORE UPDATE ON convocatorias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
