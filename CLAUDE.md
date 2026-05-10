# MediFlow — Contexto de Proyecto para Claude

## Qué es este proyecto

Sistema de gestión de guardias y suplencias médicas para una mutualista uruguaya.
Permite crear convocatorias de turno, invitar médicos por orden de score/prioridad,
registrar aceptaciones/rechazos en tiempo real y hacer seguimiento operativo en el Parte Diario.

**Demo interactivo completo con datos en localStorage — backend Supabase preparado, no conectado.**

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Estilos | CSS variables globales `src/index.css` + inline styles (`React.CSSProperties`) |
| Estado | localStorage via `src/core/storage.ts` (stores tipados) |
| Backend | Supabase: PostgreSQL 15, Auth JWT, Edge Functions (Deno), pg_cron |
| Router | React Router v6 |
| Deploy | Vite build → GitHub Pages / servidor estático |

---

## Estructura de carpetas

```
src/
  auth/
    auth.types.ts            # Role, User
    auth.store.ts            # getSession, loginByIdOrUserId, loginWithPassword, clear
    LoginPage.tsx            # Login con contraseña, quick-access por rol, hint contraseña
  core/
    storage.ts               # get/set localStorage
    date.ts                  # toLocalDateTimeInputValue, minutesFromNow, nowIso
    id.ts                    # newId(prefix)
    csv.ts                   # parseCsv
    hours.ts                 # hoursBetween
  modules/
    admin/
      medicos.store.ts       # 22 médicos demo, TITULAR/SUPLENTE/INDEPENDIENTE
      medicos.types.ts       # Medico, MedicoTipo
      sedes.store.ts         # Sedes con tipo y departamento
      sedes.types.ts
      sectores.store.ts
      sectores.types.ts
      AdminDashboard.tsx     # CRUD médicos, sedes, sectores
    config/
      config.store.ts        # SystemConfig: scoring, canales, fotos, timeouts
      config.types.ts        # SystemConfig, CANAL_META
      users.store.ts         # UserRecord, checkPassword, setPassword, getConfig
      ConfigPage.tsx         # 6 tabs: Usuarios, Canales, Convocatorias, Scoring, Org, Auditoría
      UsersAdmin.tsx         # CRUD usuarios + contraseñas por rol
    convocatorias/
      convocatoria.types.ts  # Convocatoria, Invitacion, Asignacion, Canal, autoRenew, prioMode
      convocatoria.store.ts  # CRUD + autoAdvance secuencial + autoRenewIfNeeded + hardDelete
      prio.audit.store.ts    # Registro auditoría prioridad manual
      SuplenciasDashboard.tsx # Dashboard principal, cards/lista, filtros, cobertura, hard delete
      NuevaConvocatoria.tsx  # Formulario completo: lugar, turno, canales, modo, auto-renovar,
                             #   prioMode scoring/manual, filtros tipo médico, actividad mensual
      ReporteHoras.tsx       # 5 tabs: Hechas / Aceptadas / Rechazadas / Horas / Marcas biométricas
      ConvocatoriaDetalle.tsx# Detalle individual, responder como médico, cerrar guardia
    medico/
      MedicoHome.tsx         # Vista del rol MÉDICO: mis convocatorias activas, KPIs, aceptar/rechazar
    parte-diario/
      ParteDiario.tsx        # Vista operativa diaria con filtros zona/sede/sector
  ui/
    AppShell.tsx             # Sidebar + nav por rol + cambio de contraseña inline (🔑)
  assets/
    branding/mediflow-lockup.png
backend/
  supabase/
    migrations/              # SQL: schema, RLS, scoring fn, pg_cron
    functions/               # Edge Functions: auth, convocatorias, invitaciones, scoring,
                             #   medicos, webhooks (whatsapp, sms)
```

---

## Roles de usuario

| ID demo | Rol | Acceso |
|---------|-----|--------|
| F-9999  | SUPER_ADMIN | Todo + hard delete + auditoría prioridades + gestión usuarios |
| F-2001  | ADMIN | Catálogos, médicos, sedes, reportes, usuarios |
| F-1001  | COORDINADOR | Dashboard, nueva convocatoria, reportes, admin |
| F-93598 (cualquier médico del catálogo) | MEDICO | Solo `/medico` — sus convocatorias |

**Contraseña por defecto:** `mediflow2024` (configurable por SUPER_ADMIN en Configuración → Usuarios)
Cada usuario puede cambiar su propia contraseña desde el icono 🔑 en el sidebar.

---

## Stores clave (localStorage)

| Store | Key | Función |
|-------|-----|---------|
| `convocatoriaStore` | `mediflow.convocatorias.v1` | CRUD, avance secuencial, autoRenew, hardDelete |
| `medicosStore` | `mediflow.catalogo.medicos.v2` | 22 médicos demo, tipos, prioridades |
| `sedesStore` | `mediflow.catalogo.sedes.v1` | Sedes con tipo y departamento |
| `sectoresStore` | `mediflow.catalogo.sectores.v1` | Sectores activos |
| `configStore` | `mediflow.config.v3` | SystemConfig completo |
| `authStore` | `mediflow.session` | Sesión activa (userId, role, displayName) |
| `usersStore` | `mediflow.users.v1` | Usuarios del sistema, passwords individuales |
| `prioAuditStore` | `mediflow.prio.audit.v1` | Registros de prioridad manual |

---

## Catálogo de médicos demo (22 médicos)

### TITULAR (7) — prioridades 1–7
Dra. Laura Redondo (Cardiología), Dr. Martín Sosa (Medicina General), Dra. Gabriela Ferreira (Pediatría),
Dr. Rodrigo Bentancur (Emergentología), Dra. Sofía Álvarez (Ginecología), Dr. Federico Núñez (Traumatología),
Dra. Patricia Montero (Neurología)

### SUPLENTE (10) — prioridades 10–19
Dr. Diego Suárez, Dr. Pablo Cardoso, Dra. Valentina Sánchez, Dr. Nicolás Herrera, Dra. Camila Vega,
Dr. Andrés Morales (Gastroenterología), Dra. Luciana Pereira (Cardiología), Dr. Tomás Ríos (Traumatología),
Dra. Florencia Castro (Dermatología), Dr. Ignacio Méndez (Psiquiatría)

### INDEPENDIENTE (5) — prioridades 25–29
Dr. Alejandro Rojas (Oncología), Dra. Natalia Ibáñez (Endocrinología), Dr. Sebastián Lema,
Dra. Mariana Otero (Neurología), Dr. Gustavo Acosta (Emergentología)

---

## Tipos principales

```typescript
// convocatoria.types.ts
type ConvocatoriaEstado = "BORRADOR" | "ENVIADA" | "PARCIAL" | "CUBIERTA" | "VENCIDA" | "CANCELADA"
type InvitacionEstado   = "EN_ESPERA" | "ENVIADA" | "VISTA" | "ACEPTO" | "RECHAZO" | "SIN_RESPUESTA" | "VENCIDA"
type AsignacionEstado   = "CONFIRMADA" | "CANCELADA_POR_MEDICO" | "REEMPLAZADA" | "CUMPLIDA" | "NO_CUMPLIDA"
type Canal              = "APP" | "WHATSAPP" | "SMS" | "EMAIL"
type ModoEnvio          = "MASIVO" | "SECUENCIAL"

type Convocatoria = {
  id, sector, sede, inicio, fin, cupos, vencimiento, prioridad, notas,
  modoEnvio, canales, timeouts: { sinVerMin, sinResponderMin },
  estado, invitaciones, asignaciones,
  // Nuevos campos:
  autoRenew?, autoRenewMinutes?, autoRenewMaxCount?, autoRenewCount?,
  prioMode?: "SCORING" | "MANUAL",
  cancelReason?, updatedAt, createdAt, createdBy
}

// medicos.types.ts
type MedicoTipo = "TITULAR" | "SUPLENTE" | "INDEPENDIENTE"
type Medico = { userId, displayName, cedula?, funcionario?, especialidad?,
                tipo, prioridad?, telefono?, activo }

// users.store.ts
type UserRecord = { userId, displayName, role: Role, password?, activo,
                    cedula?, funcionario?, email? }

// prio.audit.store.ts
type PrioAuditEntry = { id, timestamp, actorId, actorName, sector, sede?,
                        overrides: Array<{ medicoId, medicoName, catPrio?, overridePrio }> }
```

---

## Reglas de negocio

### Sectores restringidos
- **Ambulancias** y **Piso** → solo en sedes tipo `SANATORIO`
- Policlínicas, Domicilios, Retenes → cualquier sede

### Zonas geográficas (Parte Diario)
- **Montevideo**: `sede.departamento === "Montevideo"`
- **Interior**: cualquier otro departamento (Canelones, Colonia, Maldonado, etc.)

### Modo secuencial
1 cupo + SECUENCIAL: se envía al primer médico en lista. Si no responde en `sinVerMin` o `sinResponderMin` minutos, se vence y pasa al siguiente. El UI muestra countdown en vivo.

### Auto-renovación
Si `autoRenew=true`, cuando la convocatoria vence sin cobertura, `hydrate()` la renueva automáticamente:
- Extiende `vencimiento` por `autoRenewMinutes` minutos
- Incrementa `autoRenewCount` (se detiene cuando llega a `autoRenewMaxCount`)
- Si secuencial y sin activos, resetea invitaciones a EN_ESPERA y activa el primero

### Prioridad modo MANUAL
Si el coordinador elige modo "Manual" al crear una convocatoria, al enviar se guarda un
`PrioAuditEntry` en `prioAuditStore`. El SUPER_ADMIN ve estos registros en Configuración → Auditoría prioridades.

### Scoring
4 métricas × pesos configurables (suman 100): tasa de aceptación, velocidad de respuesta,
puntualidad (CUMPLIDA/CONFIRMADA), disponibilidad horaria. Pesos en `SystemConfig.scoring`.

---

## Módulos / pantallas

### Dashboard (`/dashboard`)
- KPI cards: En curso / Cubiertas / Parciales / Vencidas / Canceladas
- Vista cards y lista con filtros por estado
- Panel de cobertura (Hoy/Semana/Mes/Rango) con barra por sector y sede
- Secuencial en vivo: countdown por médico activo
- SUPER_ADMIN: 🗑 hard delete por hover (columna propia en lista, overlay en cards)

### Nueva Convocatoria (`/dashboard/nueva`)
- **Izquierda**: lugar/turno, prioridad/modo, prioMode (scoring/manual), auto-renovación, canales, notas, preview orden
- **Derecha (sticky)**: filtros tipo médico (TITULAR/SUPLENTE/INDEPENDIENTE + contadores), especialidad, búsqueda, selección rápida; lista de médicos con actividad mensual del mes actual ("● En guardia" / "N× este mes")
- En modo MANUAL: inputs de prioridad siempre visibles, warning de auditoría

### Parte Diario (`/parte-diario`)
- Vista diaria de guardias con selector de fecha
- Filtros: Zona (Montevideo/Interior), Sede, Sector
- Edición inline: cerrar guardia (CUMPLIDA/NO_CUMPLIDA), cancelar asignación, asignar manual

### Reportes (`/dashboard/reportes/horas`)
5 tabs: **Hechas** (todas las convocatorias del período), **Aceptadas** (por médico), **Rechazadas** (con motivo),
**Horas** (totales por médico incluyendo CONFIRMADA), **Marcas biométricas** (importar CSV)

### Administración (`/admin`)
- Catálogo de médicos (CRUD, tipo, prioridad, foto)
- Sedes (tipo, departamento, teléfono)
- Sectores (activo/inactivo)

### Configuración (`/config`) — SUPER_ADMIN y ADMIN
Tabs: **Usuarios**, **Canales** (App/WA/SMS/Email + providers), **Convocatorias** (defaults),
**Scoring** (pesos), **Organización** (nombre, fotos), **Auditoría prioridades** (solo SUPER_ADMIN)

### Vista médico (`/medico`)
- KPI chips: Pendientes / Confirmadas / Rechazadas / Sin cupo
- Cards por estado con acento de color, botones aceptar/rechazar
- Auto-mark "Vista" con IntersectionObserver

### Login (`/login`)
- Contraseña global (por defecto "mediflow2024") con hint visible
- Campo con show/hide contraseña
- Botones quick-access por rol (llenan ID + contraseña automáticamente)
- Botón "Super Admin (Demo)" como demo rápido

### AppShell (sidebar)
- Navegación filtrada por rol
- Tarjeta de usuario con icono 🔑 → formulario inline de cambio de contraseña
- Cerrar sesión

---

## Convenciones de código

- Estilos: `React.CSSProperties` objects al final del archivo, inline para condicionales
- Nunca usar clases CSS globales excepto `.input`, `.btn`, `.btnGhost` (en `index.css`)
- IDs generados con `newId()` de `src/core/id.ts`
- Fechas siempre en ISO 8601, formateo `toLocaleString("es-UY", ...)`
- Stores: `const KEY = "mediflow.xxx.vN"`, bumpar N para forzar reset de localStorage
- Importaciones: stores antes de componentes, tipos antes de valores
- Sin comentarios explicativos de "qué hace" — solo "por qué" cuando no es obvio

---

## Git & Deploy

- Repo: https://github.com/thelion182/mediflow
- Branch: `main`
- Siempre commit + push al terminar cambios significativos
- Co-Authored-By: `Claude Sonnet 4.6 <noreply@anthropic.com>`
- Mensaje de commit en español, imperativo

---

## Estado operativo (mayo 2026)

### Implementado y funcional
- [x] Login con contraseña global + contraseñas individuales persistentes
- [x] Cambio de contraseña propio desde sidebar
- [x] Dashboard: cards + lista, filtros, KPIs, cobertura por sector/sede/período
- [x] Secuencial en vivo con countdown + auto-avance por timeouts
- [x] Parte Diario con filtros zona/sede/sector, edición inline
- [x] Nueva Convocatoria: modo scoring/manual, auto-renovación, actividad mensual, tipos de médico
- [x] Auditoría de prioridades manuales (log + vista SUPER_ADMIN)
- [x] Reportes 5 tabs: hechas, aceptadas, rechazadas, horas, marcas biométricas
- [x] Administración: CRUD médicos (22 demo), sedes, sectores
- [x] Configuración: usuarios+passwords, canales, scoring, fotos, timeouts, auditoría
- [x] Vista médico rediseñada con KPIs y IntersectionObserver
- [x] Hard delete SUPER_ADMIN con hover (sin solapar layout)
- [x] Fotos de médicos desde URL configurable
- [x] Backend Supabase preparado: schema SQL, RLS, Edge Functions, pg_cron, scoring

### Pendiente
- [ ] Conectar frontend con backend (reemplazar stores localStorage por fetch a API)
- [ ] Envío real WhatsApp/SMS (Twilio / Meta / SMSMasivos.uy)
- [ ] Parámetros de reglas de scoring adicionales (MULTIPLICADOR/PUNTOS por sector/horario)
- [ ] Push notifications móviles (PWA/FCM)
- [ ] Módulo de supervisión global SUPER_ADMIN (auditoría total de operaciones)
