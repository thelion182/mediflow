# Mediflow Backend

Stack: **Supabase** (PostgreSQL 15, Auth, Edge Functions Deno, pg_cron, Realtime)

## Estructura

```
backend/
  supabase/
    config.toml                  # configuración local Supabase
    migrations/
      001_schema.sql             # tablas, tipos, triggers
      002_rls.sql                # Row Level Security por rol
      003_scoring_fn.sql         # funciones PL/pgSQL + pg_cron jobs
    functions/
      _shared/
        cors.ts                  # helpers CORS + Response
        auth.ts                  # requireAuth, getSupabase, getServiceClient
        types.ts                 # tipos compartidos (espejo del frontend)
      auth/index.ts              # login, logout, me
      convocatorias/index.ts     # CRUD + crear+enviar
      invitaciones/index.ts      # responder, cancelar, asignar manual
      scoring/index.ts           # scores, config, reglas
      medicos/index.ts           # CRUD médicos + score individual
      webhooks/
        whatsapp/index.ts        # Meta WA / Twilio WA → procesar respuesta
        sms/index.ts             # Twilio SMS / SMSMasivos / AWS SNS
  .env.example
```

## Endpoints

| Método | Ruta | Rol mínimo | Descripción |
|--------|------|-----------|-------------|
| POST | `/auth/login` | — | Login email+password |
| GET | `/auth/me` | cualquiera | Perfil propio |
| GET | `/convocatorias` | COORDINADOR | Lista completa |
| POST | `/convocatorias` | COORDINADOR | Crear + enviar |
| PATCH | `/convocatorias/:id` | COORDINADOR | Editar estado |
| POST | `/invitaciones/responder` | MEDICO | Acepta/Rechaza |
| POST | `/invitaciones/marcar-vista` | MEDICO | Marca vista |
| POST | `/invitaciones/cancelar` | COORDINADOR | Cancela asignación |
| POST | `/invitaciones/asignar` | COORDINADOR | Asignación manual |
| GET | `/medicos` | COORDINADOR | Catálogo médicos |
| POST | `/medicos` | COORDINADOR | Upsert médico |
| GET | `/scoring` | COORDINADOR | Scores cacheados |
| POST | `/scoring/recalcular` | ADMIN | Fuerza recálculo |
| GET | `/scoring/config` | COORDINADOR | Configuración scoring |
| PUT | `/scoring/config` | ADMIN | Guardar config scoring |
| GET | `/scoring/reglas` | COORDINADOR | Lista reglas adicionales |
| POST | `/scoring/reglas` | ADMIN | Crear regla |
| PUT | `/scoring/reglas/:id` | ADMIN | Editar regla |
| DELETE | `/scoring/reglas/:id` | ADMIN | Eliminar regla |
| POST | `/webhooks/whatsapp` | — (HMAC) | Respuestas WA |
| POST | `/webhooks/sms` | — | Respuestas SMS |

## Scoring

El score de cada médico se calcula con 4 métricas ponderadas (pesos configurables por ADMIN):

| Métrica | Por defecto | Descripción |
|---------|-------------|-------------|
| Aceptación | 40% | ACEPTO / (ACEPTO + RECHAZO + SIN_RESPUESTA) |
| Velocidad | 25% | Normalizado: 0 min → 100%, 60 min → 0% |
| Puntualidad | 25% | CUMPLIDA / total asignaciones cerradas |
| Disponibilidad | 10% | Acepta turnos nocturnos (20h–7h) / fin de semana |

### Reglas adicionales (scoring_reglas)

Sobre el score base se pueden aplicar **reglas configurables** que el Admin crea vía `/scoring/reglas`:

```json
{
  "nombre": "Bonus turnos noche",
  "tipo": "HORARIO",
  "condicion": { "horaInicio": 20, "horaFin": 7 },
  "modificador_tipo": "MULTIPLICADOR",
  "modificador_valor": 1.15,
  "activa": true,
  "orden": 1
}
```

- `MULTIPLICADOR`: `score_final = score_base × valor`
- `PUNTOS`: `score_final = score_base + valor`

Las reglas se aplican en orden creciente de `orden`. El score final se clampea a 0–100.

El recálculo ocurre automáticamente cada noche (pg_cron `0 2 * * *`) y puede forzarse desde la UI (Admin → Scoring → Recalcular).

## Setup local

```bash
# 1. Instalar Supabase CLI
npx supabase login

# 2. Iniciar stack local
cd backend
npx supabase start

# 3. Aplicar migraciones
npx supabase db push

# 4. Servir Edge Functions
npx supabase functions serve --env-file .env.local

# 5. URL local de la API
# http://127.0.0.1:54321/functions/v1/<function-name>
```

## Despliegue en Supabase Cloud

```bash
# Enlazar con proyecto remoto
npx supabase link --project-ref <project-ref>

# Push migraciones
npx supabase db push

# Deploy functions
npx supabase functions deploy convocatorias
npx supabase functions deploy invitaciones
npx supabase functions deploy scoring
npx supabase functions deploy medicos
npx supabase functions deploy auth
npx supabase functions deploy webhooks/whatsapp
npx supabase functions deploy webhooks/sms

# Configurar secrets de producción
npx supabase secrets set WA_WEBHOOK_VERIFY_TOKEN=xxx
npx supabase secrets set TWILIO_AUTH_TOKEN=xxx
# (etc.)
```

## Variables de entorno requeridas en producción

Ver `.env.example`. Las mínimas para arrancar son:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (las pone Supabase automáticamente en Edge Functions)
- `WA_WEBHOOK_VERIFY_TOKEN` para verificar el webhook de Meta

## Business rules implementadas

- **Ambulancias / Piso → solo SANATORIO**: validado en frontend (warning) y pendiente de validar en backend (migration futura)
- **Cupos > 1 → modo MASIVO**: forzado en Edge Function `/convocatorias` POST
- **Secuencial**: avance automático por pg_cron cada minuto (`avanzar_secuencial()`)
- **Vencimiento**: conveyed en el webhook y en la Edge Function de respuesta

## Próximos pasos

- [ ] Migración de datos del localStorage al backend (script import)
- [ ] Configurar reglas de scoring adicionales (pendiente de parámetros del usuario)
- [ ] Sistema de notificaciones push (Supabase Realtime → frontend)
- [ ] Módulo de envío real de mensajes (queue con pg_cron o Edge Function worker)
- [ ] Reportes y exportación CSV (endpoint `/reportes`)
- [ ] Tests E2E con Supabase local
