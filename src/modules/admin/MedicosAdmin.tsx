import React, { useMemo, useState } from "react";
import { parseCsv } from "../../core/csv";
import { medicosStore } from "./medicos.store";
import type { Medico, MedicoTipo } from "./medicos.types";

function normalizeUserId(input: string) {
  return (input || "").trim();
}

function normalizeTipo(raw: any): MedicoTipo {
  const t = String(raw || "").trim().toUpperCase();
  if (t === "TITULAR" || t === "SUPLENTE" || t === "INDEPENDIENTE") return t as MedicoTipo;
  return "SUPLENTE";
}

// prioridad: entero >= 1, o undefined si vacío / inválido
function normalizePrioridad(raw: any): number | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!isFinite(n)) return undefined;
  const v = Math.floor(n);
  if (v < 1) return 1;
  return v;
}

// Para UI: en tu store, prioridad ausente suele caer a 9999; lo mostramos como "—"
function prioLabel(n: any) {
  return typeof n === "number" && isFinite(n) && n >= 1 && n < 9999 ? String(n) : "—";
}

export function MedicosAdmin() {
  const [tick, setTick] = useState(0);

  const [form, setForm] = useState<Medico>({
    userId: "",
    displayName: "",
    cedula: "",
    funcionario: "",
    especialidad: "",
    telefono: "",
    tipo: "SUPLENTE",
    prioridad: undefined,
    activo: true
  });

  const [csvText, setCsvText] = useState("");

  const list = useMemo(() => medicosStore.list(), [tick]);

  function refresh() {
    setTick(t => t + 1);
  }

  function onSave() {
    const userId = normalizeUserId(form.userId);
    if (!userId) return alert("userId es obligatorio (CI-xxxx o F-xxxx).");
    if (!form.displayName.trim()) return alert("displayName es obligatorio.");

    medicosStore.upsert({
      ...form,
      userId,
      displayName: form.displayName.trim(),
      cedula: form.cedula?.trim() || undefined,
      funcionario: form.funcionario?.trim() || undefined,
      especialidad: form.especialidad?.trim() || undefined,
      telefono: form.telefono?.trim() || undefined,
      tipo: normalizeTipo(form.tipo),
      prioridad: normalizePrioridad(form.prioridad),
      activo: form.activo ?? true
    });

    setForm({
      userId: "",
      displayName: "",
      cedula: "",
      funcionario: "",
      especialidad: "",
      telefono: "",
      tipo: "SUPLENTE",
      prioridad: undefined,
      activo: true
    });

    refresh();
  }

  function onImportCsv() {
    if (!csvText.trim()) return alert("Pegá el CSV en el cuadro primero.");
    const { rows } = parseCsv(csvText);

    const current = medicosStore.list();
    const map = new Map(current.map(m => [m.userId, m]));

    let ok = 0;
    let bad = 0;

    for (const r of rows) {
      const userId = normalizeUserId(r.userId || r.userid || r.USERID || r.UserId || "");
      const displayName = (r.displayName || r.nombre || r.display || r.Nombre || "").trim();

      if (!userId || !displayName) {
        bad++;
        continue;
      }

      const tipo = normalizeTipo(r.tipo || r.Tipo || r.TIPO);
      const prioridad = normalizePrioridad(
        r.prioridad ?? r.Prioridad ?? r.PRIORIDAD ?? r.prio ?? r.PRIO
      );

      const item: Medico = {
        userId,
        displayName,
        cedula: (r.cedula || r.ci || r.CI || "").trim() || undefined,
        funcionario: (r.funcionario || r.nrofuncionario || r.Funcionario || "").trim() || undefined,
        especialidad: (r.especialidad || r.Especialidad || "").trim() || undefined,
        telefono: (r.telefono || r.tel || r.Telefono || "").trim() || undefined,
        tipo,
        prioridad,
        activo: String(r.activo ?? r.Activo ?? "").trim()
          ? ["1", "true", "si", "sí", "yes"].includes(String(r.activo ?? r.Activo).trim().toLowerCase())
          : true
      };

      map.set(userId, { ...(map.get(userId) ?? item), ...item });
      ok++;
    }

    medicosStore.saveAll(Array.from(map.values()));
    setCsvText("");
    refresh();
    alert(`Importación OK: ${ok} filas. Omitidas: ${bad} (faltaba userId o displayName).`);
  }

  function onEdit(m: Medico) {
    setForm({
      userId: m.userId,
      displayName: m.displayName,
      cedula: m.cedula ?? "",
      funcionario: m.funcionario ?? "",
      especialidad: m.especialidad ?? "",
      telefono: m.telefono ?? "",
      tipo: (m.tipo as any) || "SUPLENTE",
      // si viene 9999 del store, lo volvemos undefined para editar cómodo
      prioridad: typeof m.prioridad === "number" && m.prioridad < 9999 ? m.prioridad : undefined,
      activo: m.activo ?? true
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDelete(userId: string) {
    if (!confirm(`Eliminar ${userId}?`)) return;
    medicosStore.remove(userId);
    refresh();
  }

  return (
    <div className="grid">
      <div className="panel half">
        <h3 style={{ margin: 0, fontSize: 14 }}>Médicos · Alta / Edición</h3>

        <div className="field">
          <label className="label">userId (CI-xxxx o F-xxxx)</label>
          <input
            className="input"
            value={form.userId}
            onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
          />
        </div>

        <div className="field">
          <label className="label">Nombre</label>
          <input
            className="input"
            value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
          />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="label">Tipo</label>
            <select
              className="select"
              value={String(form.tipo ?? "SUPLENTE")}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}
            >
              <option value="TITULAR">Titular</option>
              <option value="SUPLENTE">Suplente</option>
              <option value="INDEPENDIENTE">Independiente</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label className="label">Prioridad (1 = primero)</label>
            <input
              className="input"
              type="number"
              min={1}
              placeholder="(vacío = sin prioridad)"
              value={form.prioridad === undefined || form.prioridad === null ? "" : String(form.prioridad)}
              onChange={e => {
                const v = e.target.value;
                setForm(f => ({ ...f, prioridad: normalizePrioridad(v) }));
              }}
            />
          </div>
        </div>

        <div className="field">
          <label className="label">Cédula (opcional)</label>
          <input
            className="input"
            value={form.cedula as any}
            onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))}
          />
        </div>

        <div className="field">
          <label className="label">Nro funcionario (opcional)</label>
          <input
            className="input"
            value={form.funcionario as any}
            onChange={e => setForm(f => ({ ...f, funcionario: e.target.value }))}
          />
        </div>

        <div className="field">
          <label className="label">Especialidad (opcional)</label>
          <input
            className="input"
            value={form.especialidad as any}
            onChange={e => setForm(f => ({ ...f, especialidad: e.target.value }))}
          />
        </div>

        <div className="field">
          <label className="label">Teléfono (opcional)</label>
          <input
            className="input"
            value={form.telefono as any}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
            placeholder="+598..."
          />
        </div>

        <div className="field">
          <label className="label">Activo</label>
          <select
            className="select"
            value={String(form.activo ?? true)}
            onChange={e => setForm(f => ({ ...f, activo: e.target.value === "true" }))}
          >
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </div>

        <button className="btn" onClick={onSave}>Guardar</button>
      </div>

      <div className="panel half">
        <h3 style={{ margin: 0, fontSize: 14 }}>Médicos · Importar CSV</h3>
        <p className="sub" style={{ marginTop: 8 }}>
          Encabezados esperados: userId, displayName, tipo, prioridad, cedula, funcionario, especialidad, telefono, activo
        </p>

        <div className="field">
          <label className="label">Pegá el CSV acá</label>
          <textarea
            className="input"
            rows={10}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            style={{ resize: "vertical" }}
          />
        </div>

        <button className="btnGhost" onClick={onImportCsv}>Importar</button>

        <div className="pill" style={{ marginTop: 12 }}>
          Ejemplo:{" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            userId,displayName,tipo,prioridad,cedula,funcionario,especialidad,telefono,activo
          </span>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ margin: 0, fontSize: 14 }}>Médicos</h3>
        <p className="sub">Click en “Editar” para cargar el formulario arriba.</p>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {list.map(m => (
            <div key={m.userId} className="btnGhost" style={{ padding: 12, textAlign: "left" }}>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <b>{m.displayName}</b>
                <span className="pill">{m.userId}</span>
                <span className="pill">{String(m.tipo ?? "SUPLENTE")}</span>
                <span className="pill">Prio: {prioLabel(m.prioridad)}</span>
                <span className="pill">{(m.activo ?? true) ? "ACTIVO" : "INACTIVO"}</span>
              </div>

              <div className="sub" style={{ marginTop: 6 }}>
                {m.especialidad ? `Especialidad: ${m.especialidad} · ` : ""}
                {m.funcionario ? `Func: ${m.funcionario} · ` : ""}
                {m.cedula ? `CI: ${m.cedula} · ` : ""}
                {m.telefono ? `Tel: ${m.telefono}` : ""}
              </div>

              <div className="row" style={{ marginTop: 10, gap: 10 }}>
                <button className="btnGhost" onClick={() => onEdit(m)}>Editar</button>
                <button
                  className="btnGhost"
                  onClick={() => onDelete(m.userId)}
                  style={{ borderColor: "rgba(239,68,68,.25)" }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
