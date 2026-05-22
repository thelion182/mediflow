import React, { useMemo, useState } from "react";
import { auditStore, type AuditEntry, type AuditEvento } from "./audit.store";
import { medicosStore } from "./medicos.store";

const EVENTO_LABEL: Record<AuditEvento, string> = {
  CONV_CREADA:               "Conv. creada",
  CONV_CANCELADA:            "Conv. cancelada",
  CONV_RESPONDIDA_ACEPTO:    "Guardia aceptada",
  CONV_RESPONDIDA_RECHAZO:   "Guardia rechazada",
  ASIG_CERRADA:              "Asig. cerrada",
  ASIG_CANCELADA:            "Asig. cancelada",
  DEVOLUCION_SOLICITADA:     "Devolución solicitada",
  DEVOLUCION_APROBADA:       "Devolución aprobada",
  DEVOLUCION_RECHAZADA:      "Devolución rechazada",
  MEDICO_EDITADO:            "Médico editado",
  CONVOCATORIA_EDITADA:      "Conv. editada",
};

const EVENTO_RGB: Record<AuditEvento, string> = {
  CONV_CREADA:               "21,101,192",
  CONV_CANCELADA:            "220,38,38",
  CONV_RESPONDIDA_ACEPTO:    "22,163,74",
  CONV_RESPONDIDA_RECHAZO:   "220,38,38",
  ASIG_CERRADA:              "100,116,139",
  ASIG_CANCELADA:            "220,38,38",
  DEVOLUCION_SOLICITADA:     "217,119,6",
  DEVOLUCION_APROBADA:       "22,163,74",
  DEVOLUCION_RECHAZADA:      "220,38,38",
  MEDICO_EDITADO:            "38,166,154",
  CONVOCATORIA_EDITADA:      "38,166,154",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

export function AuditoriaAdmin() {
  const [tick, setTick] = useState(0);
  const [q, setQ]       = useState("");
  const [filterEvento, setFilterEvento] = useState<"" | AuditEvento>("");
  const [page, setPage] = useState(0);
  const PER_PAGE = 40;

  const medicoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const med of medicosStore.list()) m.set(med.userId, med.displayName);
    return m;
  }, [tick]);

  const all = useMemo(() => auditStore.list(), [tick]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return all.filter(e => {
      if (filterEvento && e.evento !== filterEvento) return false;
      if (!qn) return true;
      return (
        e.actorName.toLowerCase().includes(qn) ||
        e.actorId.toLowerCase().includes(qn) ||
        e.entidadId.toLowerCase().includes(qn) ||
        (e.datos ? JSON.stringify(e.datos).toLowerCase().includes(qn) : false)
      );
    });
  }, [all, q, filterEvento]);

  const paged = useMemo(
    () => filtered.slice(0, (page + 1) * PER_PAGE),
    [filtered, page],
  );

  const eventos = useMemo(() => {
    const s = new Set<AuditEvento>();
    for (const e of all) s.add(e.evento);
    return Array.from(s).sort();
  }, [all]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Registro de auditoría</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{filtered.length} eventos</span>
        {all.length > 0 && (
          <button
            onClick={() => { if (confirm("¿Limpiar todo el historial?")) { auditStore.clear(); setTick(t => t + 1); } }}
            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 12px", borderRadius: 8, cursor: "pointer",
              border: "1px solid rgba(220,38,38,0.30)", background: "rgba(220,38,38,0.06)", color: "rgb(185,28,28)" }}
          >Limpiar historial</button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          placeholder="Buscar por actor, ID, entidad…"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(0); }}
          style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 13, color: "var(--text)", fontFamily: "inherit" }}
        />
        <select
          value={filterEvento}
          onChange={e => { setFilterEvento(e.target.value as any); setPage(0); }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12.5, color: "var(--text)", cursor: "pointer" }}
        >
          <option value="">Todos los eventos</option>
          {eventos.map(ev => (
            <option key={ev} value={ev}>{EVENTO_LABEL[ev] ?? ev}</option>
          ))}
        </select>
        <button onClick={() => setTick(t => t + 1)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", cursor: "pointer", fontSize: 13, color: "var(--muted)" }} title="Recargar">↺</button>
      </div>

      {paged.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--subtle)", textAlign: "center", padding: "32px 0" }}>
          {all.length === 0 ? "Sin eventos registrados aún. Los eventos se generan al crear, cancelar o responder convocatorias." : "Sin resultados para los filtros aplicados."}
        </p>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {paged.map((e: AuditEntry) => {
          const rgb = EVENTO_RGB[e.evento] ?? "100,116,139";
          return (
            <div key={e.id} style={{
              display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 14px",
              borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border-2)",
              borderLeft: `3px solid rgb(${rgb})`,
            }}>
              <div style={{ minWidth: 120, fontSize: 11, color: "var(--subtle)", flexShrink: 0, paddingTop: 2 }}>
                {formatDate(e.timestamp)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
                    border: `1px solid rgba(${rgb},0.22)`,
                  }}>{EVENTO_LABEL[e.evento] ?? e.evento}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{e.actorName}</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>({e.actorId})</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>
                  Entidad: <span style={{ fontFamily: "monospace", color: "var(--text)", fontWeight: 500 }}>{e.entidadId}</span>
                  {e.datos && Object.keys(e.datos).length > 0 && (
                    <span style={{ marginLeft: 10, color: "var(--subtle)" }}>
                      {Object.entries(e.datos).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {paged.length < filtered.length && (
        <button
          onClick={() => setPage(p => p + 1)}
          style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 9, border: "1px solid var(--border)",
            background: "var(--surface-2)", cursor: "pointer", fontSize: 13, color: "var(--blue)", fontWeight: 600 }}
        >
          Cargar más ({filtered.length - paged.length} restantes)
        </button>
      )}
    </div>
  );
}
