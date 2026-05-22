export type NotifType =
  | "NUEVA_CONV"
  | "CONV_ACEPTADA"
  | "CONV_RECHAZADA"
  | "DEVOLUCION_SOLICITADA"
  | "DEVOLUCION_APROBADA"
  | "DEVOLUCION_RECHAZADA";

export type Notification = {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  convId?: string;
};

type Listener = () => void;

let _list: Notification[] = [];
let _counter = 0;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach(fn => fn());
}

export const notificationsStore = {
  subscribe(fn: Listener) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  list(): Notification[] {
    return _list;
  },

  unread(): number {
    return _list.filter(n => !n.read).length;
  },

  add(notif: Omit<Notification, "id" | "timestamp" | "read">) {
    const entry: Notification = {
      ...notif,
      id: `N${++_counter}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    _list = [entry, ..._list].slice(0, 50);
    notify();
  },

  markRead(id: string) {
    _list = _list.map(n => n.id === id ? { ...n, read: true } : n);
    notify();
  },

  markAllRead() {
    _list = _list.map(n => ({ ...n, read: true }));
    notify();
  },

  clear() {
    _list = [];
    notify();
  },
};
