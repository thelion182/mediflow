import React, { useMemo, useState } from "react";
import { MedicosAdmin } from "./MedicosAdmin";
import { SedesAdmin } from "./SedesAdmin";
import { SectoresAdmin } from "./SectoresAdmin";
import { AppShell } from "../../ui/AppShell";

type Tab = "MEDICOS" | "SEDES" | "SECTORES";

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
    if (tab === "SEDES") {
      return "Catálogo de Sedes. Se usa para clasificar y filtrar convocatorias.";
    }
    return "Catálogo de Sectores. Se usa para clasificar y filtrar convocatorias.";
  }, [tab]);

  return (
    <AppShell>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>Administración</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>{subtitle}</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {(["MEDICOS", "SEDES", "SECTORES"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "8px 16px",
            borderRadius: "8px 8px 0 0",
            border: "1px solid var(--border)",
            borderBottom: tab === t ? "2px solid var(--teal)" : "1px solid var(--border)",
            background: tab === t ? "var(--teal-tint)" : "var(--surface)",
            color: tab === t ? "var(--teal-dark)" : "var(--muted)",
            fontWeight: tab === t ? 700 : 500,
            fontSize: 13.5,
            cursor: "pointer",
            marginBottom: -1,
            transition: "background 0.12s, color 0.12s",
          }}>
            {t === "MEDICOS" ? "Médicos" : t === "SEDES" ? "Sedes" : "Sectores"}
          </button>
        ))}
      </div>

      {tab === "MEDICOS"   ? <MedicosAdmin />   : null}
      {tab === "SEDES"     ? <SedesAdmin />     : null}
      {tab === "SECTORES"  ? <SectoresAdmin />  : null}
    </AppShell>
  );
}
