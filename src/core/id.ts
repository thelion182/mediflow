export function newId(prefix: string) {
  const anyCrypto = globalThis.crypto as any;
  if (anyCrypto?.randomUUID) return `${prefix}_${anyCrypto.randomUUID()}`;
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
