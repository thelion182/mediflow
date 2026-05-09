import React, { useMemo, useState } from "react";
import { parseCsv } from "../../core/csv";
import { sedesStore } from "./sedes.store";
import type { Sede, SedeTipo } from "./sedes.types";

function parseBool(v: any, def = true) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return def;
  return ["1", "true", "si", "sí", "yes"].includes(s);
}

function slugify(input: string) {
  return (input || "")
    .trim()
    .toUpperCase()
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function SedesAdmin() {
  const [tick, setTick] = useState(0);

  const [form, setForm] = useState<Sede>({
    id: "",
    nombre: "",
    tipo: "FILIAL",
    departamento: "",
    direccion: "",
    telefono: "",
    activo: true
  });

  const [csvText, setCsvText] = useState("");

  const list = useMemo(() => sedesStore.list(), [tick]);

  function refresh() {
    setTick(t => t + 1);
  }

  function onSave() {
    const nombre = (form.nombre || "").trim();
    if (!nombre) return alert("Nombre es obligatorio.");

    const tipo = form.tipo === "SANATORIO" ? "SANATORIO" : "FILIAL";
    const id = (form.id || "").trim() || `${tipo}_${slugify(nombre)}`;

    sedesStore.upsert({
      ...form,
      id,
      nombre,
      tipo,
      departamento: (form.departamento || "").trim() || undefined,
      direccion: (form.direccion || "").trim() || undefined,
      telefono: (form.telefono || "").trim() || undefined,
      activo: form.activo ?? true
    });

    setForm({
      id: "",
      nombre: "",
      tipo: "FILIAL",
      departamento: "",
      direccion: "",
      telefono: "",
      activo: true
    });

    refresh();
  }

  function onEdit(s: Sede) {
    setForm({
      id: s.id,
      nombre: s.nombre,
      tipo: s.tipo,
      departamento: s.departamento ?? "",
      direccion: s.direccion ?? "",
      telefono: s.telefono ?? "",
      activo: s.activo ?? true
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onDelete(id: string) {
    if (!confirm(`Eliminar ${id}?`)) return;
    sedesStore.remove(id);
    refresh();
  }

  function onImportCsv() {
    if (!csvText.trim()) return alert("Pegá el CSV en el cuadro primero.");
    const { rows } = parseCsv(csvText);

    const current = sedesStore.list();
    const map = new Map(current.map(s => [s.id, s]));

    let ok = 0;
    let bad = 0;

    for (const r of rows) {
      const nombre = String(r.nombre || r.name || "").trim();
      const tipoRaw = String(r.tipo || r.type || "").trim().toUpperCase();
      const tipo: SedeTipo = (tipoRaw === "SANATORIO" || tipoRaw === "FILIAL") ? (tipoRaw as SedeTipo) : "FILIAL";

      if (!nombre) { bad++; continue; }

      const id = String(r.id || "").trim() || `${tipo}_${slugify(nombre)}`;

      const item: Sede = {
        id,
        nombre,
        tipo,
        departamento: String(r.departamento || r.depto || "").trim() || undefined,
        direccion: String(r.direccion || r.dirección || "").trim() || undefined,
        telefono: String(r.telefono || r.tel || "").trim() || undefined,
        activo: parseBool(r.activo, true)
      };

      map.set(id, { ...(map.get(id) ?? item), ...item });
      ok++;
    }

    sedesStore.saveAll(Array.from(map.values()));
    setCsvText("");
    refresh();
    alert(`Importación OK: ${ok} filas. Omitidas: ${bad} (faltaba nombre).`);
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="panel">
        <h3 style={{ margin: 0, fontSize: 14 }}>Sedes · Alta / Edición</h3>

        <div className="field">
          <label className="label">ID (opcional)</label>
          <input className="input" value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
          <p className="sub" style={{ marginTop: 6 }}>
            Si lo dejás vacío, se genera: <b>TIPO_NOMBRE</b> (ej: SANATORIO_CENTRAL).
          </p>
        </div>

        <div className="field">
          <label className="label">Nombre</label>
          <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        </div>

        <div className="field">
          <label className="label">Tipo</label>
          <select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as SedeTipo }))}>
            <option value="SANATORIO">Sanatorio</option>
            <option value="FILIAL">Filial</option>
          </select>
        </div>

        <div className="field">
          <label className="label">Departamento (opcional)</label>
          <input className="input" value={form.departamento} onChange={e => setForm(f => ({ ...f, departamento: e.target.value }))} />
        </div>

        <div className="field">
          <label className="label">Dirección (opcional)</label>
          <input className="input" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
        </div>

        <div className="field">
          <label className="label">Teléfono (opcional)</label>
          <input className="input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
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

      <div className="panel">
        <h3 style={{ margin: 0, fontSize: 14 }}>Sedes · Importar CSV</h3>
        <p className="sub" style={{ marginTop: 8 }}>
          Encabezados esperados: <b>id, nombre, tipo, departamento, direccion, telefono, activo</b>
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
          Ejemplo:
          {" "}
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            nombre,tipo,departamento,direccion,telefono,activo
          </span>
        </div>

        <div className="pill" style={{ marginTop: 10 }}>
          Mostrando: {list.length} sedes
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10, maxHeight: 360, overflow: "auto", paddingRight: 6 }}>
          {list.map(s => (
            <div key={s.id} className="btnGhost" style={{ padding: 12, textAlign: "left" }}>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <b>{s.nombre}</b>
                <span className="pill">{s.id}</span>
                <span className="pill">{s.tipo}</span>
                <span className="pill">{(s.activo ?? true) ? "ACTIVA" : "INACTIVA"}</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                {s.departamento ? `${s.departamento} · ` : ""}
                {s.direccion ? `${s.direccion} · ` : ""}
                {s.telefono ? `Tel: ${s.telefono}` : ""}
              </div>

              <div className="row" style={{ marginTop: 10, gap: 10 }}>
                <button className="btnGhost" onClick={() => onEdit(s)}>Editar</button>
                <button className="btnGhost" onClick={() => onDelete(s.id)} style={{ borderColor: "rgba(239,68,68,.25)" }}>
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
