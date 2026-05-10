import { storage } from "../../core/storage";
import type { Role } from "../../auth/auth.types";

export type UserRecord = {
  userId: string;
  displayName: string;
  role: Role;
  password?: string;   // undefined = usa la contraseña global
  activo: boolean;
  cedula?: string;
  funcionario?: string;
  email?: string;
};

const KEY      = "mediflow.users.v1";
const CFG_KEY  = "mediflow.users.cfg.v1";

const DEFAULT_USERS: UserRecord[] = [
  { userId: "F-9999",  displayName: "Super Admin",        role: "SUPER_ADMIN",  activo: true, funcionario: "9999"  },
  { userId: "F-2001",  displayName: "Administrador",      role: "ADMIN",        activo: true, funcionario: "2001"  },
  { userId: "F-1001",  displayName: "Coordinador",        role: "COORDINADOR",  activo: true, funcionario: "1001"  },
];

type UsersConfig = { defaultPassword: string };
const DEFAULT_CFG: UsersConfig = { defaultPassword: "mediflow2024" };

export const usersStore = {
  getConfig(): UsersConfig {
    return storage.get<UsersConfig>(CFG_KEY, DEFAULT_CFG);
  },

  saveConfig(cfg: UsersConfig) {
    storage.set(CFG_KEY, cfg);
  },

  list(): UserRecord[] {
    const raw = storage.get<UserRecord[]>(KEY, []);
    return raw.length ? raw : DEFAULT_USERS;
  },

  getById(userId: string): UserRecord | null {
    return this.list().find(u => u.userId === userId) ?? null;
  },

  upsert(u: UserRecord) {
    const all = this.list().slice();
    const idx = all.findIndex(x => x.userId === u.userId);
    if (idx >= 0) all[idx] = { ...all[idx], ...u };
    else all.unshift(u);
    storage.set(KEY, all);
  },

  remove(userId: string) {
    storage.set(KEY, this.list().filter(u => u.userId !== userId));
  },

  checkPassword(userId: string, password: string): boolean {
    const cfg = this.getConfig();
    const user = this.getById(userId);
    const expected = user?.password ?? cfg.defaultPassword;
    return password === expected;
  },

  setPassword(userId: string, newPassword: string) {
    const all = this.list().slice();
    const idx = all.findIndex(x => x.userId === userId);
    if (idx >= 0) { all[idx] = { ...all[idx], password: newPassword }; storage.set(KEY, all); }
  },
};
