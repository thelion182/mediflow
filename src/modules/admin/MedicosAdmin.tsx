import React, { useMemo, useState } from "react";
import { parseCsv } from "../../core/csv";
import { medicosStore } from "./medicos.store";
import { sectoresStore } from "./sectores.store";
import { especialidadesStore } from "./especialidades.store";
import type { Medico, MedicoTipo, MedicoGremio, NivelTecnico, NivelPostgrado, NivelRelacionamiento, NivelQuejas } from "./medicos.types";
import { DoctorAvatar } from "./DoctorAvatar";

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
    gremio: "SMU",
    prioridad: undefined,
    sectoresHabilitados: [],
    scoreManual: {},
    antiguedadAnios: undefined,
    penalizacionGuardiaFija: 0,
    activo: true,
  });

  const sectores       = useMemo(() => sectoresStore.list().filter(s => s.activo ?? true), [tick]);
  const especialidades = useMemo(() => especialidadesStore.listNames(), [tick]);
  const iconosEsp      = useMemo(() => especialidadesStore.getAll(), [tick]);

  const [csvText,     setCsvText]     = useState("");
  const [busqueda,    setBusqueda]    = useState("");
  const [filtroTipo,  setFiltroTipo]  = useState<"" | MedicoTipo>("");
  const [filtroGremio,setFiltroGremio]= useState<"" | MedicoGremio>("");
  const [filtroActivo,setFiltroActivo]= useState<"" | "true" | "false">("");
  const [filtroEsp,   setFiltroEsp]   = useState("");
  const [pagina,      setPagina]      = useState(0);
  const POR_PAGINA = 50;

  const list = useMemo(() => medicosStore.list(), [tick]);

  function norm(s?: string) {
    return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  const listFiltrada = useMemo(() => {
    const q = norm(busqueda.trim());
    return list.filter(m => {
      if (filtroTipo   && m.tipo   !== filtroTipo)   return false;
      if (filtroGremio && m.gremio !== filtroGremio) return false;
      if (filtroActivo !== "" && String(m.activo ?? true) !== filtroActivo) return false;
      if (filtroEsp    && m.especialidad !== filtroEsp) return false;
      if (!q) return true;
      return norm(m.displayName).includes(q)
          || norm(m.userId).includes(q)
          || norm(m.cedula).includes(q)
          || norm(m.funcionario).includes(q)
          || norm(m.especialidad).includes(q)
          || norm(m.telefono).includes(q);
    });
  }, [list, busqueda, filtroTipo, filtroGremio, filtroActivo, filtroEsp]);

  const listPaginada = useMemo(
    () => listFiltrada.slice(0, (pagina + 1) * POR_PAGINA),
    [listFiltrada, pagina],
  );

  function resetFiltros() {
    setBusqueda(""); setFiltroTipo(""); setFiltroGremio(""); setFiltroActivo(""); setFiltroEsp(""); setPagina(0);
  }
  const hayFiltros = !!(busqueda || filtroTipo || filtroGremio || filtroActivo || filtroEsp);

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
      gremio: (form.gremio ?? "SMU") as MedicoGremio,
      prioridad: normalizePrioridad(form.prioridad),
      sectoresHabilitados: form.sectoresHabilitados ?? [],
      scoreManual: form.scoreManual ?? {},
      antiguedadAnios: form.antiguedadAnios ?? undefined,
      penalizacionGuardiaFija: form.penalizacionGuardiaFija ?? 0,
      activo: form.activo ?? true,
    });

    setForm({
      userId: "",
      displayName: "",
      cedula: "",
      funcionario: "",
      especialidad: "",
      telefono: "",
      tipo: "SUPLENTE",
      gremio: "SMU",
      prioridad: undefined,
      sectoresHabilitados: [],
      scoreManual: {},
      antiguedadAnios: undefined,
      penalizacionGuardiaFija: 0,
      activo: true,
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
      gremio: m.gremio ?? "SMU",
      prioridad: typeof m.prioridad === "number" && m.prioridad < 9999 ? m.prioridad : undefined,
      sectoresHabilitados: m.sectoresHabilitados ?? [],
      scoreManual: m.scoreManual ?? {},
      antiguedadAnios: m.antiguedadAnios,
      penalizacionGuardiaFija: m.penalizacionGuardiaFija ?? 0,
      activo: m.activo ?? true,
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

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
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
            <label className="label">Gremio</label>
            <select
              className="select"
              value={String(form.gremio ?? "SMU")}
              onChange={e => setForm(f => ({ ...f, gremio: e.target.value as MedicoGremio }))}
            >
              <option value="SMU">SMU (no quirúrgico)</option>
              <option value="SAQ">SAQ (quirúrgico)</option>
            </select>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label className="label">Prioridad (1 = primero)</label>
            <input
              className="input"
              type="number"
              min={1}
              placeholder="(sin prioridad)"
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
          <select
            className="select"
            value={form.especialidad ?? ""}
            onChange={e => setForm(f => ({ ...f, especialidad: e.target.value || undefined }))}
          >
            <option value="">— Sin especialidad —</option>
            {especialidades.map(e => (
              <option key={e} value={e}>{iconosEsp[e] ?? "🏥"} {e}</option>
            ))}
          </select>
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

        {/* Sectores habilitados */}
        <div className="field">
          <label className="label">Sectores habilitados</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            {sectores.map(s => {
              const checked = (form.sectoresHabilitados ?? []).includes(s.id);
              return (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer",
                  padding: "3px 10px", borderRadius: 20,
                  background: checked ? "rgba(21,101,192,0.12)" : "var(--surface)",
                  border: `1px solid ${checked ? "rgba(21,101,192,0.30)" : "var(--border-2)"}`,
                  color: checked ? "var(--blue)" : "var(--muted)", fontWeight: checked ? 600 : 400,
                  transition: "all 0.12s",
                }}>
                  <input
                    type="checkbox"
                    style={{ display: "none" }}
                    checked={checked}
                    onChange={e => {
                      const curr = form.sectoresHabilitados ?? [];
                      setForm(f => ({
                        ...f,
                        sectoresHabilitados: e.target.checked
                          ? [...curr, s.id]
                          : curr.filter(x => x !== s.id),
                      }));
                    }}
                  />
                  {s.nombre}
                </label>
              );
            })}
          </div>
        </div>

        {/* Score manual */}
        <div style={{ padding: "12px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border-2)", marginTop: 4 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Scoring manual</p>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([
              { key: "tecnico", label: "Técnico (peso 64)", options: [["","—"],["EXCELENTE","Excelente"],["BUENO","Bueno"],["REGULAR","Regular (penaliza)"],["MALO","Malo (descalifica)"]] },
              { key: "postgrado", label: "Postgrado/Residencia (peso 49)", options: [["","—"],["COMPLETO","Completo"],["EN_CURSO","En curso"],["NO_REALIZA","No realiza"]] },
              { key: "relacionamiento", label: "Relacionamiento (peso 36)", options: [["","—"],["BUENO","Bueno"],["REGULAR","Regular (penaliza)"],["MALO","Malo (penaliza)"]] },
              { key: "quejas", label: "Quejas (peso 25)", options: [["","—"],["NINGUNA","Ninguna o aisladas"],["RECURRENTES","Recurrentes (penaliza)"],["FRECUENTES","Frecuentes (penaliza)"]] },
            ] as const).map(({ key, label, options }) => (
              <div key={key} className="field" style={{ margin: 0 }}>
                <label className="label">{label}</label>
                <select
                  className="select"
                  value={(form.scoreManual as any)?.[key] ?? ""}
                  onChange={e => setForm(f => ({ ...f, scoreManual: { ...f.scoreManual, [key]: e.target.value || undefined } }))}
                >
                  {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Antigüedad en la institución (años)</label>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="ej: 5"
                value={form.antiguedadAnios === undefined ? "" : String(form.antiguedadAnios)}
                onChange={e => setForm(f => ({ ...f, antiguedadAnios: e.target.value ? Number(e.target.value) : undefined }))}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label">Penalización guardia fija (pts)</label>
              <input
                className="input"
                type="number"
                min={0}
                placeholder="0 = sin penalización"
                value={form.penalizacionGuardiaFija === undefined ? "" : String(form.penalizacionGuardiaFija)}
                onChange={e => setForm(f => ({ ...f, penalizacionGuardiaFija: e.target.value ? Number(e.target.value) : 0 }))}
              />
            </div>
          </div>
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

      <div className=”panel”>
        <div style={{ display: “flex”, alignItems: “baseline”, gap: 10, marginBottom: 12, flexWrap: “wrap” }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Médicos</h3>
          <span style={{ fontSize: 12, color: “var(--muted)” }}>
            {listFiltrada.length === list.length
              ? `${list.length} en total`
              : `${listFiltrada.length} de ${list.length}`}
          </span>
          {hayFiltros && (
            <button onClick={resetFiltros} style={{
              padding: “2px 10px”, borderRadius: 20, fontSize: 11, cursor: “pointer”,
              border: “1px solid rgba(220,38,38,0.30)”, background: “rgba(220,38,38,0.06)”,
              color: “rgb(220,38,38)”,
            }}>✕ Limpiar filtros</button>
          )}
        </div>

        {/* Búsqueda */}
        <input
          className=”input”
          placeholder=”Buscar por nombre, CI, funcionario, especialidad, teléfono…”
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(0); }}
          style={{ marginBottom: 10 }}
        />

        {/* Chips de filtro */}
        <div style={{ display: “flex”, gap: 6, flexWrap: “wrap”, marginBottom: 14 }}>
          {/* Tipo */}
          {([“TITULAR”,”SUPLENTE”,”INDEPENDIENTE”] as MedicoTipo[]).map(t => (
            <button key={t} onClick={() => { setFiltroTipo(filtroTipo === t ? “” : t); setPagina(0); }} style={{
              padding: “4px 11px”, borderRadius: 20, fontSize: 11.5, cursor: “pointer”,
              fontWeight: filtroTipo === t ? 700 : 400,
              border: `1.5px solid ${filtroTipo === t ? “rgba(21,101,192,0.55)” : “var(--border-2)”}`,
              background: filtroTipo === t ? “rgba(21,101,192,0.10)” : “var(--surface-2)”,
              color: filtroTipo === t ? “var(--blue)” : “var(--muted)”,
            }}>{t[0] + t.slice(1).toLowerCase()}</button>
          ))}
          <span style={{ width: 1, background: “var(--border-2)”, margin: “0 2px” }} />
          {/* Gremio */}
          {([“SAQ”,”SMU”] as MedicoGremio[]).map(g => (
            <button key={g} onClick={() => { setFiltroGremio(filtroGremio === g ? “” : g); setPagina(0); }} style={{
              padding: “4px 11px”, borderRadius: 20, fontSize: 11.5, cursor: “pointer”,
              fontWeight: filtroGremio === g ? 700 : 400,
              border: `1.5px solid ${filtroGremio === g ? “rgba(38,166,154,0.55)” : “var(--border-2)”}`,
              background: filtroGremio === g ? “rgba(38,166,154,0.10)” : “var(--surface-2)”,
              color: filtroGremio === g ? “var(--teal-dark)” : “var(--muted)”,
            }}>{g}</button>
          ))}
          <span style={{ width: 1, background: “var(--border-2)”, margin: “0 2px” }} />
          {/* Activo */}
          {([[“true”,”Activos”],[“false”,”Inactivos”]] as [string,string][]).map(([v,l]) => (
            <button key={v} onClick={() => { setFiltroActivo(filtroActivo === v ? “” : v as any); setPagina(0); }} style={{
              padding: “4px 11px”, borderRadius: 20, fontSize: 11.5, cursor: “pointer”,
              fontWeight: filtroActivo === v ? 700 : 400,
              border: `1.5px solid ${filtroActivo === v ? “rgba(22,163,74,0.55)” : “var(--border-2)”}`,
              background: filtroActivo === v ? “rgba(22,163,74,0.10)” : “var(--surface-2)”,
              color: filtroActivo === v ? “rgb(22,163,74)” : “var(--muted)”,
            }}>{l}</button>
          ))}
          <span style={{ width: 1, background: “var(--border-2)”, margin: “0 2px” }} />
          {/* Especialidad */}
          <select
            value={filtroEsp}
            onChange={e => { setFiltroEsp(e.target.value); setPagina(0); }}
            style={{
              padding: “4px 10px”, borderRadius: 20, fontSize: 11.5, cursor: “pointer”,
              border: `1.5px solid ${filtroEsp ? “rgba(21,101,192,0.55)” : “var(--border-2)”}`,
              background: filtroEsp ? “rgba(21,101,192,0.08)” : “var(--surface-2)”,
              color: filtroEsp ? “var(--blue)” : “var(--muted)”,
              fontWeight: filtroEsp ? 700 : 400,
            }}
          >
            <option value=””>Todas las especialidades</option>
            {especialidades.map(e => <option key={e} value={e}>{iconosEsp[e] ?? “🏥”} {e}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div style={{ display: “grid”, gap: 8 }}>
          {listPaginada.length === 0 && (
            <p style={{ color: “var(--subtle)”, fontSize: 13, padding: “20px 0”, textAlign: “center” }}>
              Sin resultados para los filtros aplicados.
            </p>
          )}
          {listPaginada.map(m => (
            <div key={m.userId} className=”btnGhost” style={{ padding: 12, textAlign: “left” }}>
              <div className=”row” style={{ gap: 10, flexWrap: “wrap”, alignItems: “center” }}>
                <DoctorAvatar medico={m} size={36} />
                <b>{m.displayName}</b>
                <span className=”pill”>{m.userId}</span>
                <span className=”pill”>{String(m.tipo ?? “SUPLENTE”)}</span>
                <span className=”pill” style={{ background: m.gremio === “SAQ” ? “rgba(21,101,192,0.10)” : “rgba(38,166,154,0.10)”, color: m.gremio === “SAQ” ? “var(--blue)” : “var(--teal-dark)” }}>{m.gremio ?? “SMU”}</span>
                <span className=”pill”>Prio: {prioLabel(m.prioridad)}</span>
                <span className=”pill”>{(m.activo ?? true) ? “ACTIVO” : “INACTIVO”}</span>
              </div>

              <div className=”sub” style={{ marginTop: 6 }}>
                {m.especialidad ? `${iconosEsp[m.especialidad] ?? “🏥”} ${m.especialidad} · ` : “”}
                {m.funcionario ? `Func: ${m.funcionario} · ` : “”}
                {m.cedula ? `CI: ${m.cedula}` : “”}
                {(m.sectoresHabilitados ?? []).length > 0 && (
                  <span style={{ display: “block”, marginTop: 3, fontSize: 11, color: “var(--subtle)” }}>
                    Sectores: {(m.sectoresHabilitados ?? []).join(“, “)}
                  </span>
                )}
              </div>

              <div className=”row” style={{ marginTop: 10, gap: 10 }}>
                <button className=”btnGhost” onClick={() => onEdit(m)}>Editar</button>
                <button
                  className=”btnGhost”
                  onClick={() => onDelete(m.userId)}
                  style={{ borderColor: “rgba(239,68,68,.25)” }}
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}

          {/* Paginación */}
          {listPaginada.length < listFiltrada.length && (
            <button
              onClick={() => setPagina(p => p + 1)}
              className="btnGhost"
              style={{ textAlign: "center", color: "var(--blue)", fontWeight: 600 }}
            >
              Cargar más ({listFiltrada.length - listPaginada.length} restantes)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
