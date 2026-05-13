import React, { useMemo, useState } from "react";
import { MedicosAdmin } from "./MedicosAdmin";
import { SedesAdmin } from "./SedesAdmin";
import { SectoresAdmin } from "./SectoresAdmin";
import { ScoringAdmin } from "./ScoringAdmin";
import { GuardiasFijasAdmin } from "./GuardiasFijasAdmin";
import { EspecialidadesAdmin } from "./EspecialidadesAdmin";
import { AppShell } from "../../ui/AppShell";

type Tab = "MEDICOS" | "SEDES" | "SECTORES" | "SCORING" | "GUARDIAS_FIJAS" | "ESPECIALIDADES";

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("MEDICOS");

  const subtitle = useMemo(() => {
    if (tab === "MEDICOS") {
      return (
        "Catálogo de Médicos. Identificación por CI o Nro Funcionario. " +
        "Tipos: Titular / Suplente / Independiente. " +
        "Prioridad: 1 = primero (impacta en Nueva Convocatoria → modo Secuencial)."
      );
    }
    if (tab === "SEDES") return "Catálogo de Sedes. Se usa para clasificar y filtrar convocatorias.";
    if (tab === "SECTORES") return "Catálogo de Sectores. Se usa para clasificar y filtrar convocatorias.";
    if (tab === "GUARDIAS_FIJAS") return "Médicos con turno fijo recurrente. Se proyectan automáticamente en el Parte Diario según el día de la semana.";
    if (tab === "ESPECIALIDADES") return "Catálogo de especialidades médicas. Administrá la lista y el emoji de cada una. Se usa como desplegable al crear médicos y al crear guardias fijas.";
    return "Scores calculados automáticamente a partir del historial de convocatorias. Configurá los pesos en Configuración → Scoring.";
  }, [tab]);

  return (
    <AppShell>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Administración</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>{subtitle}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 0, flexWrap: "wrap" }}>
        {([
          { key: "MEDICOS",        label: "Médicos"         },
          { key: "SEDES",          label: "Sedes"           },
          { key: "SECTORES",       label: "Sectores"        },
          { key: "GUARDIAS_FIJAS",  label: "Guardias Fijas"  },
          { key: "ESPECIALIDADES", label: "Especialidades"  },
          { key: "SCORING",        label: "Scoring"         },
        ] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 16px",
            borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)",
            borderBottom: tab === t.key ? "2px solid var(--teal)" : "1px solid var(--border)",
            background: tab === t.key ? "var(--teal-tint)" : "var(--surface)",
            color: tab === t.key ? "var(--teal-dark)" : "var(--muted)",
            fontWeight: tab === t.key ? 700 : 500,
            fontSize: 13.5,
            cursor: "pointer",
            marginBottom: -1,
            transition: "background 0.12s, color 0.12s",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "MEDICOS"        ? <MedicosAdmin />        : null}
      {tab === "SEDES"          ? <SedesAdmin />          : null}
      {tab === "SECTORES"       ? <SectoresAdmin />       : null}
      {tab === "GUARDIAS_FIJAS"  ? <GuardiasFijasAdmin />   : null}
      {tab === "ESPECIALIDADES" ? <EspecialidadesAdmin /> : null}
      {tab === "SCORING"        ? <ScoringAdmin />         : null}
    </AppShell>
  );
}
