# Mediflow — Guía de Backend

> Esta guía describe la arquitectura, esquema de base de datos, endpoints y flujos de
> integración para implementar el backend real de Mediflow en Supabase (PostgreSQL + Edge Functions).
> El frontend actual usa localStorage como mock. Al conectar el backend real, reemplazás
> los stores (`convocatoria.store.ts`, `auth.store.ts`, etc.) por llamadas a esta API.

---

## 1. Stack recomendado

| Capa           | Tecnología                                  |
|----------------|---------------------------------------------|
| DB             | Supabase (PostgreSQL 15)                    |
| Auth           | Supabase Auth (JWT)                         |
| API REST       | Supabase Edge Functions (Deno / TypeScript) |
| Webhooks       | Edge Functions (rutas públicas sin auth)    |
| Canales        | Twilio (SMS + WhatsApp), SendGrid (Email)   |
| Cron / timers  | pg_cron (auto-advance secuencial)           |
| Realtime       | Supabase Realtime (suscripción a cambios)   |

---

## 2. Roles y autenticación

### Roles
```
SUPER_ADMIN  → acceso total, configura el sistema
ADMIN        → gestión de usuarios y catálogos
COORDINADOR  → crea y gestiona convocatorias
MEDICO       → ve sus convocatorias, acepta/rechaza
```

### JWT custom claims
Supabase Auth guarda el rol en `app_metadata`:
```json
{ "role": "COORDINADOR", "userId": "F-1001", "displayName": "Dr. García" }
```

El Edge Function middleware extrae `role` del JWT para autorizar.

### Migraciones de rol legacy
Si la DB tiene filas con `role = 'SUPLENCIAS'`, actualizarlas a `'COORDINADOR'` en una migración SQL:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"COORDINADOR"}'
WHERE raw_app_meta_data->>'role' = 'SUPLENCIAS';
```

---

## 3. Esquema de base de datos

### `profiles`
```sql
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id),
  user_id      TEXT UNIQUE NOT NULL,      -- "F-1001", "CI-93598"
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','ADMIN','COORDINADOR','MEDICO')),
  telefono     TEXT,
  especialidad TEXT,
  tipo         TEXT DEFAULT 'SUPLENTE',   -- 'SUPLENTE' | 'EFECTIVO'
  prioridad    INT,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `convocatorias`
```sql
CREATE TABLE convocatorias (
  id            TEXT PRIMARY KEY,          -- "C-xxxx"
  sector        TEXT NOT NULL,
  sede          TEXT,
  inicio        TIMESTAMPTZ NOT NULL,
  fin           TIMESTAMPTZ NOT NULL,
  cupos         INT NOT NULL DEFAULT 1,
  vencimiento   TIMESTAMPTZ NOT NULL,
  prioridad     TEXT NOT NULL DEFAULT 'NORMAL',  -- 'NORMAL' | 'ALTA'
  notas         TEXT,
  modo_envio    TEXT NOT NULL DEFAULT 'MASIVO',  -- 'MASIVO' | 'SECUENCIAL'
  canales       TEXT[] NOT NULL DEFAULT '{APP}', -- ['APP','WHATSAPP','SMS','EMAIL']
  timeout_sin_ver_min     INT NOT NULL DEFAULT 60,
  timeout_sin_resp_min    INT NOT NULL DEFAULT 60,
  estado        TEXT NOT NULL DEFAULT 'BORRADOR',
  cancel_reason TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `invitaciones`
```sql
CREATE TABLE invitaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id TEXT NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id      TEXT NOT NULL,            -- "CI-xxxx" | "F-xxxx"
  estado         TEXT NOT NULL DEFAULT 'EN_ESPERA',
  -- EN_ESPERA | ENVIADA | VISTA | ACEPTO | RECHAZO | SIN_RESPUESTA | VENCIDA
  canal          TEXT NOT NULL DEFAULT 'APP',  -- canal efectivo para esta inv.
  orden          INT NOT NULL DEFAULT 0,    -- para secuencial
  sent_at        TIMESTAMPTZ,
  seen_at        TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON invitaciones(convocatoria_id);
CREATE INDEX ON invitaciones(medico_id);
```

### `asignaciones`
```sql
CREATE TABLE asignaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convocatoria_id TEXT NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  medico_id       TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'CONFIRMADA',
  -- CONFIRMADA | CANCELADA_POR_MEDICO | REEMPLAZADA | CUMPLIDA | NO_CUMPLIDA
  horas           NUMERIC,               -- calculadas al cierre
  cierre_nota     TEXT,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON asignaciones(convocatoria_id);
CREATE INDEX ON asignaciones(medico_id);
```

### `system_config`
```sql
CREATE TABLE system_config (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  config      JSONB NOT NULL DEFAULT '{}'
);
INSERT INTO system_config(config) VALUES ('{}') ON CONFLICT DO NOTHING;
```
El campo `config` almacena el `SystemConfig` completo (tipado en `config.types.ts`).

---

## 4. Endpoints REST (Edge Functions)

Base URL: `https://<project>.supabase.co/functions/v1`

### Auth
| Método | Ruta               | Rol mín.    | Descripción                        |
|--------|--------------------|-------------|------------------------------------|
| POST   | `/auth/login`      | público     | Login con legajo + contraseña      |
| POST   | `/auth/logout`     | cualquiera  | Invalida sesión                    |
| GET    | `/auth/me`         | cualquiera  | Perfil del usuario actual          |

### Convocatorias
| Método | Ruta                          | Rol mín.     | Descripción                                    |
|--------|-------------------------------|--------------|------------------------------------------------|
| GET    | `/convocatorias`              | COORDINADOR  | Lista (con filtros: estado, sector, fecha)     |
| POST   | `/convocatorias`              | COORDINADOR  | Crear + enviar convocatoria                    |
| GET    | `/convocatorias/:id`          | COORDINADOR  | Detalle con invitaciones y asignaciones        |
| PATCH  | `/convocatorias/:id`          | COORDINADOR  | Actualizar (notas, vencimiento, estado)        |
| POST   | `/convocatorias/:id/cancelar` | COORDINADOR  | Cancelar con motivo                            |
| POST   | `/convocatorias/:id/cerrar`   | COORDINADOR  | Cierre manual de asignación (horas reales)     |

### Médico (MEDICO)
| Método | Ruta                               | Descripción                            |
|--------|------------------------------------|----------------------------------------|
| GET    | `/medico/convocatorias`            | Mis convocatorias activas              |
| POST   | `/medico/invitaciones/:id/aceptar` | Acepta invitación                      |
| POST   | `/medico/invitaciones/:id/rechazar`| Rechaza invitación                     |

### Administración
| Método | Ruta                   | Rol mín. | Descripción               |
|--------|------------------------|----------|---------------------------|
| GET    | `/admin/medicos`       | ADMIN    | Lista médicos             |
| POST   | `/admin/medicos`       | ADMIN    | Crear médico              |
| PATCH  | `/admin/medicos/:id`   | ADMIN    | Editar médico             |
| GET    | `/admin/sectores`      | ADMIN    | Lista sectores            |
| POST   | `/admin/sectores`      | ADMIN    | Crear sector              |
| GET    | `/admin/sedes`         | ADMIN    | Lista sedes               |
| POST   | `/admin/sedes`         | ADMIN    | Crear sede                |

### Configuración (SUPER_ADMIN)
| Método | Ruta      | Descripción                              |
|--------|-----------|------------------------------------------|
| GET    | `/config` | Lee SystemConfig                         |
| PUT    | `/config` | Guarda SystemConfig (merge profundo)     |

---

## 5. Flujo de creación y envío de convocatoria

```
POST /convocatorias
Body: {
  sector, sede, inicio, fin, cupos, vencimiento,
  prioridad, notas, modoEnvio, canales, timeouts,
  destinatarios: ["F-1001", "CI-93598", ...]
}
```

**Lógica del Edge Function:**

1. Insertar fila en `convocatorias` con `estado = 'ENVIADA'`
2. Insertar filas en `invitaciones`:
   - SECUENCIAL (cupos=1): primer médico → `estado='ENVIADA'`, resto → `estado='EN_ESPERA'`
   - MASIVO: todos → `estado='ENVIADA'`
3. Por cada invitación en `ENVIADA`, llamar `despacharCanal(invitacion, canales)`
4. Retornar la convocatoria creada con sus invitaciones

---

## 6. Flujo de canales de envío

### 6.1 Canal: APP (in-app)
No hay push externo. El médico ve la convocatoria al entrar a la app.
- `markSeen`: se llama cuando el médico navega al detalle → actualiza `seen_at` y `estado='VISTA'`

### 6.2 Canal: WhatsApp

#### Provider: ENLACE_MANUAL
Genera un link de WhatsApp Web preformateado:
```
https://wa.me/+598XXXXXXXX?text=<mensaje_url_encoded>
```
El coordinador copia y envía manualmente. El backend solo genera el link, no envía.

#### Provider: WhatsApp Business API (Meta)
```
POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages
Headers: Authorization: Bearer {accessToken}
Body: {
  messaging_product: "whatsapp",
  to: "+598XXXXXXXX",
  type: "template",
  template: { name: "convocatoria_v1", language: { code: "es" } }
}
```

**Webhook de respuesta (bidireccional):**
```
POST /webhooks/whatsapp
Headers: X-Hub-Signature-256: sha256=...
Body: { object: "whatsapp_business_account", entry: [...] }
```
Verificar firma con `webhookVerifyToken`. Parsear `entry[].changes[].value.messages[]`:
- Si `message.type === 'text'` y texto contiene "1" o "SI" → `marcarRespuesta(medicoId, 'ACEPTO')`
- Si texto contiene "2" o "NO" → `marcarRespuesta(medicoId, 'RECHAZO')`

#### Provider: Twilio (WhatsApp)
```
POST https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json
Auth: Basic accountSid:authToken
Body (form): From=whatsapp:+1415XXXXXXX&To=whatsapp:+598XXXXXXXX&Body=<mensaje>
```

**Webhook de respuesta:**
```
POST /webhooks/twilio-whatsapp
Body (form): From=whatsapp:+598XXXXXXXX&Body=<respuesta>&MessageSid=...
```
Verificar firma con `twilioSignature` header usando `webhookSecret`.

### 6.3 Canal: SMS

#### Provider: Twilio SMS
```
POST https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json
Auth: Basic accountSid:authToken
Body: From={fromNumber}&To=+598XXXXXXXX&Body=<mensaje>
```

**Webhook de respuesta (bidireccional):**
```
POST /webhooks/twilio-sms
Body (form): From=+598XXXXXXXX&Body=<texto>&MessageSid=...
```
Parsear respuesta:
- "1" / "SI" / "ACEPTO" → `marcarRespuesta(medicoId, 'ACEPTO')`
- "2" / "NO" / "RECHAZO" → `marcarRespuesta(medicoId, 'RECHAZO')`

#### Provider: SMSMassivos UY
```
POST https://api.smsmassivos.com.uy/v1/send
Headers: Authorization: Bearer {apiKey}
Body: { to: "+598XXXXXXXX", message: "<texto>" }
```
SMSMassivos no soporta webhooks de respuesta inbound por defecto. Revisar su portal para activar inbound.

#### Provider: AWS SNS
```typescript
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
const client = new SNSClient({ region, credentials: { accessKeyId, secretAccessKey } });
await client.send(new PublishCommand({ PhoneNumber: "+598XXXXXXXX", Message: texto }));
```
AWS SNS no soporta respuestas bidireccionales (no hay webhook de inbound SMS).

### 6.4 Canal: Email

#### Provider: SendGrid
```
POST https://api.sendgrid.com/v3/mail/send
Headers: Authorization: Bearer {apiKey}
Body: {
  from: { email: fromEmail, name: fromName },
  to: [{ email: "medico@hospital.com.uy" }],
  subject: "Convocatoria de guardia",
  content: [{ type: "text/html", value: "<html>...</html>" }]
}
```
Email no soporta respuesta bidireccional en este flujo. El médico acepta/rechaza desde la app web (link en el email).

#### Provider: Resend
```
POST https://api.resend.com/emails
Headers: Authorization: Bearer {apiKey}
Body: { from: fromEmail, to: [email], subject, html }
```

#### Provider: SMTP
Usar `nodemailer` (si el runtime lo soporta) o llamar directamente al servidor SMTP con el protocolo.

---

## 7. Función `marcarRespuesta`

Llamada desde cualquier webhook de canal:

```typescript
async function marcarRespuesta(
  telefono: string,
  respuesta: 'ACEPTO' | 'RECHAZO'
) {
  // 1. Buscar médico por teléfono
  const medico = await db.profiles.findOne({ telefono });
  if (!medico) return;

  // 2. Buscar invitación ENVIADA o VISTA activa
  const inv = await db.invitaciones.findOne({
    medico_id: medico.user_id,
    estado: { in: ['ENVIADA', 'VISTA'] }
  });
  if (!inv) return;

  // 3. Actualizar invitación
  await db.invitaciones.update(inv.id, {
    estado: respuesta,
    responded_at: new Date().toISOString()
  });

  // 4. Si ACEPTO: crear asignación
  if (respuesta === 'ACEPTO') {
    await db.asignaciones.insert({
      convocatoria_id: inv.convocatoria_id,
      medico_id: medico.user_id,
      estado: 'CONFIRMADA'
    });
  }

  // 5. Si SECUENCIAL + RECHAZO: activar siguiente médico
  const conv = await db.convocatorias.findById(inv.convocatoria_id);
  if (conv.modo_envio === 'SECUENCIAL' && respuesta === 'RECHAZO') {
    await activarSiguiente(conv.id);
  }

  // 6. Recalcular estado de la convocatoria
  await recalcularEstado(conv.id);
}
```

---

## 8. Auto-avance secuencial (pg_cron)

Para manejar timeouts sin respuesta en modo secuencial:

```sql
-- Correr cada minuto
SELECT cron.schedule('mediflow-advance', '* * * * *', $$
  SELECT mediflow_auto_advance();
$$);
```

```sql
CREATE OR REPLACE FUNCTION mediflow_auto_advance() RETURNS void AS $$
DECLARE
  inv RECORD;
  conv RECORD;
BEGIN
  FOR inv IN
    SELECT i.*
    FROM invitaciones i
    JOIN convocatorias c ON c.id = i.convocatoria_id
    WHERE i.estado IN ('ENVIADA', 'VISTA')
      AND c.modo_envio = 'SECUENCIAL'
      AND c.estado NOT IN ('CUBIERTA', 'CANCELADA', 'VENCIDA')
      AND (
        (i.estado = 'ENVIADA' AND i.sent_at + (c.timeout_sin_ver_min || ' minutes')::interval < NOW())
        OR
        (i.estado = 'VISTA'   AND i.seen_at  + (c.timeout_sin_resp_min || ' minutes')::interval < NOW())
      )
  LOOP
    -- Marcar como SIN_RESPUESTA
    UPDATE invitaciones
    SET estado = 'SIN_RESPUESTA', responded_at = NOW()
    WHERE id = inv.id;

    -- Activar siguiente EN_ESPERA
    UPDATE invitaciones
    SET estado = 'ENVIADA', sent_at = NOW()
    WHERE convocatoria_id = inv.convocatoria_id
      AND estado = 'EN_ESPERA'
      AND orden = (
        SELECT MIN(orden) FROM invitaciones
        WHERE convocatoria_id = inv.convocatoria_id AND estado = 'EN_ESPERA'
      );

    -- TODO: despachar canal para el nuevo invitado activo
  END LOOP;

  -- Recalcular estados
  UPDATE convocatorias
  SET estado = mediflow_compute_estado(id), updated_at = NOW()
  WHERE estado NOT IN ('CANCELADA');
END;
$$ LANGUAGE plpgsql;
```

---

## 9. Realtime (notificaciones push a la UI)

Supabase Realtime permite suscribirse a cambios en tablas:

```typescript
// Frontend: suscripción a cambios en convocatorias
supabase.channel('convocatorias')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'convocatorias'
  }, payload => {
    // actualizar store local
    convocatoriaStore.applyRealtime(payload);
  })
  .subscribe();
```

Útil para que el panel del coordinador se actualice en tiempo real cuando un médico acepta/rechaza.

---

## 10. Scoring de médicos

Calculado periódicamente (o al cierre de cada convocatoria):

```
score = (pesoAceptacion × tasa_aceptacion)
      + (pesoVelocidad  × velocidad_respuesta_normalizada)
      + (pesoPuntualidad × tasa_puntualidad)
      + (pesoDisponibilidad × disponibilidad)
```

- `tasa_aceptacion`: `asignaciones_CONFIRMADA / invitaciones_ACEPTO_o_RECHAZO` en `periodosDias`
- `velocidad_respuesta_normalizada`: `1 - (avg_tiempo_respuesta / timeout_max)` (0–1)
- `tasa_puntualidad`: `asignaciones_CUMPLIDA / (CUMPLIDA + NO_CUMPLIDA)`
- `disponibilidad`: `invitaciones_ACEPTO / (total invitaciones recibidas)` en período

Los pesos se configuran en `SystemConfig.scoring` (suman 100).

---

## 11. Estructura de carpetas (Edge Functions)

```
supabase/
  functions/
    _shared/
      auth.ts          -- middleware JWT, validar rol
      db.ts            -- cliente Supabase + helpers
      channels.ts      -- despacharCanal(), mensajes de texto
      scoring.ts       -- calcularScore()
    convocatorias/
      index.ts         -- CRUD convocatorias
    medico/
      index.ts         -- endpoints del médico
    admin/
      index.ts         -- CRUD médicos, sectores, sedes
    config/
      index.ts         -- GET/PUT system_config
    webhooks/
      whatsapp.ts      -- webhook Meta / Twilio WA
      twilio-sms.ts    -- webhook Twilio SMS
```

---

## 12. Variables de entorno (Supabase Secrets)

```bash
supabase secrets set \
  TWILIO_ACCOUNT_SID=ACxxxx \
  TWILIO_AUTH_TOKEN=xxxx \
  TWILIO_FROM_NUMBER=+1415xxxx \
  TWILIO_WEBHOOK_SECRET=xxxx \
  WA_PHONE_NUMBER_ID=xxxx \
  WA_ACCESS_TOKEN=xxxx \
  WA_VERIFY_TOKEN=xxxx \
  SENDGRID_API_KEY=SG.xxxx \
  FROM_EMAIL=suplencias@hospital.com.uy \
  FROM_NAME="Mediflow Suplencias"
```

---

## 13. Mensajes de texto (plantillas)

```
CONVOCATORIA:
"[Mediflow] Guardia {sector} - {sede}
Turno: {inicio} a {fin}
Respondé con 1 para ACEPTAR o 2 para RECHAZAR.
Vence: {vencimiento}"

CONFIRMACIÓN:
"[Mediflow] Aceptaste la guardia {sector} {inicio}. ¡Gracias!"

RECHAZO:
"[Mediflow] Recibimos tu rechazo. Seguimos contactando."

RECORDATORIO:
"[Mediflow] Recordá que tenés guardia {sector} mañana a las {hora}."
```

---

## 14. Migración desde localStorage

Al conectar el backend real:

1. Reemplazar `storage.get/set` en cada store por llamadas a `fetch('/functions/v1/...')`
2. Mantener la misma firma de métodos (`convocatoriaStore.list()`, `.createAndSend()`, etc.)
3. Los tipos TypeScript (`convocatoria.types.ts`, `config.types.ts`) no cambian
4. El frontend no necesita saber que el transporte cambió

Patrón sugerido:
```typescript
// convocatoria.store.ts (versión real)
export const convocatoriaStore = {
  async list(): Promise<Convocatoria[]> {
    const res = await apiFetch('/convocatorias');
    return res.json();
  },
  async createAndSend(input): Promise<Convocatoria> {
    const res = await apiFetch('/convocatorias', { method: 'POST', body: JSON.stringify(input) });
    return res.json();
  }
  // ...
};
```
