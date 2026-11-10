const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const ts = require('typescript');
const root = path.dirname(require.resolve('../package.json'));
const fields = {
  apiKey: 'EXPO_PUBLIC_FIREBASE_API_KEY', authDomain: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID', storageBucket: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', appId: 'EXPO_PUBLIC_FIREBASE_APP_ID',
};
const environment = Object.fromEntries(Object.values(fields).map((name) => [name, `fake-${name.toLowerCase()}`]));
function run(file, env, modules, seed = false) {
  let source = fs.readFileSync(path.join(root, file), 'utf8');
  if (seed) source = source.replace('seedTransactions().catch(', 'exports.done = seedTransactions().catch(');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const process = { env, exitCode: undefined };
  const logs = [];
  vm.runInNewContext(code, {
    exports, process, console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    require: (name) => { assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`); return modules[name]; },
  });
  return { exports, process, logs };
}
function app(env, platform = 'ios', initialized = []) {
  const auth = { name: 'auth' };
  const status = { getSnapshot: () => ({ ready: true, error: null }) };
  return {
    ...run('firebaseConfig.ts', env, {
      'firebase/app': { initializeApp: (config) => { initialized.push(config); return { options: config }; } },
      'firebase/auth': { getAuth: () => auth },
      'firebase/firestore': { getFirestore: () => 'db' }, 'firebase/storage': { getStorage: () => 'storage' },
      'react-native': { Platform: { OS: platform } },
      './src/infrastructure/auth/initializeNativeAuth': { initializeNativeAuth: () => ({ auth, storage: status }) },
    }), initialized, auth, status,
  };
}
async function seed(env) {
  const initialized = [];
  const writes = [];
  const signIns = [];
  const result = run('scripts/seedTransactions.mjs', env, {
    'firebase/app': { initializeApp: (config) => { initialized.push(config); return {}; } },
    'firebase/auth': { getAuth: () => ({}), signInWithEmailAndPassword: async (_, email, password) => {
      signIns.push([email, password]); return { user: { uid: 'test-user' } };
    } },
    'firebase/firestore': {
      getFirestore: () => ({}), collection: (_, ...segments) => segments.join('/'),
      addDoc: async (collection, data) => writes.push({ collection, data }),
      Timestamp: { fromDate: (date) => date },
    },
  }, true);
  await result.exports.done;
  return { ...result, initialized, writes, signIns };
}
const seedEnvironment = { ...environment, SEED_USER_EMAIL: 'test@example.invalid', SEED_USER_PASSWORD: 'FAKE-password' };

test('native and Web Firebase initialize with the six environment values and preserve their existing Auth path', () => {
  for (const platform of ['ios', 'web']) {
    const result = app(environment, platform);
    assert.equal(result.initialized.length, 1);
    for (const [field, name] of Object.entries(fields)) assert.equal(result.initialized[0][field], environment[name]);
    assert.equal(result.exports.auth, result.auth);
    assert.equal(result.exports.db, 'db');
    assert.equal(result.exports.storage, 'storage');
    if (platform === 'ios') assert.equal(result.exports.authPersistenceStatus, result.status);
    assert.equal(result.logs.length, 0);
  }
});

test('missing, empty and whitespace-only variables fail explicitly before any Firebase initialization', () => {
  for (const name of Object.values(fields)) {
    for (const value of [undefined, '', '   ']) {
      const initialized = [];
      assert.throws(() => app({ ...environment, [name]: value }, 'ios', initialized), (error) => {
        assert.ok(error.message.includes(name));
        assert.match(error.message, /Configuração Firebase ausente/);
        assert.doesNotMatch(error.message, /fake-/);
        return true;
      });
      assert.equal(initialized.length, 0);
    }
  }
});

test('app configuration uses Expo static dot references, with no hardcoded fallback or dynamic env access', () => {
  const source = fs.readFileSync(path.join(root, 'firebaseConfig.ts'), 'utf8');
  for (const name of Object.values(fields)) assert.ok(source.includes(`process.env.${name}`));
  assert.doesNotMatch(source, /process\.env\s*\[|\{[^\n]*EXPO_PUBLIC_[^\n]*\}\s*=\s*process\.env|AIza[\w-]+/);
  const padded = Object.fromEntries(Object.entries(environment).map(([name, value]) => [name, ` ${value} `]));
  const result = app(padded);
  assert.equal(result.initialized[0].apiKey, environment.EXPO_PUBLIC_FIREBASE_API_KEY);
});

test('seed reads the same Firebase environment, authenticates normally and writes only to its user path (mock services)', async () => {
  const result = await seed(seedEnvironment);
  assert.equal(result.process.exitCode, undefined);
  assert.equal(result.initialized.length, 1);
  for (const [field, name] of Object.entries(fields)) assert.equal(result.initialized[0][field], environment[name]);
  assert.deepEqual(result.signIns, [[seedEnvironment.SEED_USER_EMAIL, seedEnvironment.SEED_USER_PASSWORD]]);
  assert.equal(result.writes.length, 100);
  assert.ok(result.writes.every((write) => write.collection === 'users/test-user/transactions'));
  assert.ok(result.logs.flat().every((message) => !String(message).includes('FAKE-password')));
});

test('seed missing Firebase configuration reports only the variable name and never authenticates or writes', async () => {
  for (const name of Object.values(fields)) {
    for (const value of [undefined, '', '  ']) {
      const result = await seed({ ...seedEnvironment, [name]: value });
      assert.equal(result.process.exitCode, 1);
      const messages = result.logs.flat().join(' ');
      assert.ok(messages.includes(name));
      assert.doesNotMatch(messages, /fake-|FAKE-password/);
      assert.equal(result.initialized.length + result.signIns.length + result.writes.length, 0);
    }
  }
});

test('seed credentials remain separate from EXPO_PUBLIC configuration and are mandatory only for the script', async () => {
  for (const name of ['SEED_USER_EMAIL', 'SEED_USER_PASSWORD']) {
    const result = await seed({ ...seedEnvironment, [name]: undefined });
    assert.equal(result.process.exitCode, 1);
    assert.equal(result.initialized.length + result.writes.length, 0);
    assert.match(result.logs.flat().join(' '), /SEED_USER_EMAIL e SEED_USER_PASSWORD/);
  }
  assert.doesNotThrow(() => app(environment));
});

test('example contains six empty public variables and no live values or public-prefixed seed credentials', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const parsed = parseEnv(example);
  assert.deepEqual(Object.keys(parsed).sort(), Object.values(fields).sort());
  assert.ok(Object.values(parsed).every((value) => value === ''));
  assert.doesNotMatch(example, /AIza[\w-]+|EXPO_PUBLIC_SEED_USER/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'scripts/seedTransactions.mjs'), 'utf8'), /AIza[\w-]+/);
});

test('git ignores local .env and .env.local but allows the versioned .env.example', () => {
  for (const file of ['.env', '.env.local']) {
    assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--no-index', file], { cwd: root }).status, 0);
  }
  assert.equal(spawnSync('git', ['check-ignore', '--quiet', '--no-index', '.env.example'], { cwd: root }).status, 1);
});
