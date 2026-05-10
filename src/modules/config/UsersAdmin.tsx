import React, { useMemo, useState } from "react";
import { usersStore, type UserRecord } from "./users.store";
import type { Role } from "../../auth/auth.types";

const ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "COORDINADOR", "MEDICO"];
const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin", ADMIN: "Administrador", COORDINADOR: "Coordinador", MEDICO: "Médico",
};
const ROLE_RGB: Record<Role, string> = {
  SUPER_ADMIN: "21,101,192", ADMIN: "38,166,154", COORDINADOR: "109,191,60", MEDICO: "217,119,6",
};

function RoleBadge({ role }: { role: Role }) {
  const rgb = ROLE_RGB[role] ?? "100,116,139";
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`,
      border: `1px solid rgba(${rgb},0.25)`, whiteSpace: "nowrap",
    }}>{ROLE_LABEL[role]}</span>
  );
}

const EMPTY: UserRecord = {
  userId: "", displayName: "", role: "COORDINADOR", activo: true,
};

function UserForm({ initial, onSave, onCancel, defaultPassword }: {
  initial: UserRecord;
  onSave: (u: UserRecord, newPass?: string) => void;
  onCancel: () => void;
  defaultPassword: string;
}) {
  const [form, setForm]       = useState<UserRecord>({ ...initial });
  const [newPass, setNewPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const isNew = !initial.userId;

  function set<K extends keyof UserRecord>(k: K, v: UserRecord[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function save() {
    if (!form.userId.trim())      { alert("El ID de usuario es obligatorio."); return; }
    if (!form.displayName.trim()) { alert("El nombre es obligatorio."); return; }
    onSave(form, newPass.trim() || undefined);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lblStyle}>ID de usuario *</label>
          <input className="input" value={form.userId} disabled={!isNew}
            onChange={e => set("userId", e.target.value.trim())}
            placeholder="F-1001 · CI-48206484" style={{ opacity: isNew ? 1 : 0.6 }} />
          {isNew && <p style={hintStyle}>Formato: F-xxxx (funcionario) o CI-xxxx (cédula)</p>}
        </div>
        <div>
          <label style={lblStyle}>Nombre completo *</label>
          <input className="input" value={form.displayName}
            onChange={e => set("displayName", e.target.value)}
            placeholder="Dr. Juan García" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <label style={lblStyle}>Rol</label>
          <select className="input" value={form.role} onChange={e => set("role", e.target.value as Role)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        <div>
          <label style={lblStyle}>N° Funcionario</label>
          <input className="input" value={form.funcionario ?? ""}
            onChange={e => set("funcionario", e.target.value || undefined)}
            placeholder="10021" />
        </div>
        <div>
          <label style={lblStyle}>Cédula</label>
          <input className="input" value={form.cedula ?? ""}
            onChange={e => set("cedula", e.target.value || undefined)}
            placeholder="42187634" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lblStyle}>Email</label>
          <input className="input" type="email" value={form.email ?? ""}
            onChange={e => set("email", e.target.value || undefined)}
            placeholder="usuario@ejemplo.com" />
        </div>
        <div>
          <label style={lblStyle}>{isNew ? "Contraseña" : "Nueva contraseña"}</label>
          <div style={{ position: "relative" }}>
            <input className="input" type={showPass ? "text" : "password"}
              value={newPass} onChange={e => setNewPass(e.target.value)}
              placeholder={isNew ? `Vacío = "${defaultPassword}"` : "Vacío = sin cambio"}
              style={{ paddingRight: 36 }} />
            <button type="button" onClick={() => setShowPass(s => !s)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              {showPass ? "🙈" : "👁"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={form.activo} onChange={e => set("activo", e.target.checked)} />
          Usuario activo
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
        <button className="btn" onClick={save}>
          {isNew ? "Crear usuario" : "Guardar cambios"}
        </button>
        <button className="btnGhost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

export function UsersAdmin({ currentRole }: { currentRole: Role }) {
  const [tick, setTick]         = useState(0);
  const [editingId, setEditing] = useState<string | "new" | null>(null);
  const [search, setSearch]     = useState("");
  const [showResetPass, setShowResetPass] = useState(false);
  const [newDefaultPass, setNewDefaultPass] = useState("");

  const users   = useMemo(() => usersStore.list(), [tick]);
  const cfg     = useMemo(() => usersStore.getConfig(), [tick]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? users.filter(u =>
          u.displayName.toLowerCase().includes(q) ||
          u.userId.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
        )
      : users;
  }, [users, search]);

  const editingUser = useMemo(() =>
    editingId === "new" ? EMPTY : users.find(u => u.userId === editingId) ?? null,
  [users, editingId]);

  function handleSave(u: UserRecord, newPass?: string) {
    usersStore.upsert(u);
    if (newPass) usersStore.setPassword(u.userId, newPass);
    setEditing(null);
    setTick(t => t + 1);
  }

  function handleDelete(userId: string, name: string) {
    if (!confirm(`¿Eliminar el usuario "${name}"?\nEsta acción no se puede deshacer.`)) return;
    usersStore.remove(userId);
    setTick(t => t + 1);
  }

  function saveDefaultPass() {
    if (!newDefaultPass.trim()) return;
    usersStore.saveConfig({ ...cfg, defaultPassword: newDefaultPass.trim() });
    setNewDefaultPass("");
    setShowResetPass(false);
    setTick(t => t + 1);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Contraseña global */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={h3Style}>Contraseña global</h3>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
              Aplica a todos los usuarios que no tienen contraseña personalizada.
              Actual: <code style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--blue)", fontSize: 13 }}>{cfg.defaultPassword}</code>
            </p>
          </div>
          <button className="btnGhost" onClick={() => setShowResetPass(s => !s)} style={{ fontSize: 12 }}>
            {showResetPass ? "Cancelar" : "Cambiar contraseña global"}
          </button>
        </div>
        {showResetPass && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <input className="input" type="text" placeholder="Nueva contraseña global"
              value={newDefaultPass} onChange={e => setNewDefaultPass(e.target.value)}
              style={{ flex: 1 }} />
            <button className="btn" onClick={saveDefaultPass} disabled={!newDefaultPass.trim()}>
              Guardar
            </button>
          </div>
        )}
      </div>

      {/* Tabla de usuarios */}
      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <h3 style={h3Style}>Usuarios del sistema <span style={{ fontSize: 13, fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>{users.length}</span></h3>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" placeholder="Buscar…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 180, fontSize: 13 }} />
            {editingId !== "new" && (
              <button className="btn" onClick={() => setEditing("new")} style={{ fontSize: 13 }}>
                + Nuevo usuario
              </button>
            )}
          </div>
        </div>

        {/* Formulario inline de nuevo usuario */}
        {editingId === "new" && (
          <div style={{
            marginBottom: 16, padding: "16px 18px", borderRadius: 12,
            background: "var(--blue-tint)", border: "1px solid rgba(21,101,192,0.20)",
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--blue)", marginBottom: 12 }}>Nuevo usuario</div>
            <UserForm initial={EMPTY} onSave={handleSave} onCancel={() => setEditing(null)} defaultPassword={cfg.defaultPassword} />
          </div>
        )}

        {/* Lista */}
        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid var(--border-2)" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 80px 100px",
            padding: "7px 14px", background: "var(--surface-2)",
            fontSize: 11, fontWeight: 700, color: "var(--subtle)",
            textTransform: "uppercase", letterSpacing: "0.05em",
            borderBottom: "1px solid var(--border-2)",
          }}>
            <div>Usuario</div><div>ID</div><div>Rol</div><div>Estado</div><div>Acciones</div>
          </div>

          {filtered.length === 0 && (
            <p style={{ padding: "20px 14px", color: "var(--muted)", fontSize: 13 }}>Sin resultados.</p>
          )}

          {filtered.map((u, i) => (
            <React.Fragment key={u.userId}>
              <div style={{
                display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 80px 100px",
                padding: "11px 14px", fontSize: 13,
                background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                borderTop: "1px solid var(--border-2)", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{u.displayName}</div>
                  {u.email && <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 1 }}>{u.email}</div>}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--muted)" }}>{u.userId}</div>
                <div><RoleBadge role={u.role} /></div>
                <div>
                  <span style={{
                    padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: u.activo ? "rgba(22,163,74,0.10)" : "rgba(100,116,139,0.10)",
                    color: u.activo ? "rgb(22,163,74)" : "var(--muted)",
                  }}>{u.activo ? "Activo" : "Inactivo"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btnGhost" onClick={() => setEditing(u.userId === editingId ? null : u.userId)}
                    style={{ padding: "4px 10px", fontSize: 12 }}>Editar</button>
                  {currentRole === "SUPER_ADMIN" && (
                    <button onClick={() => handleDelete(u.userId, u.displayName)}
                      style={{
                        padding: "4px 8px", fontSize: 12, borderRadius: 8, border: "1px solid rgba(220,38,38,0.25)",
                        background: "rgba(220,38,38,0.07)", color: "rgb(220,38,38)", cursor: "pointer",
                      }}>🗑</button>
                  )}
                </div>
              </div>

              {/* Formulario de edición inline */}
              {editingId === u.userId && editingUser && (
                <div style={{
                  gridColumn: "1 / -1", padding: "16px 18px",
                  background: "rgba(21,101,192,0.04)", borderTop: "1px solid rgba(21,101,192,0.15)",
                }}>
                  <UserForm initial={editingUser} onSave={handleSave} onCancel={() => setEditing(null)} defaultPassword={cfg.defaultPassword} />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 14, padding: "16px 18px", boxShadow: "var(--shadow-sm)",
};
const h3Style: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" };
const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 11.5, fontWeight: 600, color: "var(--muted)",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em",
};
const hintStyle: React.CSSProperties = { margin: "4px 0 0", fontSize: 11, color: "var(--subtle)" };
