# MediFlow — Guía de Implementación Backend

> Guía técnica completa para implementar el backend de MediFlow con Supabase.
> El frontend actual funciona 100% con localStorage como mock.
> Al conectar el backend, solo se reemplazan los stores internos — la UI no cambia.

---

## 1. Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                   FRONTEND (React + Vite)                │
│  Dashboard · Nueva Conv · Parte Diario · Reportes        │
│  Config · Admin · MedicoHome · Login                     │
└───────────────────┬─────────────────────────────────────┘
                    │ HTTPS / JWT
┌───────────────────▼─────────────────────────────────────┐
│              SUPABASE (BaaS)                             │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  Auth (JWT)  │  │ Edge Functions│  │  PostgreSQL 15 │ │
│  │  custom claims│  │  (Deno/TS)   │  │  + RLS + cron  │ │
│  └──────────────┘  └──────┬───────┘  └────────────────┘ │
│                           │                              │
│  ┌────────────────────────▼──────────────────────────┐  │
│  │             Realtime (WebSocket → UI)              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                              │
┌────────▼──────────┐      ┌────────────▼──────────────────┐
│  Canales salientes│      │  Webhooks entrantes            │
│  Twilio SMS/WA    │      │  /webhooks/whatsapp            │
│  Meta WA API      │      │  /webhooks/twilio-sms          │
│  SendGrid / Resend│      │  (respuestas de médicos)       │
│  SMTP             │      └────────────────────────────────┘
└───────────────────┘
```

### Alternativas al stack Supabase

| Componente | Supabase (recomendado) | Alternativa A | Alternativa B |
|-----------|----------------------|---------------|---------------|
| DB | PostgreSQL en Supabase | Railway PostgreSQL | AWS RDS |
| Auth | Supabase Auth | Auth0 / Clerk | JWT propio |
| API | Edge Functions (Deno) | Express.js en Node | Fastify / Hono |
| Cron | pg_cron (en DB) | Upstash QStash | AWS EventBridge |
| Realtime | Supabase Realtime | Ably | Socket.io propio |
| Deploy | Supabase CLI | Vercel + Neon | Fly.io |

---

## 2. Roles y autenticación

### Roles del sistema

```
SUPER_ADMIN  → todo: config global, hard delete, auditoría, gestión de usuarios
ADMIN        → catálogos, médicos, sedes, sectores, reportes
COORDINADOR  → dashboard, nueva convocatoria, parte diario, reportes básicos
MEDICO       → solo sus convocatorias activas (acepta/rechaza)
```

### JWT con custom claims

Supabase guarda el rol en `raw_app_meta_data`:
```json
{
  "role": "COORDINADOR",
  "userId": "F-1001",
  "displayName": "Dr. Juan García"
}
```

Para asignar claims al crear un usuario:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'role', 'COORDINADOR',
  'userId', 'F-1001',
  'displayName', 'Dr. Juan García'
)
WHERE email = 'juan@hospital.com.uy';
```

### Middleware Edge Function

```typescript
// _shared/auth.ts
import { createClient } from "@supabase/supabase-js";

export async function getSession(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) throw new Response("Unauthorized", { status: 401 });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Response("Unauthorized", { status: 401 });

  const meta = user.user_metadata ?? user.app_metadata ?? {};
  return {
    userId:      meta.userId      as string,
    role:        meta.role        as "SUPER_ADMIN" | "ADMIN" | "COORDINADOR" | "MEDICO",
    displayName: meta.displayName as string,
    email:       user.email,
  };
}

export function requireRole(session: { role: string }, minRole: string) {
  const levels = { MEDICO: 0, COORDINADOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
  if ((levels as any)[session.role] < (levels as any)[minRole])
    throw new Response("Forbidden", { status: 403 });
}
```

---

## 3. Esquema de base de datos

### `profiles` — usuarios del sistema

```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id       TEXT UNIQUE NOT NULL,       -- "F-1001", "CI-48206484"
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','COORDINADOR','MEDICO')),
  cedula        TEXT,
  funcionario   TEXT,
  telefono      TEXT,
  email         TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `medicos` — catálogo de médicos (pueden o no ser usuarios del sistema)

```sql
CREATE TABLE medicos (
  user_id       TEXT PRIMARY KEY,           -- "F-93598" | "CI-48206484"
  display_name  TEXT NOT NULL,
  cedula        TEXT,
  funcionario   TEXT,
  especialidad  TEXT,
  tipo          TEXT NOT NULL DEFAULT 'SUPLENTE'
                CHECK (tipo IN ('TITULAR', 'SUPLENTE', 'INDEPENDIENTE')),
  prioridad     INT,
  telefono      TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  foto_url      TEXT,                        -- URL directa o calculada desde base_url + campo
  score         NUMERIC(5,2) DEFAULT 0,      -- 0–100 calculado periódicamente
  score_updated_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON medicos(tipo);
CREATE INDEX ON medicos(prioridad);
CREATE INDEX ON medicos(activo) WHERE activo = TRUE;
```

### `sedes`

```sql
CREATE TABLE sedes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT UNIQUE NOT NULL,
  tipo          TEXT NOT NULL CHECK (tipo IN ('SANATORIO','FILIAL','POLICLINICA','OTRO')),
  departamento  TEXT NOT NULL DEFAULT 'Montevideo',
  direccion     TEXT,
  telefono      TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `sectores`

```sql
CREATE TABLE sectores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT UNIQUE NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  descripcion   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `convocatorias`

```sql
CREATE TABLE convocatorias (
  id                    TEXT PRIMARY KEY,    -- "C-abc123"
  sector                TEXT NOT NULL,
  sede                  TEXT,
  inicio                TIMESTAMPTZ NOT NULL,
  fin                   TIMESTAMPTZ NOT NULL,
  cupos                 INT NOT NULL DEFAULT 1,
  vencimiento           TIMESTAMPTZ NOT NULL,
  prioridad             TEXT NOT NULL DEFAULT 'NORMAL'
                        CHECK (prioridad IN ('NORMAL','ALTA')),
  notas                 TEXT,
  modo_envio            TEXT NOT NULL DEFAULT 'MASIVO'
                        CHECK (modo_envio IN ('MASIVO','SECUENCIAL')),
  canales               TEXT[] NOT NULL DEFAULT '{APP}',
  timeout_sin_ver_min   INT NOT NULL DEFAULT 60,
  timeout_sin_resp_min  INT NOT NULL DEFAULT 60,
  estado                TEXT NOT NULL DEFAULT 'ENVIADA'
                        CHECK (estado IN ('BORRADOR','ENVIADA','PARCIAL','CUBIERTA','VENCIDA','CANCELADA')),
  cancel_reason         TEXT,

  -- Auto-renovación
  auto_renew            BOOLEAN NOT NULL DEFAULT FALSE,
  auto_renew_minutes    INT DEFAULT 60,
  auto_renew_max_count  INT DEFAULT 3,
  auto_renew_count      INT NOT NULL DEFAULT 0,

  -- Modo de priorización
  prio_mode             TEXT DEFAULT 'SCORING'
                        CHECK (prio_mode IN ('SCORING','MANUAL')),

  created_by            TEXT NOT NULL,        -- user_id del coordinador
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON convocatorias(estado);
CREATE INDEX ON convocatorias(inicio);
CREATE INDEX ON convocatorias(created_by);
CREATE INDEX ON convocatorias(sector);
```

### `invitaciones`

```sql
CREATE TABLE invitaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id   TEXT NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id         TEXT NOT NULL REFERENCES medicos(user_id),
  estado            TEXT NOT NULL DEFAULT 'EN_ESPERA'
                    CHECK (estado IN ('EN_ESPERA','ENVIADA','VISTA','ACEPTO','RECHAZO','SIN_RESPUESTA','VENCIDA')),
  canal             TEXT NOT NULL DEFAULT 'APP'
                    CHECK (canal IN ('APP','WHATSAPP','SMS','EMAIL')),
  orden             INT NOT NULL DEFAULT 0,    -- posición en lista secuencial
  sent_at           TIMESTAMPTZ,
  seen_at           TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON invitaciones(convocatoria_id);
CREATE INDEX ON invitaciones(medico_id);
CREATE INDEX ON invitaciones(estado);
-- Para el cron: buscar invitaciones expiradas rápido
CREATE INDEX ON invitaciones(estado, sent_at) WHERE estado = 'ENVIADA';
CREATE INDEX ON invitaciones(estado, seen_at)  WHERE estado = 'VISTA';
```

### `asignaciones`

```sql
CREATE TABLE asignaciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id   TEXT NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id         TEXT NOT NULL REFERENCES medicos(user_id),
  estado            TEXT NOT NULL DEFAULT 'CONFIRMADA'
                    CHECK (estado IN ('CONFIRMADA','CANCELADA_POR_MEDICO','REEMPLAZADA','CUMPLIDA','NO_CUMPLIDA')),
  horas             NUMERIC(5,2),
  cierre_nota       TEXT,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON asignaciones(convocatoria_id);
CREATE INDEX ON asignaciones(medico_id);
CREATE INDEX ON asignaciones(estado);
-- Para el reporte de horas: filtrar por medico + mes
CREATE INDEX ON asignaciones(medico_id, created_at);
```

### `prio_audit` — auditoría de prioridad manual

```sql
CREATE TABLE prio_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id        TEXT NOT NULL,               -- user_id del coordinador
  actor_name      TEXT NOT NULL,
  sector          TEXT NOT NULL,
  sede            TEXT,
  overrides       JSONB NOT NULL DEFAULT '[]', -- [{medicoId, medicoName, catPrio, overridePrio}]
  convocatoria_id TEXT REFERENCES convocatorias(id) ON DELETE SET NULL
);

CREATE INDEX ON prio_audit(actor_id);
CREATE INDEX ON prio_audit(timestamp DESC);
```

### `system_config` — singleton

```sql
CREATE TABLE system_config (
  id      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config  JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO system_config(config) VALUES ('{}') ON CONFLICT DO NOTHING;
```

El campo `config` almacena el `SystemConfig` completo (ver `config.types.ts`):
- `canales`: {app, whatsapp, sms, email} con providers y credenciales
- `scoring`: pesos (pesoAceptacion, pesoVelocidad, pesoPuntualidad, pesoDisponibilidad)
- `convocatorias`: timeouts por defecto, prioridad por defecto
- `organizacion`: nombre, whatsappSuplencias
- `fotos`: baseUrl, campo (funcionario|cedula|userId), extension
- `defaultCanales`: Canal[]

### `scoring_cache` — scores calculados

```sql
CREATE TABLE scoring_cache (
  medico_id   TEXT PRIMARY KEY REFERENCES medicos(user_id),
  score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  tasa_acept  NUMERIC(5,4),
  tasa_veloc  NUMERIC(5,4),
  tasa_punt   NUMERIC(5,4),
  tasa_disp   NUMERIC(5,4),
  calculado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Row Level Security (RLS)

```sql
ALTER TABLE convocatorias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prio_audit     ENABLE ROW LEVEL SECURITY;

-- Helper para obtener rol del JWT
CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', TRUE)::jsonb ->> 'role',
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role'
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_above() RETURNS BOOLEAN AS $$
  SELECT auth_role() IN ('ADMIN','SUPER_ADMIN');
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_user_id() RETURNS TEXT AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', TRUE)::jsonb ->> 'userId',
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'userId'
  );
$$ LANGUAGE SQL STABLE;

-- Convocatorias: coordinadores ven todas, médicos solo las que tienen invitación
CREATE POLICY "conv_read" ON convocatorias FOR SELECT
  USING (
    is_admin_or_above()
    OR auth_role() = 'COORDINADOR'
    OR EXISTS (
      SELECT 1 FROM invitaciones
      WHERE invitaciones.convocatoria_id = convocatorias.id
        AND invitaciones.medico_id = auth_user_id()
    )
  );

CREATE POLICY "conv_write" ON convocatorias FOR ALL
  USING (is_admin_or_above() OR auth_role() = 'COORDINADOR');

-- Invitaciones: médico solo ve las suyas
CREATE POLICY "inv_read" ON invitaciones FOR SELECT
  USING (
    is_admin_or_above()
    OR auth_role() = 'COORDINADOR'
    OR medico_id = auth_user_id()
  );

-- Auditoría: solo SUPER_ADMIN
CREATE POLICY "audit_read" ON prio_audit FOR SELECT
  USING (auth_role() = 'SUPER_ADMIN');

CREATE POLICY "audit_write" ON prio_audit FOR INSERT
  WITH CHECK (auth_role() IN ('COORDINADOR','ADMIN','SUPER_ADMIN'));
```

---

## 5. Endpoints REST (Edge Functions)

Base URL: `https://<project>.supabase.co/functions/v1`

### 5.1 Autenticación

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | público | Login con userId (legajo/cédula) + contraseña |
| POST | `/auth/logout` | JWT | Invalida sesión |
| GET  | `/auth/me` | JWT | Perfil del usuario actual |
| PATCH | `/auth/password` | JWT | Cambiar propia contraseña (requiere contraseña actual) |
| PATCH | `/admin/users/:id/password` | SUPER_ADMIN | Resetear contraseña de otro usuario |

**POST /auth/login**
```json
// Request
{ "userId": "F-1001", "password": "mediflow2024" }

// Response 200
{
  "access_token": "eyJ...",
  "refresh_token": "...",
  "user": { "userId": "F-1001", "displayName": "...", "role": "COORDINADOR" }
}
```

### 5.2 Convocatorias

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|-----------|-------------|
| GET | `/convocatorias` | COORDINADOR | Lista con filtros (estado, sector, sede, fecha) |
| POST | `/convocatorias` | COORDINADOR | Crear y enviar |
| GET | `/convocatorias/:id` | COORDINADOR | Detalle completo |
| PATCH | `/convocatorias/:id` | COORDINADOR | Actualizar notas, vencimiento, auto-renew |
| POST | `/convocatorias/:id/cancelar` | COORDINADOR | Cancelar con motivo |
| DELETE | `/convocatorias/:id` | SUPER_ADMIN | Hard delete (borrado permanente) |
| POST | `/convocatorias/:id/asignaciones/:aId/cerrar` | COORDINADOR | Cerrar guardia: CUMPLIDA/NO_CUMPLIDA |
| POST | `/convocatorias/:id/asignaciones/:aId/cancelar` | COORDINADOR | Cancelar asignación confirmada |
| POST | `/convocatorias/:id/asignar-manual` | COORDINADOR | Asignar médico manualmente |

**POST /convocatorias — body completo**
```json
{
  "sector": "Emergencia",
  "sede": "Sanatorio Juan Pablo II",
  "inicio": "2026-05-12T06:00:00.000Z",
  "fin": "2026-05-12T18:00:00.000Z",
  "cupos": 1,
  "vencimiento": "2026-05-11T18:00:00.000Z",
  "prioridad": "ALTA",
  "notas": "Presentarse 15min antes",
  "modoEnvio": "SECUENCIAL",
  "canales": ["APP", "WHATSAPP"],
  "timeouts": { "sinVerMin": 15, "sinResponderMin": 10 },
  "destinatarios": ["F-93598", "CI-48206484", "CI-19904039"],
  "keepOrder": true,
  "autoRenew": true,
  "autoRenewMinutes": 60,
  "autoRenewMaxCount": 3,
  "prioMode": "SCORING"
}
```

### 5.3 Médico (rol MEDICO)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/medico/convocatorias` | Mis convocatorias activas (ENVIADA/VISTA/EN_ESPERA) |
| POST | `/medico/invitaciones/:id/aceptar` | Acepta invitación |
| POST | `/medico/invitaciones/:id/rechazar` | Rechaza invitación |
| POST | `/medico/invitaciones/:id/vista` | Marca como vista (auto-llamada por IntersectionObserver) |

### 5.4 Administración

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|-----------|-------------|
| GET | `/admin/medicos` | ADMIN | Lista médicos (activos/todos) |
| POST | `/admin/medicos` | ADMIN | Crear médico |
| PATCH | `/admin/medicos/:id` | ADMIN | Editar médico |
| DELETE | `/admin/medicos/:id` | ADMIN | Desactivar médico |
| GET | `/admin/sedes` | ADMIN | Lista sedes |
| POST | `/admin/sedes` | ADMIN | Crear sede |
| PATCH | `/admin/sedes/:id` | ADMIN | Editar sede |
| GET | `/admin/sectores` | ADMIN | Lista sectores |
| POST | `/admin/sectores` | ADMIN | Crear sector |

### 5.5 Configuración

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/config` | ADMIN | Leer SystemConfig |
| PUT | `/config` | SUPER_ADMIN | Guardar SystemConfig |
| GET | `/config/users` | SUPER_ADMIN/ADMIN | Lista usuarios del sistema |
| POST | `/config/users` | SUPER_ADMIN/ADMIN | Crear usuario |
| PATCH | `/config/users/:id` | SUPER_ADMIN/ADMIN | Editar usuario |
| DELETE | `/config/users/:id` | SUPER_ADMIN | Eliminar usuario |

### 5.6 Reportes

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/reportes/horas?from=&to=` | COORDINADOR | Horas por médico en período |
| GET | `/reportes/convocatorias?from=&to=&estado=` | COORDINADOR | Convocatorias hechas/aceptadas/rechazadas |
| GET | `/reportes/prio-audit` | SUPER_ADMIN | Registros de prioridad manual |

### 5.7 Auditoría

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/auditoria/prio` | SUPER_ADMIN | Todos los registros de prioridad manual |
| DELETE | `/auditoria/prio` | SUPER_ADMIN | Limpiar registros |

---

## 6. Lógica de creación y envío de convocatoria

```typescript
// functions/convocatorias/index.ts
async function crearConvocatoria(input: ConvocatoriaInput, session: Session) {
  const { supabase } = getDb();

  // 1. Ordenar destinatarios
  const ordered = input.keepOrder
    ? [...input.destinatarios]
    : await ordenarPorScore(input.destinatarios);

  // 2. Insertar convocatoria
  const { data: conv } = await supabase.from("convocatorias").insert({
    ...input,
    id: newId("C"),
    estado: "ENVIADA",
    created_by: session.userId,
    prio_mode: input.prioMode ?? "SCORING",
  }).select().single();

  // 3. Insertar invitaciones
  const invitaciones = ordered.map((medicoId, idx) => ({
    convocatoria_id: conv.id,
    medico_id: medicoId,
    orden: idx,
    estado: (input.modoEnvio === "SECUENCIAL" && idx > 0) ? "EN_ESPERA" : "ENVIADA",
    canal: input.canales[0],
    sent_at: (input.modoEnvio === "MASIVO" || idx === 0) ? new Date().toISOString() : null,
  }));

  await supabase.from("invitaciones").insert(invitaciones);

  // 4. Guardar auditoría si prioMode === "MANUAL"
  if (input.prioMode === "MANUAL" && input.prioAudit?.length > 0) {
    await supabase.from("prio_audit").insert({
      actor_id: session.userId,
      actor_name: session.displayName,
      sector: input.sector,
      sede: input.sede,
      overrides: input.prioAudit,
      convocatoria_id: conv.id,
    });
  }

  // 5. Despachar canales para invitaciones ENVIADA
  const activeInvs = invitaciones.filter(i => i.estado === "ENVIADA");
  for (const inv of activeInvs) {
    await despacharCanal(inv, input.canales, conv);
  }

  return conv;
}
```

---

## 7. Canales de envío — todas las opciones

### 7.1 Canal APP (in-app, sin push externo)

No hay envío activo. El médico ve la convocatoria al entrar a la app.
- `markSeen` se llama cuando el médico navega al detalle → actualiza `seen_at` y `estado='VISTA'`
- Para push real, agregar Firebase Cloud Messaging (FCM) con PWA.

### 7.2 Canal WhatsApp

#### Opción A: Enlace manual (sin backend)
```typescript
function generarEnlaceWA(telefono: string, mensaje: string): string {
  const num = telefono.replace(/[^0-9]/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}
```
El coordinador copia el link y lo envía manualmente. Costo: $0. Sin respuesta automática.

#### Opción B: WhatsApp Business API (Meta — envío masivo profesional)
```typescript
// Requiere cuenta Business verificada + número aprobado por Meta
async function enviarWAMeta(telefono: string, template: string, params: string[]) {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${Deno.env.get("WA_PHONE_NUMBER_ID")}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("WA_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefono,
        type: "template",
        template: {
          name: "convocatoria_guardia_v1",
          language: { code: "es" },
          components: [{
            type: "body",
            parameters: params.map(v => ({ type: "text", text: v })),
          }],
        },
      }),
    }
  );
  return res.json();
}

// Webhook de respuesta bidireccional
// POST /webhooks/whatsapp
async function handleWAWebhook(req: Request) {
  // Verificar firma: X-Hub-Signature-256
  const sig = req.headers.get("X-Hub-Signature-256");
  const body = await req.text();
  const expected = hmacSha256(Deno.env.get("WA_VERIFY_TOKEN")!, body);
  if (!timingSafeEqual(sig, `sha256=${expected}`)) return 403;

  const payload = JSON.parse(body);
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const texto = msg.text?.body?.trim() ?? "";
        const telefono = msg.from;
        if (["1","SI","ACEPTO"].includes(texto.toUpperCase()))
          await marcarRespuesta(telefono, "ACEPTO");
        else if (["2","NO","RECHAZO"].includes(texto.toUpperCase()))
          await marcarRespuesta(telefono, "RECHAZO");
      }
    }
  }
}
```
**Costo Meta:** ~$0.05 USD por conversación (24h). Requiere plantillas aprobadas previamente.

#### Opción C: Twilio (WhatsApp Sandbox / número propio)
```typescript
async function enviarWATwilio(telefono: string, mensaje: string) {
  const params = new URLSearchParams({
    From: `whatsapp:${Deno.env.get("TWILIO_WA_FROM")}`,
    To:   `whatsapp:${telefono}`,
    Body:  mensaje,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  return res.json();
}

// Webhook Twilio WA
// POST /webhooks/twilio-wa
// Headers: X-Twilio-Signature (verificar con Twilio SDK)
async function handleTwilioWAWebhook(req: Request) {
  const body = await req.formData();
  const from = body.get("From")?.toString().replace("whatsapp:", "") ?? "";
  const text = body.get("Body")?.toString().trim().toUpperCase() ?? "";
  if (["1","SI","ACEPTO"].includes(text)) await marcarRespuesta(from, "ACEPTO");
  else if (["2","NO","RECHAZO"].includes(text)) await marcarRespuesta(from, "RECHAZO");
}
```
**Costo Twilio WA:** Sandbox gratis para pruebas. Producción requiere número aprobado: ~$15/mes + $0.005/msg.

### 7.3 Canal SMS

#### Opción A: Twilio SMS
```typescript
async function enviarSMSTwilio(telefono: string, mensaje: string) {
  const params = new URLSearchParams({
    From: Deno.env.get("TWILIO_FROM_NUMBER")!,
    To:   telefono,
    Body: mensaje,
  });
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`,
    { method: "POST", headers: { /* Basic auth */ }, body: params.toString() }
  );
}

// Webhook Twilio SMS — respuesta bidireccional
// POST /webhooks/twilio-sms
// Body (form): From, Body, MessageSid
async function handleTwilioSMSWebhook(req: Request) {
  const body = await req.formData();
  const from = body.get("From")?.toString() ?? "";
  const text = body.get("Body")?.toString().trim().toUpperCase() ?? "";
  if (["1","SI","ACEPTO"].includes(text)) await marcarRespuesta(from, "ACEPTO");
  else if (["2","NO","RECHAZO"].includes(text)) await marcarRespuesta(from, "RECHAZO");
}
```
**Costo Twilio SMS Uruguay:** ~$0.05 USD/SMS. Inbound también requiere número.

#### Opción B: SMSMasivos.uy (proveedor uruguayo)
```typescript
async function enviarSMSMasivos(telefono: string, mensaje: string) {
  await fetch("https://api.smsmassivos.com.uy/v1/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SMSMASSIVOS_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: telefono, message: mensaje }),
  });
}
```
Inbound SMS: verificar en el portal de SMSMasivos si ofrecen webhook de respuesta.
**Costo:** Consultar con proveedor (aproximadamente $2–4 UYU/SMS en volumen).

#### Opción C: AWS SNS
```typescript
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

async function enviarSMSAWS(telefono: string, mensaje: string) {
  const client = new SNSClient({
    region: Deno.env.get("AWS_REGION") ?? "us-east-1",
    credentials: {
      accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
    },
  });
  await client.send(new PublishCommand({
    PhoneNumber: telefono,
    Message: mensaje,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
    },
  }));
}
```
AWS SNS **no soporta** respuestas inbound SMS. Solo saliente.
**Costo AWS SNS Uruguay:** ~$0.10 USD/SMS (tier Transactional).

### 7.4 Canal Email

#### Opción A: SendGrid
```typescript
async function enviarEmailSendGrid(
  to: string, subject: string, htmlBody: string
) {
  await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SENDGRID_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: Deno.env.get("FROM_EMAIL"), name: Deno.env.get("FROM_NAME") },
      to: [{ email: to }],
      subject,
      content: [{ type: "text/html", value: htmlBody }],
    }),
  });
}
```
El médico responde haciendo clic en un link dentro del email → abre la app web → acepta/rechaza desde ahí.
Email no admite respuesta bidireccional directa.
**Costo SendGrid:** 100 emails/día gratis; planes desde $20/mes para mayor volumen.

#### Opción B: Resend (alternativa moderna)
```typescript
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` },
  body: JSON.stringify({ from: FROM_EMAIL, to: [toEmail], subject, html }),
});
```
**Costo Resend:** 3,000 emails/mes gratis. $20/mes para 50k.

#### Opción C: SMTP (servidor institucional)
```typescript
// Si el servidor Supabase Edge permite TCP (o usar un proxy HTTP-to-SMTP)
// Usar librería smtp-client o un relay como Mailgun SMTP
```

---

## 8. Función `marcarRespuesta` — núcleo del procesamiento de canales

```typescript
async function marcarRespuesta(
  telefono: string,
  respuesta: "ACEPTO" | "RECHAZO"
) {
  const { supabase } = getDb();

  // 1. Buscar médico por teléfono
  const { data: medico } = await supabase
    .from("medicos")
    .select("user_id, display_name")
    .eq("telefono", telefono)
    .single();
  if (!medico) return { error: "médico no encontrado" };

  // 2. Buscar invitación activa (ENVIADA o VISTA)
  const { data: inv } = await supabase
    .from("invitaciones")
    .select("*, convocatorias(*)")
    .eq("medico_id", medico.user_id)
    .in("estado", ["ENVIADA", "VISTA"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();
  if (!inv) return { error: "no hay invitación activa" };

  const conv = inv.convocatorias;

  // 3. Verificar que la convocatoria no venció
  if (new Date() > new Date(conv.vencimiento)) {
    await supabase.from("invitaciones")
      .update({ estado: "VENCIDA", responded_at: new Date().toISOString() })
      .eq("id", inv.id);
    return { error: "convocatoria vencida" };
  }

  // 4. Actualizar invitación
  await supabase.from("invitaciones")
    .update({ estado: respuesta, responded_at: new Date().toISOString() })
    .eq("id", inv.id);

  // 5. Si ACEPTO: crear asignación
  if (respuesta === "ACEPTO") {
    await supabase.from("asignaciones").insert({
      convocatoria_id: conv.id,
      medico_id: medico.user_id,
      estado: "CONFIRMADA",
    });
    // En SECUENCIAL: cancelar otras invitaciones en espera
    if (conv.modo_envio === "SECUENCIAL") {
      await supabase.from("invitaciones")
        .update({ estado: "SIN_RESPUESTA", responded_at: new Date().toISOString() })
        .eq("convocatoria_id", conv.id)
        .in("estado", ["EN_ESPERA", "ENVIADA", "VISTA"])
        .neq("medico_id", medico.user_id);
    }
  }

  // 6. Si RECHAZO en SECUENCIAL: activar siguiente
  if (respuesta === "RECHAZO" && conv.modo_envio === "SECUENCIAL") {
    await activarSiguienteEnSecuencial(conv.id);
  }

  // 7. Recalcular estado de la convocatoria
  await recalcularEstadoConvocatoria(conv.id);
}
```

---

## 9. Auto-avance secuencial — pg_cron

Corre cada minuto y expira invitaciones que superaron el timeout:

```sql
-- Habilitar pg_cron (en Supabase: Database → Extensions → pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'mediflow-auto-advance',
  '* * * * *',
  $$ SELECT mediflow_auto_advance(); $$
);

CREATE OR REPLACE FUNCTION mediflow_auto_advance() RETURNS void AS $$
DECLARE
  inv_rec  RECORD;
  next_inv RECORD;
BEGIN
  -- Buscar invitaciones expiradas
  FOR inv_rec IN
    SELECT i.*, c.timeout_sin_ver_min, c.timeout_sin_resp_min, c.modo_envio
    FROM invitaciones i
    JOIN convocatorias c ON c.id = i.convocatoria_id
    WHERE i.estado IN ('ENVIADA', 'VISTA')
      AND c.modo_envio = 'SECUENCIAL'
      AND c.estado NOT IN ('CUBIERTA', 'CANCELADA')
      AND (
        (i.estado = 'ENVIADA'
          AND i.sent_at + (c.timeout_sin_ver_min || ' minutes')::interval < NOW())
        OR
        (i.estado = 'VISTA'
          AND i.seen_at + (c.timeout_sin_resp_min || ' minutes')::interval < NOW()
          AND i.responded_at IS NULL)
      )
  LOOP
    -- Expirar invitación
    UPDATE invitaciones
    SET estado = 'SIN_RESPUESTA', responded_at = NOW()
    WHERE id = inv_rec.id;

    -- Activar siguiente EN_ESPERA
    UPDATE invitaciones
    SET estado = 'ENVIADA', sent_at = NOW()
    WHERE convocatoria_id = inv_rec.convocatoria_id
      AND estado = 'EN_ESPERA'
      AND orden = (
        SELECT MIN(orden) FROM invitaciones
        WHERE convocatoria_id = inv_rec.convocatoria_id
          AND estado = 'EN_ESPERA'
      )
    RETURNING * INTO next_inv;

    -- TODO: llamar Edge Function para despachar canal al nuevo activo
    -- PERFORM http_post('/functions/v1/internal/despachar-inv', next_inv.id::text);
  END LOOP;

  -- Recalcular estados de todas las convocatorias activas
  UPDATE convocatorias
  SET estado = mediflow_compute_estado(id), updated_at = NOW()
  WHERE estado NOT IN ('CANCELADA', 'CUBIERTA');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función de cálculo de estado (igual que computeEstado() en TypeScript)
CREATE OR REPLACE FUNCTION mediflow_compute_estado(conv_id TEXT) RETURNS TEXT AS $$
DECLARE
  conv    RECORD;
  confirmadas INT;
BEGIN
  SELECT * INTO conv FROM convocatorias WHERE id = conv_id;
  IF conv.estado = 'CANCELADA' THEN RETURN 'CANCELADA'; END IF;

  SELECT COUNT(*) INTO confirmadas
  FROM asignaciones
  WHERE convocatoria_id = conv_id AND estado IN ('CONFIRMADA','CUMPLIDA');

  IF confirmadas >= conv.cupos THEN RETURN 'CUBIERTA'; END IF;
  IF NOW() > conv.vencimiento THEN
    RETURN CASE WHEN confirmadas > 0 THEN 'PARCIAL' ELSE 'VENCIDA' END;
  END IF;
  RETURN CASE WHEN confirmadas > 0 THEN 'PARCIAL' ELSE 'ENVIADA' END;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## 10. Auto-renovación al vencer

```sql
-- Cron adicional para auto-renovar convocatorias vencidas
SELECT cron.schedule(
  'mediflow-auto-renew',
  '* * * * *',
  $$ SELECT mediflow_auto_renew(); $$
);

CREATE OR REPLACE FUNCTION mediflow_auto_renew() RETURNS void AS $$
DECLARE
  conv_rec RECORD;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  FOR conv_rec IN
    SELECT * FROM convocatorias
    WHERE auto_renew = TRUE
      AND estado = 'VENCIDA'
      AND auto_renew_count < auto_renew_max_count
      AND estado NOT IN ('CANCELADA', 'CUBIERTA')
  LOOP
    -- Extender vencimiento
    UPDATE convocatorias
    SET
      vencimiento = now_ts + (conv_rec.auto_renew_minutes || ' minutes')::interval,
      auto_renew_count = auto_renew_count + 1,
      estado = 'ENVIADA',
      updated_at = now_ts
    WHERE id = conv_rec.id;

    -- Si secuencial y no hay invitaciones activas/en espera: resetear
    IF conv_rec.modo_envio = 'SECUENCIAL' THEN
      IF NOT EXISTS (
        SELECT 1 FROM invitaciones
        WHERE convocatoria_id = conv_rec.id
          AND estado IN ('ENVIADA','VISTA','EN_ESPERA')
      ) THEN
        -- Resetear todas excepto las aceptadas
        UPDATE invitaciones
        SET estado = 'EN_ESPERA', sent_at = NULL, seen_at = NULL, responded_at = NULL
        WHERE convocatoria_id = conv_rec.id
          AND estado NOT IN ('ACEPTO');

        -- Activar primera
        UPDATE invitaciones
        SET estado = 'ENVIADA', sent_at = now_ts
        WHERE convocatoria_id = conv_rec.id
          AND orden = (
            SELECT MIN(orden) FROM invitaciones
            WHERE convocatoria_id = conv_rec.id AND estado = 'EN_ESPERA'
          );
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 11. Scoring de médicos

### Fórmula

```
score = (pesoAceptacion    × tasa_aceptacion)
      + (pesoVelocidad     × velocidad_normalizada)
      + (pesoPuntualidad   × tasa_puntualidad)
      + (pesoDisponibilidad × disponibilidad)
```

- **tasa_aceptacion**: `COUNT(ACEPTO) / COUNT(ACEPTO + RECHAZO)` en `periodosDias`
- **velocidad_normalizada**: `1 - (AVG(responded_at - sent_at) / timeout_max)` → 0 a 1
- **tasa_puntualidad**: `COUNT(CUMPLIDA) / COUNT(CUMPLIDA + NO_CUMPLIDA)`
- **disponibilidad**: `COUNT(ACEPTO) / COUNT(invitaciones_recibidas)` en período

```sql
CREATE OR REPLACE FUNCTION calcular_score_medico(
  p_medico_id TEXT,
  p_periodos_dias INT DEFAULT 90,
  p_peso_acept INT DEFAULT 35,
  p_peso_veloc INT DEFAULT 25,
  p_peso_punt  INT DEFAULT 25,
  p_peso_disp  INT DEFAULT 15
) RETURNS NUMERIC AS $$
DECLARE
  desde          TIMESTAMPTZ := NOW() - (p_periodos_dias || ' days')::interval;
  v_acept        NUMERIC;
  v_veloc        NUMERIC;
  v_punt         NUMERIC;
  v_disp         NUMERIC;
  total_inv      INT;
  total_resp     INT;
  total_acept    INT;
  avg_resp_min   NUMERIC;
  total_cumplida INT;
  total_cerradas INT;
BEGIN
  -- Tasa de aceptación
  SELECT COUNT(*) FILTER (WHERE estado = 'ACEPTO'),
         COUNT(*) FILTER (WHERE estado IN ('ACEPTO','RECHAZO'))
  INTO total_acept, total_resp
  FROM invitaciones i
  JOIN convocatorias c ON c.id = i.convocatoria_id
  WHERE i.medico_id = p_medico_id
    AND c.inicio >= desde;

  v_acept := CASE WHEN total_resp > 0 THEN total_acept::NUMERIC / total_resp ELSE 0.5 END;

  -- Velocidad de respuesta
  SELECT AVG(EXTRACT(EPOCH FROM (i.responded_at - i.sent_at)) / 60)
  INTO avg_resp_min
  FROM invitaciones i
  WHERE i.medico_id = p_medico_id
    AND i.responded_at IS NOT NULL
    AND i.sent_at IS NOT NULL
    AND i.estado IN ('ACEPTO','RECHAZO');

  v_veloc := CASE
    WHEN avg_resp_min IS NULL THEN 0.5
    ELSE GREATEST(0, LEAST(1, 1 - avg_resp_min / 60.0))
  END;

  -- Puntualidad
  SELECT COUNT(*) FILTER (WHERE a.estado = 'CUMPLIDA'),
         COUNT(*) FILTER (WHERE a.estado IN ('CUMPLIDA','NO_CUMPLIDA'))
  INTO total_cumplida, total_cerradas
  FROM asignaciones a
  JOIN convocatorias c ON c.id = a.convocatoria_id
  WHERE a.medico_id = p_medico_id
    AND c.inicio >= desde;

  v_punt := CASE WHEN total_cerradas > 0 THEN total_cumplida::NUMERIC / total_cerradas ELSE 0.8 END;

  -- Disponibilidad
  SELECT COUNT(*) FILTER (WHERE estado = 'ACEPTO'), COUNT(*)
  INTO total_acept, total_inv
  FROM invitaciones i
  JOIN convocatorias c ON c.id = i.convocatoria_id
  WHERE i.medico_id = p_medico_id
    AND c.inicio >= desde
    AND i.estado != 'EN_ESPERA';

  v_disp := CASE WHEN total_inv > 0 THEN total_acept::NUMERIC / total_inv ELSE 0.5 END;

  RETURN ROUND(
    (p_peso_acept * v_acept + p_peso_veloc * v_veloc +
     p_peso_punt  * v_punt  + p_peso_disp  * v_disp),
    2
  );
END;
$$ LANGUAGE plpgsql STABLE;
```

### Cron de scoring

```sql
-- Recalcular scores de todos los médicos activos cada hora
SELECT cron.schedule('mediflow-scoring', '0 * * * *', $$
  UPDATE medicos m
  SET score = calcular_score_medico(m.user_id),
      score_updated_at = NOW()
  WHERE m.activo = TRUE;
$$);
```

---

## 12. Realtime (actualizaciones en vivo en la UI)

```typescript
// frontend: reemplazar el polling de 10s con suscripción Realtime
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase.channel("convocatorias-live")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "convocatorias",
  }, payload => {
    // actualizar store local sin recargar todo
    convocatoriaStore.applyPatch(payload.new as Convocatoria);
  })
  .on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "invitaciones",
  }, payload => {
    invitacionStore.applyPatch(payload.new as Invitacion);
  })
  .subscribe();
```

Con esto, el dashboard se actualiza en tiempo real cuando un médico responde desde WhatsApp/SMS/App.

---

## 13. Mensajes de texto — plantillas

```
CONVOCATORIA NORMAL:
"[Mediflow] Guardia disponible:
Sector: {sector}
Sede: {sede}
Turno: {fechaInicio} – {fechaFin}
Respondé 1=ACEPTO | 2=RECHAZO
Vence: {vencimiento}"

CONVOCATORIA URGENTE:
"⚠️ [Mediflow] GUARDIA URGENTE — {sector} {sede}
Necesitamos respuesta URGENTE. Turno: {inicio} a {fin}
Respondé: 1=ACEPTO / 2=RECHAZO
Vence: {vencimiento}"

CONFIRMACIÓN:
"✅ [Mediflow] Confirmada tu guardia: {sector} {sede}
{fechaInicio} – {fechaFin}. ¡Gracias!"

RECHAZO RECIBIDO:
"[Mediflow] Recibimos tu rechazo. Seguimos contactando. Gracias."

RECORDATORIO (día anterior):
"[Mediflow] Recordatorio: Tenés guardia mañana {sector} {sede} a las {hora}."

RENOVACIÓN AUTOMÁTICA:
"[Mediflow] La convocatoria {sector} fue renovada. Aún disponible hasta: {nuevoVencimiento}"
```

---

## 14. Variables de entorno (Supabase Secrets)

```bash
supabase secrets set \
  # Twilio SMS
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_FROM_NUMBER=+598XXXXXXXXX \
  TWILIO_WEBHOOK_SECRET=mi-secreto-webhook \
  \
  # Twilio / Meta WhatsApp
  TWILIO_WA_FROM=whatsapp:+14155238886 \
  WA_PHONE_NUMBER_ID=123456789012345 \
  WA_ACCESS_TOKEN=EAAXXXXXXXXXXXXXXXX \
  WA_VERIFY_TOKEN=mi-verify-token-wa \
  \
  # Email
  SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxx \
  RESEND_API_KEY=re_xxxxxxxx \
  FROM_EMAIL=suplencias@hospital.com.uy \
  FROM_NAME="Mediflow Suplencias" \
  \
  # SMS Uruguay
  SMSMASSIVOS_API_KEY=xxxx \
  \
  # AWS
  AWS_ACCESS_KEY_ID=AKIAXXXXXXXX \
  AWS_SECRET_ACCESS_KEY=xxxxxxxx \
  AWS_REGION=us-east-1 \
  \
  # App
  FRONTEND_URL=https://mediflow.hospital.com.uy \
  INTERNAL_SECRET=secreto-interno-entre-funciones
```

---

## 15. Estructura de Edge Functions

```
supabase/functions/
  _shared/
    auth.ts          -- getSession(), requireRole()
    db.ts            -- createServiceClient(), apiFetch()
    channels.ts      -- despacharCanal(), mensajeConvocatoria()
    scoring.ts       -- calcularScore() (TypeScript, sync con SQL)
    estado.ts        -- computeEstado(), recalcularEstadoConvocatoria()
    renew.ts         -- autoRenewConvocatoria()
    id.ts            -- newId()
  convocatorias/
    index.ts         -- GET/POST /convocatorias
    [id]/
      index.ts       -- GET/PATCH/DELETE /convocatorias/:id
      cancelar.ts    -- POST .../cancelar
      asignar-manual.ts
      asignaciones/
        [aId]/
          cerrar.ts
          cancelar.ts
  medico/
    convocatorias.ts -- GET /medico/convocatorias
    invitaciones/
      [id]/
        aceptar.ts
        rechazar.ts
        vista.ts
  admin/
    medicos.ts       -- CRUD /admin/medicos
    sedes.ts
    sectores.ts
  config/
    index.ts         -- GET/PUT /config
    users.ts         -- CRUD /config/users
    users/[id]/password.ts
  auth/
    login.ts
    logout.ts
    me.ts
    password.ts      -- PATCH /auth/password
  reportes/
    horas.ts
    convocatorias.ts
    prio-audit.ts
  webhooks/
    whatsapp.ts      -- POST /webhooks/whatsapp (Meta)
    twilio-wa.ts     -- POST /webhooks/twilio-wa
    twilio-sms.ts    -- POST /webhooks/twilio-sms
  internal/
    despachar-inv.ts -- llamada interna del cron
    auto-advance.ts  -- alternativa al pg_cron vía HTTP
```

---

## 16. Migración desde localStorage

Al conectar el backend, solo se reemplazan las implementaciones de los stores.
Los tipos TypeScript y la UI **no cambian**.

```typescript
// ANTES (localStorage)
export const convocatoriaStore = {
  list(): Convocatoria[] {
    const raw = storage.get<Convocatoria[]>(KEY, []);
    return hydrate(raw);
  },
  // ...
};

// DESPUÉS (API real)
const BASE = "/functions/v1";

async function apiFetch(path: string, init?: RequestInit) {
  const token = authStore.getToken(); // guardar el JWT en authStore
  return fetch(`${SUPABASE_URL}${BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export const convocatoriaStore = {
  async list(): Promise<Convocatoria[]> {
    const res = await apiFetch("/convocatorias");
    return res.json();
  },

  async createAndSend(input: ConvocatoriaInput): Promise<Convocatoria> {
    const res = await apiFetch("/convocatorias", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.json();
  },

  async hardDelete(id: string): Promise<void> {
    await apiFetch(`/convocatorias/${id}`, { method: "DELETE" });
  },
  // ...
};
```

**Orden recomendado de migración:**
1. `authStore` + `usersStore` — conectar login real primero
2. `medicosStore`, `sedesStore`, `sectoresStore` — catálogos (solo lectura)
3. `configStore` — singleton, fácil
4. `convocatoriaStore` — el más complejo, dejar para último
5. `prioAuditStore` — se migra junto con convocatorias

---

## 17. Testing

### Unit tests (Deno)
```typescript
// functions/convocatorias/index.test.ts
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { computeEstado } from "../_shared/estado.ts";

Deno.test("computeEstado - cubierta cuando confirmadas >= cupos", () => {
  const conv = { cupos: 1, asignaciones: [{ estado: "CONFIRMADA" }], vencimiento: future, estado: "ENVIADA" };
  assertEquals(computeEstado(conv), "CUBIERTA");
});
```

### Integration tests (local Supabase)
```bash
supabase start          # levanta Supabase local
supabase test db        # corre tests SQL
supabase functions serve # sirve Edge Functions localmente
```

### Variables locales
```bash
# .env.local (no commitear)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 18. Checklist de despliegue

- [ ] `supabase db push` — aplicar migraciones en producción
- [ ] `supabase functions deploy` — deployar todas las Edge Functions
- [ ] `supabase secrets set` — configurar variables de entorno
- [ ] Habilitar `pg_cron` en Supabase Dashboard → Database → Extensions
- [ ] Configurar webhooks en Twilio/Meta apuntando a `/functions/v1/webhooks/...`
- [ ] Configurar plantillas de WhatsApp Business en Meta Business Manager
- [ ] Verificar RLS policies con un usuario de cada rol
- [ ] Configurar Realtime en Supabase Dashboard → Database → Replication (tablas: convocatorias, invitaciones)
- [ ] Test end-to-end: crear convocatoria → médico responde por WA → dashboard actualiza
