/**
 * End-to-end encryption for a founder's workspace.
 *
 * The workspace is encrypted in the browser with AES-256-GCM before it is sent to the database, so
 * the server (and anyone with database access, including STARTIT) only ever stores ciphertext.
 *
 * - The key is 32 random bytes made on the founder's device. It is kept in this browser's IndexedDB
 *   as a non-extractable CryptoKey, so page scripts can use it but can't read it out.
 * - The founder gets the same 32 bytes once as a recovery key ("ABCD-EFGH-…") to unlock the
 *   workspace on another device. STARTIT never sees it: lose it and the data can't be recovered.
 * - The user's id is bound in as additional authenticated data, so a ciphertext can't be moved
 *   to another account and still decrypt.
 *
 * Pure Web Crypto: works in browsers and in Bun/Node tests.
 */

export interface Sealed {
  v: 1;
  alg: "A256GCM";
  iv: string; // base64, 12 bytes
  ct: string; // base64 ciphertext + 16-byte tag
}

// Crockford base32: no I, L, O or U, so the key is easy to read and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function isSealed(x: unknown): x is Sealed {
  return !!x && typeof x === "object" && (x as Sealed).v === 1 && (x as Sealed).alg === "A256GCM" && typeof (x as Sealed).ct === "string";
}

const b64 = (u: Uint8Array) => {
  let s = "";
  for (const c of u) s += String.fromCharCode(c);
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Newer TypeScript types Uint8Array generically; Web Crypto wants a plain BufferSource.
const buf = (u: Uint8Array) => u as unknown as BufferSource;

/** 32 bytes → 52 base32 characters in groups of 4. */
export function formatRecovery(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}

/** Accepts the key with or without dashes or spaces, in any case, and with O/I/L typed for 0/1/1. */
export function parseRecovery(code: string): Uint8Array {
  const clean = code.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== 52 || [...clean].some((c) => !ALPHABET.includes(c))) throw new Error("That doesn't look like a STARTIT recovery key. It has 52 letters and numbers.");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out.slice(0, 32));
}

function importKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", buf(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** A fresh key for a new workspace, and the recovery key to show the founder once. */
export async function createKey(): Promise<{ key: CryptoKey; recovery: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await importKey(raw);
  const recovery = formatRecovery(raw);
  raw.fill(0);
  return { key, recovery };
}

export async function keyFromRecovery(code: string): Promise<CryptoKey> {
  const raw = parseRecovery(code);
  const key = await importKey(raw);
  raw.fill(0);
  return key;
}

export async function seal(key: CryptoKey, value: unknown, owner: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(iv), additionalData: buf(new TextEncoder().encode(owner)) }, key, buf(data));
  return { v: 1, alg: "A256GCM", iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

/** Throws WrongKeyError when the key (or owner) doesn't match. */
export async function open<T>(key: CryptoKey, sealed: Sealed, owner: string): Promise<T> {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf(unb64(sealed.iv)), additionalData: buf(new TextEncoder().encode(owner)) }, key, buf(unb64(sealed.ct)));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch {
    throw new WrongKeyError();
  }
}

export class WrongKeyError extends Error {
  constructor() {
    super("That recovery key doesn't unlock this workspace. Check it and try again.");
  }
}

/* ---------------------------------------------- key storage on this device -- */

const DB = "startit-vault";
const STORE = "keys";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export const loadDeviceKey = (userId: string) => tx<CryptoKey | undefined>("readonly", (s) => s.get(userId)).catch(() => undefined);
export const saveDeviceKey = (userId: string, key: CryptoKey) => tx("readwrite", (s) => s.put(key, userId));
export const forgetDeviceKey = (userId: string) => tx("readwrite", (s) => s.delete(userId)).catch(() => undefined);
