type SecureStorage = {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string, options: { requireAuthentication: boolean }): Promise<string | null>;
  setItemAsync(key: string, value: string, options: { requireAuthentication: boolean }): Promise<void>;
  deleteItemAsync(key: string, options: { requireAuthentication: boolean }): Promise<void>;
};

type LegacyStorage = { multiRemove(keys: string[]): Promise<void> };
type StorageState = { ready: boolean; error: string | null };

export class SecureAuthStorageError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SecureAuthStorageError";
  }
}

/** Fixed-width UTF-16 encoding: deterministic, reversible and collision-free. */
export function encodeSecureAuthKey(key: string): string {
  let encoded = "finance_auth_v1_";
  for (let index = 0; index < key.length; index++) {
    encoded += key.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return encoded;
}

/** The Firebase SDK owns serialization, tokens, refresh and session lifecycle. */
export function createSecureAuthStorage(
  secure: SecureStorage,
  legacy: LegacyStorage,
  scope: { apiKey: string; appName: string }
) {
  const options = { requireAuthentication: false };
  const legacyKeys = ["authUser", "persistence", "redirectUser"]
    .map((kind) => `firebase:${kind}:${scope.apiKey}:${scope.appName}`);
  const toKey = (key: string) => encodeSecureAuthKey(JSON.stringify([scope.apiKey, scope.appName, key]));
  let state: StorageState = { ready: false, error: null };
  let preparation: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  function publish(next: StorageState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function failure(code: string, message: string) {
    // Never retain or log native error messages: they may contain stored values.
    publish({ ready: false, error: message });
    return new SecureAuthStorageError(code, message);
  }

  function prepare(): Promise<void> {
    if (preparation) return preparation;
    preparation = Promise.resolve().then(async () => {
      try {
        // Explicit cutover, without reading or copying the old session.
        // Never clear AsyncStorage or touch another Firebase app's records.
        await legacy.multiRemove(legacyKeys);
      } catch {
        throw failure("auth/legacy-cleanup-failed", "Não foi possível remover a sessão antiga deste aplicativo.");
      }
      try {
        if (!await secure.isAvailableAsync()) throw new Error();
        const probe = toKey("secure_storage_probe");
        await secure.setItemAsync(probe, "1", options);
        if (await secure.getItemAsync(probe, options) !== "1") throw new Error();
        await secure.deleteItemAsync(probe, options);
      } catch {
        throw failure("auth/secure-storage-unavailable", "O armazenamento seguro não está disponível neste dispositivo.");
      }
      publish({ ready: true, error: null });
    });
    return preparation;
  }

  return {
    prepare,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    requireRestart: () => failure("auth/secure-storage-restart-required",
      "Reinicie completamente o aplicativo para ativar a nova persistência segura."),
    async getItem(key: string): Promise<string | null> {
      await prepare();
      try {
        const value = await secure.getItemAsync(toKey(key), options);
        // Reject malformed serialization explicitly before Firebase parses it.
        // No token contents are interpreted or changed here.
        if (value !== null) JSON.parse(value);
        return value;
      } catch {
        throw failure("auth/secure-storage-read-failed", "Não foi possível ler a sessão no armazenamento seguro.");
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      await prepare();
      try {
        // Native size limits vary: let SecureStore validate the payload and
        // surface a sanitized failure, never a plaintext fallback or truncation.
        await secure.setItemAsync(toKey(key), value, options);
      } catch {
        throw failure("auth/secure-storage-write-failed", "Não foi possível salvar a sessão no armazenamento seguro.");
      }
    },
    async removeItem(key: string): Promise<void> {
      await prepare();
      try {
        await secure.deleteItemAsync(toKey(key), options);
        // Also remove a matching legacy record if it reappeared after cutover.
        if (legacyKeys.includes(key)) await legacy.multiRemove([key]);
      } catch {
        throw failure("auth/secure-storage-delete-failed", "Não foi possível remover a sessão do armazenamento seguro.");
      }
    },
  };
}
