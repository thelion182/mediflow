# MediFlow — Contexto de Proyecto para Claude

## Qué es este proyecto
Sistema de gestión de guardias y suplencias médicas para una mutualista uruguaya (ASSE/privada).
Permite crear convocatorias de turno, invitar médicos por orden de score/prioridad, registrar aceptaciones/rechazos, y hacer seguimiento en el Parte Diario.

**Demo interactivo con datos en localStorage — sin backend conectado aún.**

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilos | CSS variables globales en `src/index.css`, inline styles en componentes |
| Estado | localStorage via `src/core/storage.ts` (stores simples) |
| Backend (preparado, no conectado) | Supabase: PostgreSQL 15, Auth, Edge Functions (Deno), pg_cron |
| Router | React Router v6 |
| Deploy | Vite build → GitHub Pages / servidor estático |

## Estructura de carpetas

```
src/
  auth/            # Login, authStore, tipos de rol y rutas
  core/            # Utilidades: storage, date, id, csv, hours
  modules/
    admin/         # Médicos, Sedes, Sectores (catálogos + AdminDashboard)
    config/        # Configuración del sistema (pesos scoring, fotos, etc.)
    convocatorias/ # CRUD convocatorias, SuplenciasDashboard, ReporteHoras, NuevaConvocatoria
    parte-diario/  # ParteDiario (Gantt diario con edición inline)
  ui/              # AppShell (sidebar + layout)
  assets/          # branding/mediflow-lockup.png
backend/
  supabase/
    migrations/    # SQL: schema, RLS, funciones scoring, pg_cron
    functions/     # Edge Functions: auth, convocatorias, invitaciones, scoring, medicos, webhooks
```

## Roles de usuario

| ID demo | Rol | Acceso |
|---------|-----|--------|
| 9999 | SUPER_ADMIN | Todo + supervisión global |
| 2001 | ADMIN | Configuración, médicos, sedes, reportes |
| 1001 | COORDINADOR | Dashboard, nueva convocatoria, reportes, admin |
| 93598 | MEDICO | Solo sus convocatorias (`/medico`) |

## Stores clave (localStorage)

- `convocatoriaStore` — CRUD convocatorias, avance secuencial, asignaciones manuales
- `medicosStore` — catálogo de médicos con score, foto, especialidad
- `sedesStore` — sedes con tipo (SANATORIO/FILIAL) y departamento (Montevideo/Interior)
- `sectoresStore` — catálogo de sectores activos
- `configStore` — pesos scoring, configuración fotos, timeouts
- `authStore` — sesión activa (userId, role, displayName)

## Reglas de negocio importantes

- **Ambulancias** y **Piso** → solo en sedes tipo `SANATORIO`
- **Policlínicas, Domicilios, Retenes** → pueden ir en cualquier sede
- Sedes Montevideo: `departamento === "Montevideo"`
- Sedes Interior: `departamento !== "Montevideo"` (Canelones, Colonia, etc.)
- Score médico: 4 métricas (aceptación, velocidad, puntualidad, disponibilidad) × pesos configurables
- `scoring_reglas` table: reglas adicionales MULTIPLICADOR/PUNTOS (pendiente de configurar por usuario)

## Convenciones de código

- Estilos: `React.CSSProperties` objects al final del archivo, inline para estilos condicionales
- Nunca usar clases CSS globales excepto `.input`, `.btn`, `.btnGhost`, `.field` (definidas en index.css)
- Componentes en PascalCase, funciones helper en camelCase
- IDs generados con `newId()` de `src/core/id.ts`
- Fechas siempre en ISO 8601, formateo con `toLocaleString("es-UY", ...)`
- Stores siguen patrón: `const KEY = "mediflow.xxx.v1"`, `storage.get<T[]>(KEY, [])`, `storage.set(KEY, data)`

## Tipos principales

```typescript
// convocatoria.types.ts
type ConvocatoriaEstado = "BORRADOR" | "ENVIADA" | "PARCIAL" | "CUBIERTA" | "VENCIDA" | "CANCELADA"
type InvitacionEstado   = "EN_ESPERA" | "ENVIADA" | "VISTA" | "ACEPTO" | "RECHAZO" | "SIN_RESPUESTA" | "VENCIDA"
type AsignacionEstado   = "CONFIRMADA" | "CANCELADA_POR_MEDICO" | "REEMPLAZADA" | "CUMPLIDA" | "NO_CUMPLIDA"
type Canal              = "APP" | "WHATSAPP" | "SMS" | "EMAIL"

// sedes.types.ts
type SedeTipo = "SANATORIO" | "FILIAL"
// Sede tiene: id, nombre, tipo, departamento?, direccion?, telefono?, activo?
```

## Backend Supabase (preparado, no conectado)

Migraciones en `backend/supabase/migrations/`:
- `001_schema.sql` — tablas, enums, triggers
- `002_rls.sql` — RLS policies, helpers `auth_role()`, `is_admin_or_above()`
- `003_scoring_fn.sql` — `calcular_scores()`, `aplicar_reglas_scoring()`, `refresh_scores_cache()`, pg_cron

Edge Functions en `backend/supabase/functions/`:
- `auth/`, `convocatorias/`, `invitaciones/`, `scoring/`, `medicos/`
- `webhooks/whatsapp/`, `webhooks/sms/`

**Pendiente:** conectar frontend (reemplazar localStorage stores con llamadas a API)

## Git & Deploy

- Repo: https://github.com/thelion182/mediflow
- Branch principal: `main`
- Siempre hacer commit + push al terminar cambios significativos
- Mensaje de commit en español o inglés, con `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Estado actual (mayo 2026)

- [x] UI completa: Login, Dashboard, Parte Diario, Nueva Convocatoria, Admin, Config, Reportes
- [x] Scoring configurable (pesos) + DoctorAvatar con foto desde carpeta configurable
- [x] Reportes multi-tab: hechas / aceptadas / rechazadas / horas / marcas biométricas
- [x] Backend Supabase preparado (migraciones + Edge Functions), no conectado
- [ ] Conectar frontend con backend
- [ ] Scoring reglas adicionales (usuario proveerá parámetros: sector, horario, etc.)
- [ ] Módulo envío real WhatsApp/SMS
- [ ] Features SUPER_ADMIN supervisión global
