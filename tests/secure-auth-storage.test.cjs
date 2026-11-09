const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { FirebaseError } = require('firebase/app');
const projectRoot = path.dirname(require.resolve('../package.json'));
// Use the installed RN implementation, not a reimplementation of its contract.
const rnAuth = require(path.join(path.dirname(require.resolve('@firebase/auth/package.json')), 'dist/rn/index.js'));

function compiler(file) {
  return ts.transpileModule(fs.readFileSync(path.join(projectRoot, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
function load(file, modules = {}) {
  const exports = {};
  vm.runInNewContext(compiler(file), {
    exports, require: (name) => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name]; },
  });
  return exports;
}
const { createSecureAuthStorage, encodeSecureAuthKey } = load('src/infrastructure/auth/SecureAuthStorage.ts');
const scope = { apiKey: 'test-api-key', appName: '[DEFAULT]' };
const authKey = `firebase:authUser:${scope.apiKey}:${scope.appName}`;
const user = { uid: 'user-a', email: 'test@example.invalid', stsTokenManager: {
  refreshToken: 'FAKE-refresh', accessToken: 'FAKE-id', expirationTime: 123456,
} };

function backends() {
  const values = new Map();
  const legacyValues = new Map();
  const calls = [];
  const cleanup = [];
  let available = true;
  let fail = null;
  const secure = {
    isAvailableAsync: async () => available,
    setItemAsync: async (key, value, options) => {
      calls.push({ operation: 'set', key, options });
      if (fail === 'set') throw new Error('RAW-SENSITIVE-ERROR');
      if (fail === 'large' && value.length > 2048) throw new Error('RAW-SENSITIVE-ERROR');
      values.set(key, value);
    },
    getItemAsync: async (key, options) => {
      calls.push({ operation: 'get', key, options });
      if (fail === 'get') throw new Error('RAW-SENSITIVE-ERROR');
      return values.get(key) ?? null;
    },
    deleteItemAsync: async (key, options) => {
      calls.push({ operation: 'delete', key, options });
      if (fail === 'delete') throw new Error('RAW-SENSITIVE-ERROR');
      values.delete(key);
    },
  };
  const legacy = { multiRemove: async (keys) => {
    cleanup.push([...keys]);
    if (fail === 'cleanup') throw new Error('RAW-SENSITIVE-ERROR');
    keys.forEach((key) => legacyValues.delete(key));
  } };
  return {
    secure, legacy, values, legacyValues, calls, cleanup,
    fail: (operation) => { fail = operation; }, available: (value) => { available = value; },
    create: (otherScope = scope) => createSecureAuthStorage(secure, legacy, otherScope),
  };
}

test('encoding is deterministic and collision-free for punctuation, Unicode and surrogate code units', () => {
  const keys = ['', 'a:b', 'a_b', 'a-b', 'a.b', '__sak', authKey, 'é', 'é', '😀', '\ud800', '\udfff'];
  const encoded = keys.map(encodeSecureAuthKey);
  assert.equal(new Set(encoded).size, keys.length);
  keys.forEach((key, index) => {
    assert.equal(encodeSecureAuthKey(key), encoded[index]);
    assert.match(encoded[index], /^[a-zA-Z0-9._-]+$/);
  });
});

test('cutover removes only the three known Auth records for this Firebase app and never reads legacy values', async () => {
  const backend = backends();
  const own = ['authUser', 'persistence', 'redirectUser'].map((kind) => `firebase:${kind}:${scope.apiKey}:${scope.appName}`);
  for (const key of [...own, 'theme', 'financial-preference', 'firebase:authUser:other:[DEFAULT]', '__sak']) backend.legacyValues.set(key, 'legacy');
  const storage = backend.create();
  assert.equal(await storage.getItem(authKey), null);
  assert.deepEqual(backend.cleanup, [own]);
  assert.deepEqual([...backend.legacyValues.keys()], ['theme', 'financial-preference', 'firebase:authUser:other:[DEFAULT]', '__sak']);
  assert.equal(storage.getSnapshot().ready, true);
  await storage.getItem(authKey);
  assert.equal(backend.cleanup.length, 1);
});

test('actual Firebase RN persistence serializes into SecureStore and restores through a new adapter', async () => {
  const backend = backends();
  const storage = backend.create();
  const Persistence = rnAuth.getReactNativePersistence(storage);
  const persistence = new Persistence();
  assert.equal(await persistence._isAvailable(), true);
  await persistence._set(authKey, user);
  assert.ok([...backend.values.values()].includes(JSON.stringify(user)));
  const RestoredPersistence = rnAuth.getReactNativePersistence(backend.create());
  assert.deepEqual(await new RestoredPersistence()._get(authKey), user);
  assert.ok(backend.calls.every((call) => call.options.requireAuthentication === false));
  assert.equal(backend.legacyValues.size, 0);
});

test('updated session serialization replaces the previous user without retaining another user record', async () => {
  const backend = backends();
  const Persistence = rnAuth.getReactNativePersistence(backend.create());
  const persistence = new Persistence();
  await persistence._set(authKey, user);
  const second = { ...user, uid: 'user-b', stsTokenManager: { ...user.stsTokenManager, accessToken: 'FAKE-new' } };
  await persistence._set(authKey, second);
  assert.deepEqual(await persistence._get(authKey), second);
  assert.equal(backend.values.size, 1);
});

test('logout removes secure and matching legacy session; restarting never restores the old session', async () => {
  const backend = backends();
  const Persistence = rnAuth.getReactNativePersistence(backend.create());
  const persistence = new Persistence();
  await persistence._set(authKey, user);
  backend.legacyValues.set(authKey, JSON.stringify(user));
  backend.legacyValues.set('theme', 'dark');
  await persistence._remove(authKey);
  const Restored = rnAuth.getReactNativePersistence(backend.create());
  assert.equal(await new Restored()._get(authKey), null);
  assert.equal(backend.legacyValues.get('theme'), 'dark');
  assert.equal(backend.legacyValues.has(authKey), false);
});

test('scoped secure keys isolate different Firebase apps, including identical caller keys', async () => {
  const backend = backends();
  const first = backend.create();
  const second = backend.create({ ...scope, appName: 'other-app' });
  await first.setItem('same-key', JSON.stringify(user));
  assert.equal(await second.getItem('same-key'), null);
  assert.equal(await first.getItem('same-key'), JSON.stringify(user));
});

test('concurrent startup operations share one cleanup and readiness probe', async () => {
  const backend = backends();
  const storage = backend.create();
  await Promise.all([storage.prepare(), storage.prepare(), storage.getItem(authKey)]);
  assert.equal(backend.cleanup.length, 1);
  assert.equal(backend.calls.filter((call) => call.operation === 'set').length, 1);
});

test('cleanup or readiness failures are explicit, sanitized and cannot write a plaintext fallback', async () => {
  for (const kind of ['cleanup', 'unavailable', 'set', 'get', 'delete']) {
    const backend = backends();
    if (kind === 'unavailable') backend.available(false); else backend.fail(kind);
    const storage = backend.create();
    await assert.rejects(storage.setItem(authKey, JSON.stringify(user)), (error) => {
      assert.match(error.code, /^auth\//);
      assert.doesNotMatch(error.message, /RAW-SENSITIVE|FAKE-/);
      return true;
    });
    assert.equal(storage.getSnapshot().ready, false);
    assert.ok(storage.getSnapshot().error);
    assert.doesNotMatch(storage.getSnapshot().error, /RAW-SENSITIVE|FAKE-/);
    assert.equal([...backend.values.values()].includes(JSON.stringify(user)), false);
  }
});

test('Firebase swallowing availability errors still leaves a visible blocking status for the UI', async () => {
  const backend = backends(); backend.available(false);
  const storage = backend.create();
  const Persistence = rnAuth.getReactNativePersistence(storage);
  assert.equal(await new Persistence()._isAvailable(), false);
  assert.equal(storage.getSnapshot().ready, false);
  assert.ok(storage.getSnapshot().error);
});

test('runtime read/write/delete failures propagate fixed errors without native contents or credentials', async () => {
  for (const [kind, method, code] of [
    ['get', 'getItem', 'auth/secure-storage-read-failed'],
    ['set', 'setItem', 'auth/secure-storage-write-failed'],
    ['delete', 'removeItem', 'auth/secure-storage-delete-failed'],
  ]) {
    const backend = backends();
    const storage = backend.create();
    await storage.prepare(); backend.fail(kind);
    await assert.rejects(storage[method](authKey, JSON.stringify(user)), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /RAW-SENSITIVE|FAKE-/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(storage.getSnapshot().ready, false);
  }
});

test('malformed secure serialization fails explicitly before Firebase parsing, without clearing other entries', async () => {
  const backend = backends();
  const storage = backend.create();
  await storage.setItem(authKey, 'not valid JSON');
  await assert.rejects(storage.getItem(authKey), (error) => error.code === 'auth/secure-storage-read-failed');
});

test('large payloads round-trip without truncation if supported, or surface native limits without fallback', async () => {
  const backend = backends();
  const storage = backend.create();
  const payload = JSON.stringify({ ...user, displayName: 'á'.repeat(5000) });
  await storage.setItem(authKey, payload);
  assert.equal(await storage.getItem(authKey), payload);
  backend.fail('large');
  await assert.rejects(storage.setItem(authKey, payload), (error) => error.code === 'auth/secure-storage-write-failed');
  assert.equal(backend.legacyValues.size, 0);
});

function initializerHarness(alreadyInitialized = false) {
  const backend = backends();
  const app = { options: { apiKey: scope.apiKey }, name: scope.appName };
  let auth = alreadyInitialized ? { name: 'existing' } : null;
  let constructions = 0;
  const sdk = {
    getReactNativePersistence: (storage) => { constructions++; return rnAuth.getReactNativePersistence(storage); },
    initializeAuth: () => {
      if (auth) throw new FirebaseError('auth/already-initialized', 'already initialized');
      auth = { name: 'secure' };
      return auth;
    },
    getAuth: () => auth,
  };
  const modules = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: backend.legacy },
    'expo-secure-store': backend.secure,
    'firebase/app': { FirebaseError }, 'firebase/auth': sdk,
    './SecureAuthStorage': { createSecureAuthStorage },
  };
  const context = vm.createContext({ require: (name) => {
    assert.ok(Object.hasOwn(modules, name)); return modules[name];
  } });
  function evaluate() {
    context.exports = {};
    vm.runInContext(`(function(exports, require) { ${compiler('src/infrastructure/auth/initializeNativeAuth.ts')} })(exports, require);`, context);
    return context.exports.initializeNativeAuth(app);
  }
  return { evaluate, constructions: () => constructions };
}

test('Fast Refresh retains the same Auth, storage status and persistence constructor', async () => {
  const harness = initializerHarness();
  const first = harness.evaluate();
  await first.storage.prepare();
  const refreshed = harness.evaluate();
  assert.equal(refreshed.auth, first.auth);
  assert.equal(refreshed.storage, first.storage);
  assert.equal(harness.constructions(), 1);
  assert.equal(refreshed.storage.getSnapshot().ready, true);
});

test('first Fast Refresh over an old Auth explicitly requests a full restart instead of claiming secure persistence', () => {
  const harness = initializerHarness(true);
  const result = harness.evaluate();
  assert.equal(result.auth.name, 'existing');
  assert.equal(result.storage.getSnapshot().ready, false);
  assert.match(result.storage.getSnapshot().error, /Reinicie/);
});

test('AuthProvider hides the normal app and its authenticated user on storage failure', () => {
  const state = { ready: false, error: 'Falha segura de teste' };
  const { AuthProvider } = load('contexts/AuthContext.tsx', {
    react: {
      createContext: () => ({ Provider: 'AuthProvider' }),
      useSyncExternalStore: (_, snapshot) => snapshot(),
      useState: (initial) => [initial === null ? { uid: 'old-user' } : false, () => {}],
      useEffect: () => {},
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { View: 'View', Text: 'Text' },
    'firebase/auth': { onAuthStateChanged: () => () => {} },
    '../firebaseConfig': { auth: {}, authPersistenceStatus: {
      subscribe: () => () => {}, getSnapshot: () => state,
    } },
  });
  const result = AuthProvider({ children: 'private-app' });
  assert.equal(result.props.value.user, null);
  assert.equal(result.props.value.loading, true);
  assert.equal(result.props.children.type, 'View');
  assert.equal(result.props.children.props.children[0].props.children, state.error);
});
