const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const projectRoot = path.dirname(require.resolve('../package.json'));

function load(file, modules = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(projectRoot, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected runtime dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

const { createTransactionsPaginationStore } = load('hooks/use-transactions-pagination.ts', { react: {} });
function page(id = 'first', nextCursor = 'timestamp-precise-opaque-cursor') {
  return { transactions: [{ id, category: 'Mercado' }], nextCursor, hasMore: nextCursor !== null };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ids = (store) => Array.from(store.getSnapshot().paginatedTransactions, (r) => r.id);

test('preloading performs page/count reads; opening with equivalent empty filters uses cache without either read', async () => {
  const calls = [];
  let counts = 0;
  const store = createTransactionsPaginationStore('user-a', async (...args) => { calls.push(args); return page(); }, async () => { counts++; return 15; });
  const stop = store.subscribe(() => {});
  assert.equal(calls.length, 0);
  await store.preloadFirstPage();
  assert.equal(calls.length, 1);
  assert.equal(counts, 1);
  assert.equal(store.getSnapshot().firstPageSource, 'network');
  await store.loadFirstPage({ category: '', minAmount: undefined, maxAmount: undefined });
  assert.deepEqual(ids(store), ['first']);
  assert.equal(store.getSnapshot().transactionsCount, 15);
  assert.equal(store.getSnapshot().hasMore, true);
  assert.equal(store.getSnapshot().firstPageSource, 'cache');
  assert.equal(calls.length, 1);
  assert.equal(counts, 1);
  stop();
});

test('opening shares pending preloading, including the interval between page and count responses', async () => {
  const pendingPage = deferred();
  const pendingCount = deferred();
  let reads = 0;
  let counts = 0;
  const store = createTransactionsPaginationStore('a', () => { reads++; return pendingPage.promise; }, () => { counts++; return pendingCount.promise; });
  const pageVisible = deferred();
  const stop = store.subscribe(() => {
    if (store.getSnapshot().paginatedTransactions.length) pageVisible.resolve();
  });
  const preloading = store.preloadFirstPage();
  assert.equal(store.loadFirstPage({}), preloading);
  await Promise.resolve();
  pendingPage.resolve(page());
  await pageVisible.promise;
  assert.deepEqual(ids(store), ['first']);
  assert.equal(store.loadFirstPage({ category: '  ' }), preloading);
  assert.equal(reads, 1);
  assert.equal(counts, 1);
  pendingCount.resolve(15);
  await preloading;
  await store.loadFirstPage();
  assert.equal(store.getSnapshot().firstPageSource, 'cache');
  assert.equal(reads, 1);
  stop();
});

test('the default 30-second TTL expires at its boundary and cache hits do not extend it', async () => {
  let time = 0;
  let reads = 0;
  const store = createTransactionsPaginationStore('a', async () => page(`read-${++reads}`), undefined, { now: () => time });
  const stop = store.subscribe(() => {});
  await store.preloadFirstPage();
  time = 29_999;
  await store.loadFirstPage();
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().firstPageSource, 'cache');
  time = 30_000;
  await store.loadFirstPage();
  assert.equal(reads, 2);
  assert.equal(store.getSnapshot().firstPageSource, 'network');
  assert.deepEqual(ids(store), ['read-2']);
  stop();
});

test('blur/reset retains only the first-page cache, and next pages resume its original opaque cursor', async () => {
  const calls = [];
  const store = createTransactionsPaginationStore('a', async (uid, size, cursor) => {
    calls.push({ uid, size, cursor });
    return cursor ? page('next', null) : page();
  });
  const stop = store.subscribe(() => {});
  await store.preloadFirstPage();
  await store.loadNextPage();
  assert.deepEqual(ids(store), ['first', 'next']);
  store.resetPagination();
  assert.deepEqual(ids(store), []);
  await store.loadFirstPage();
  assert.deepEqual(ids(store), ['first']);
  assert.equal(calls.length, 2);
  await store.loadNextPage();
  assert.equal(calls[2].cursor, 'timestamp-precise-opaque-cursor');
  assert.deepEqual(ids(store), ['first', 'next']);
  stop();
});

test('filtered first pages bypass cache and invalidation clears the unfiltered entry as well', async () => {
  let reads = 0;
  const store = createTransactionsPaginationStore('a', async () => page(`read-${++reads}`));
  const stop = store.subscribe(() => {});
  await store.preloadFirstPage();
  for (const filters of [{ minAmount: 1 }, { maxAmount: 2 }, { startDate: new Date(0) }, { category: 'merc' }]) {
    await store.loadFirstPage(filters);
    assert.equal(store.getSnapshot().firstPageSource, 'network');
  }
  assert.equal(reads, 5);
  await store.invalidatePagination();
  assert.equal(reads, 6);
  await store.loadFirstPage();
  assert.equal(reads, 7);
  stop();
});

test('confirmed CRUD invalidates cached data while a failed refresh remains a handled read error', async () => {
  let reads = 0;
  let failure = false;
  const store = createTransactionsPaginationStore('a', async () => {
    reads++;
    if (failure) throw new Error('offline');
    return page(`read-${reads}`);
  });
  const stop = store.subscribe(() => {});
  await store.preloadFirstPage();
  for (let operation = 0; operation < 3; operation++) {
    await store.invalidatePagination();
    assert.equal(store.getSnapshot().firstPageSource, 'network');
    assert.deepEqual(ids(store), [`read-${operation + 2}`]);
  }
  assert.equal(reads, 4);
  failure = true;
  await assert.doesNotReject(store.invalidatePagination());
  assert.ok(store.getSnapshot().paginationError);
  failure = false;
  await store.loadFirstPage();
  assert.equal(reads, 6);
  stop();
});

test('invalidating pending preloading cannot repopulate cache with the old response', async () => {
  const oldPage = deferred();
  let reads = 0;
  const store = createTransactionsPaginationStore('a', () => ++reads === 1 ? oldPage.promise : Promise.resolve(page('fresh')));
  const stop = store.subscribe(() => {});
  const old = store.preloadFirstPage();
  await Promise.resolve();
  await store.invalidatePagination();
  oldPage.resolve(page('obsolete'));
  await old;
  store.resetPagination();
  await store.loadFirstPage();
  assert.deepEqual(ids(store), ['fresh']);
  assert.equal(store.getSnapshot().firstPageSource, 'cache');
  assert.equal(reads, 2);
  stop();
});

test('logout/unmount clears cached data and ignores late responses; another UID and a new session query afresh', async () => {
  let reads = 0;
  const getPage = async (uid) => { reads++; return page(uid); };
  const first = createTransactionsPaginationStore('a', getPage);
  const stop = first.subscribe(() => {});
  await first.preloadFirstPage(); stop();
  assert.deepEqual(ids(first), []);
  const anonymous = createTransactionsPaginationStore(null, getPage);
  const stopAnonymous = anonymous.subscribe(() => {});
  await anonymous.preloadFirstPage();
  assert.equal(reads, 1);
  const second = createTransactionsPaginationStore('b', getPage);
  const stopSecond = second.subscribe(() => {});
  assert.deepEqual(ids(second), []);
  await second.loadFirstPage();
  assert.deepEqual(ids(second), ['b']);
  const returning = createTransactionsPaginationStore('a', getPage);
  const stopReturning = returning.subscribe(() => {});
  await returning.loadFirstPage();
  assert.equal(reads, 3);
  stopSecond(); stopReturning(); stopAnonymous();

  const pending = deferred();
  const disposed = createTransactionsPaginationStore('a', () => pending.promise);
  const stopDisposed = disposed.subscribe(() => {});
  const old = disposed.preloadFirstPage();
  await Promise.resolve(); stopDisposed();
  pending.resolve(page('private-a'));
  await old;
  assert.deepEqual(ids(disposed), []);
});

test('failed page or count preloading does not cache errors and opening retries normally', async () => {
  for (const failingPart of ['page', 'count']) {
    let reads = 0;
    let counts = 0;
    const store = createTransactionsPaginationStore('a', async () => {
      if (++reads === 1 && failingPart === 'page') throw new Error('offline');
      return page();
    }, async () => {
      if (++counts === 1 && failingPart === 'count') throw new Error('offline');
      return 15;
    });
    const stop = store.subscribe(() => {});
    await assert.doesNotReject(store.preloadFirstPage());
    await store.loadFirstPage();
    assert.equal(reads, 2);
    assert.equal(counts, 2);
    assert.equal(store.getSnapshot().paginationError, null);
    assert.equal(store.getSnapshot().transactionsCountError, null);
    stop();
  }
});

test('dashboard preloads only on authenticated focus, with a stable effect across ordinary renders', () => {
  const hooks = [];
  let hookIndex = 0;
  let focusCallbacks;
  let user = { uid: 'a', email: 'test@example.test' };
  let loading = false;
  let preloads = 0;
  const context = {
    financialSummary: null, financialSummaryError: null,
    refreshFinancialSummary: async () => {}, preloadFirstPage: async () => { preloads++; },
  };
  const native = {
    Platform: { OS: 'ios' }, StyleSheet: { create: (styles) => styles },
    Animated: { Value: class {} }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    View: 'View', Text: 'Text', Pressable: 'Pressable',
  };
  const { default: Home } = load('app/index.tsx', {
    react: {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useEffect: () => {},
      useCallback: (callback, dependencies) => {
        const index = hookIndex++;
        if (!hooks[index] || dependencies.some((value, i) => value !== hooks[index].dependencies[i])) {
          hooks[index] = { callback, dependencies };
        }
        return hooks[index].callback;
      },
    },
    'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    'expo-router': { useFocusEffect: (callback) => focusCallbacks.push(callback), router: {}, Redirect: 'Redirect' },
    'firebase/auth': { signOut: () => {} },
    '../constants/formatters': { formatCurrency: String },
    '../constants/pressableFeedback': { getPressedFeedbackStyle: () => ({}) },
    '../contexts/AuthContext': { useAuth: () => ({ user, loading }) },
    '../contexts/TransactionsContext': { useTransactions: () => context }, '../firebaseConfig': { auth: {} },
  });
  function render() { hookIndex = 0; focusCallbacks = []; Home(); return focusCallbacks[0]; }
  const onFocus = render(); onFocus();
  assert.equal(preloads, 1);
  assert.equal(render(), onFocus);
  assert.equal(preloads, 1);
  loading = true; render()();
  assert.equal(preloads, 1);
  loading = false; user = null; render()();
  assert.equal(preloads, 1);
  user = { uid: 'b' }; render()();
  assert.equal(preloads, 2);
});
