// P3-B3: Browser fallback for local testing, Windows Credential Manager for Tauri.
// Never write a bearer token to localStorage in the Windows edition.
const CODE = /^[A-HJ-NP-Z2-9]{10}$/;
const TOKEN = /^[A-Za-z0-9_-]{40,80}$/;
const KEY = 'animated3dchess:online-session:v1:';

function storeFor(storage) {
  if (storage !== undefined) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function parseRecord(raw, baseUrl, now) {
  if (typeof raw !== 'string' || raw.length > 1024) return null;
  try {
    const record = JSON.parse(raw);
    // No client-side 48h expiry: the server expires the room by *last activity*,
    // while this timestamp records only the last local checkpoint.
    if (!record || record.v !== 1 || record.baseUrl !== baseUrl ||
        !CODE.test(record.code) || !['w', 'b'].includes(record.side) ||
        !TOKEN.test(record.token) || !Number.isSafeInteger(record.at) ||
        record.at < 0 || record.at > now + 60_000) return null;
    return {code:record.code, side:record.side, token:record.token};
  } catch { return null; }
}
function nativeInvoke() {
  try {
    const core = globalThis.__TAURI__?.core;
    return typeof core?.invoke === 'function' ? (cmd, args) => core.invoke(cmd, args) : null;
  } catch { return null; }
}
export function createOnlineSessionStore({baseUrl, storage, now = () => Date.now()} = {}) {
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl)) throw new Error('invalid-server-url');
  const key = KEY + encodeURIComponent(baseUrl);
  const marker = key + ':forget-pending'; // contains no secret
  const s = storeFor(storage);
  // Explicit injected storage is used by browser tests; never silently route it to native.
  const invoke = storage === undefined ? nativeInvoke() : null;
  let queue = Promise.resolve();
  const sequence = task => {
    const next = queue.then(task, task);
    queue = next.then(() => {}, () => {});
    return next;
  };
  const localRead = () => {
    if (!s) return null;
    try { return parseRecord(s.getItem(key), baseUrl, now()); } catch { return null; }
  };
  const localRemove = () => { try { s?.removeItem(key); } catch {} };
  const hasMarker = () => { try { return s?.getItem(marker) === '1'; } catch { return false; } };
  const setMarker = () => { try { s?.setItem(marker, '1'); } catch {} };
  const clearMarker = () => { try { s?.removeItem(marker); } catch {} };
  const serialize = ({code, side, token}) => {
    const record = {v:1, baseUrl, code, side, token, at:now()};
    const raw = JSON.stringify(record);
    return parseRecord(raw, baseUrl, now()) ? raw : null;
  };
  if (!invoke) {
    return {
      requiresAsyncLookup: false,
      load() {
        const record = localRead();
        if (!record) localRemove();
        return record;
      },
      async loadAsync() { return this.load(); },
      save(input) {
        if (!s) return false;
        const raw = serialize(input);
        if (!raw) return false;
        try { s.setItem(key, raw); return true; } catch { return false; }
      },
      async saveAsync(input) { return this.save(input); },
      clear() { localRemove(); },
      async clearAsync() { this.clear(); return true; },
    };
  }
  // Native calls are serialized to avoid a slow save racing an explicit Leave.
  const loadAsync = () => sequence(async () => {
    if (hasMarker()) {
      try { await invoke('online_vault_clear', {baseUrl}); } catch { /* retry next launch */ }
      return null;
    }
    const raw = await invoke('online_vault_load', {baseUrl});
    const saved = parseRecord(raw, baseUrl, now());
    if (saved) {
      localRemove(); // clean any previous plaintext checkpoint
      return saved;
    }
    if (raw) throw new Error('secure-session-invalid'); // never silently discard the vault
    const legacy = localRead();
    if (!legacy) { localRemove(); return null; }
    const migratedRaw = serialize(legacy);
    if (!migratedRaw) return null;
    // Move the existing seat before deleting the old browser checkpoint.
    await invoke('online_vault_save', {baseUrl, record:migratedRaw});
    localRemove();
    return legacy;
  });
  const saveAsync = input => sequence(async () => {
    const raw = serialize(input);
    if (!raw) return false;
    await invoke('online_vault_save', {baseUrl, record:raw});
    localRemove(); // delete legacy plaintext only after confirmed native persistence
    clearMarker();
    return true;
  });
  const clearAsync = () => {
    // Tombstone must be synchronous so rapid app shutdown never restores a left seat.
    setMarker();
    localRemove();
    return sequence(async () => {
      await invoke('online_vault_clear', {baseUrl});
      clearMarker();
      return true;
    });
  };
  return {
    requiresAsyncLookup: true,
    load() { return null; }, // native reads must be awaited
    loadAsync,
    save() { return false; }, // never fall back to plaintext in Tauri
    saveAsync,
    clear() { void clearAsync().catch(() => {}); },
    clearAsync,
  };
}
