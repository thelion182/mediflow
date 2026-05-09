import { storage } from "../core/storage";
import type { Role, User } from "./auth.types";
import { medicosStore } from "../modules/admin/medicos.store";

const KEY = "mediflow.session";

// Cuentas demo fijas por rol
const DEMO_ACCOUNTS: Array<{ ids: string[]; user: User }> = [
  {
    ids: ["9999", "F-9999"],
    user: { userId: "F-9999", displayName: "Super Admin (Demo)", role: "SUPER_ADMIN", funcionario: "9999" }
  },
  {
    ids: ["2001", "F-2001"],
    user: { userId: "F-2001", displayName: "Administrador (Demo)", role: "ADMIN", funcionario: "2001" }
  },
  {
    ids: ["1001", "F-1001"],
    user: { userId: "F-1001", displayName: "Coordinador (Demo)", role: "COORDINADOR", funcionario: "1001" }
  },
];

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function normalizeInput(input: string) {
  const v = (input || "").trim();
  if (!v) return "";
  const up = v.toUpperCase();
  if (up.startsWith("F-")) return `F-${onlyDigits(up.slice(2))}`;
  if (up.startsWith("CI-")) return `CI-${onlyDigits(up.slice(3))}`;
  if (/^\d+$/.test(v)) return v;
  return v;
}

export const authStore = {
  getSession(): User | null {
    const raw = storage.get<any>(KEY, null);
    if (!raw) return null;
    // Migra roles legacy en caliente
    if (raw.role === "SUPLENCIAS") {
      const migrated = { ...raw, role: "COORDINADOR" as Role };
      storage.set(KEY, migrated);
      return migrated;
    }
    return raw as User;
  },

  setSession(user: User) {
    storage.set(KEY, user);
  },

  clear() {
    storage.remove(KEY);
  },

  loginByIdOrUserId(input: string): { ok: true; user: User } | { ok: false; error: string } {
    const v = normalizeInput(input);
    if (!v) return { ok: false, error: "Ingresá un número de funcionario o cédula." };

    // 1) Cuentas demo fijas
    for (const acc of DEMO_ACCOUNTS) {
      if (acc.ids.includes(v)) return { ok: true, user: acc.user };
    }

    // 2) Formato explícito F-xxxx / CI-xxxx → buscar en catálogo médicos
    if (v.startsWith("F-") || v.startsWith("CI-")) {
      const m = medicosStore.list().find(x => x.userId === v && (x.activo ?? true));
      if (!m) return { ok: false, error: "No se encontró el usuario (o está inactivo)." };
      return { ok: true, user: { userId: m.userId, displayName: m.displayName, role: "MEDICO", funcionario: m.funcionario, cedula: m.cedula } };
    }

    // 3) Número puro → funcionario o cédula
    const num = onlyDigits(v);
    if (!num) return { ok: false, error: "Ingresá solo números, o prefijo F- / CI-." };

    const list = medicosStore.list().filter(m => (m.activo ?? true));

    const byFunc = list.find(m => (m.funcionario || "") === num);
    if (byFunc) return { ok: true, user: { userId: byFunc.userId, displayName: byFunc.displayName, role: "MEDICO", funcionario: byFunc.funcionario, cedula: byFunc.cedula } };

    const byCi = list.find(m => (m.cedula || "") === num);
    if (byCi) return { ok: true, user: { userId: byCi.userId, displayName: byCi.displayName, role: "MEDICO", funcionario: byCi.funcionario, cedula: byCi.cedula } };

    return { ok: false, error: "No se encontró ese ID. Revisá CI/funcionario o cargalo en Administración." };
  }
};
