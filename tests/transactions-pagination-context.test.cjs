const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.dirname(require.resolve('../package.json'));

function loadModule(file, modules = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(projectRoot, file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected runtime dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

const { createTransactionsPaginationStore, useTransactionsPagination } = loadModule(
  'hooks/use-transactions-pagination.ts', { react: {} }
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function page(ids, nextCursor = null) {
  return {
    transactions: ids.map((id) => ({ id, description: id })),
    nextCursor,
    hasMore: nextCursor !== null,
  };
}

function ids(store) {
  return Array.from(store.getSnapshot().paginatedTransactions, (item) => item.id);
}

function session(getPage, uid = 'user-a') {
  const store = createTransactionsPaginationStore(uid, getPage);
  const unsubscribe = store.subscribe(() => {});
  return { store, unsubscribe };
}

test('a child focus request before Provider subscription loads once the effect flush subscribes', async () => {
  let reads = 0;
  const store = createTransactionsPaginationStore('user-a', async () => {
    reads++;
    return page(['a']);
  });
  const requestedBeforeSubscription = store.loadFirstPage();
  assert.equal(reads, 0);
  const stop = store.subscribe(() => {});
  await requestedBeforeSubscription;
  assert.equal(reads, 1);
  assert.deepEqual(ids(store), ['a']);
  stop();

  // An old callback after unmount must neither query nor block a later session.
  await store.loadFirstPage();
  assert.equal(reads, 1);
  assert.equal(store.getSnapshot().isInitialPageLoading, false);
  const stopAgain = store.subscribe(() => {});
  await store.loadFirstPage();
  assert.equal(reads, 2);
  stopAgain();
});

test('pagination is lazy, first and next pages expose independent loading states and stop at the end', async () => {
  const requests = [deferred(), deferred()];
  const calls = [];
  const { store } = session((...args) => { calls.push(args); return requests[calls.length - 1].promise; });
  assert.equal(calls.length, 0);
  assert.equal(store.getSnapshot().hasMore, false);
  const first = store.loadFirstPage();
  assert.equal(store.getSnapshot().isInitialPageLoading, true);
  assert.equal(store.getSnapshot().isNextPageLoading, false);
  await Promise.resolve();
  requests[0].resolve(page(['a', 'b'], 'next'));
  await first;
  assert.deepEqual(ids(store), ['a', 'b']);
  const next = store.loadNextPage();
  assert.equal(store.getSnapshot().isInitialPageLoading, false);
  assert.equal(store.getSnapshot().isNextPageLoading, true);
  assert.deepEqual(ids(store), ['a', 'b']);
  await Promise.resolve();
  requests[1].resolve(page(['c']));
  await next;
  assert.deepEqual(ids(store), ['a', 'b', 'c']);
  assert.equal(store.getSnapshot().hasMore, false);
  await store.loadNextPage();
  assert.deepEqual(calls, [['user-a', 10, null], ['user-a', 10, 'next']]);
});

test('simultaneous first/next calls share the current request, both before and after it starts', async () => {
  const pending = deferred();
  let calls = 0;
  const { store } = session(() => { calls++; return pending.promise; });
  const first = store.loadNextPage(); // Also bootstraps a session without a first page.
  assert.equal(store.loadFirstPage(), first);
  assert.equal(store.loadNextPage(), first);
  await Promise.resolve();
  assert.equal(store.loadFirstPage(), first);
  assert.equal(store.loadNextPage(), first);
  pending.resolve(page(['a']));
  await first;
  assert.equal(calls, 1);
});

test('next pages deduplicate IDs and update repeated records without moving their position', async () => {
  let calls = 0;
  const { store } = session(async () => ++calls === 1 ? page(['a', 'b'], 'next') : {
    ...page(['b', 'c']), transactions: [{ id: 'b', description: 'updated' }, { id: 'c' }],
  });
  await store.loadFirstPage();
  await store.loadNextPage();
  assert.deepEqual(ids(store), ['a', 'b', 'c']);
  assert.equal(store.getSnapshot().paginatedTransactions[1].description, 'updated');
});

test('first-page failure and next-page failure allow retry; additional failure retains items and cursor', async () => {
  const results = [new Error('offline'), page(['a'], 'cursor-a'), new Error('offline'), page(['b'])];
  const calls = [];
  const { store } = session(async (...args) => {
    calls.push(args);
    const result = results.shift();
    if (result instanceof Error) throw result;
    return result;
  });
  await store.loadFirstPage();
  assert.ok(store.getSnapshot().paginationError);
  assert.equal(store.getSnapshot().isInitialPageLoading, false);
  await store.loadFirstPage();
  assert.equal(store.getSnapshot().paginationError, null);
  await store.loadNextPage();
  assert.deepEqual(ids(store), ['a']);
  assert.equal(store.getSnapshot().hasMore, true);
  assert.ok(store.getSnapshot().paginationError);
  assert.equal(store.getSnapshot().isNextPageLoading, false);
  await store.loadNextPage();
  assert.deepEqual(ids(store), ['a', 'b']);
  assert.equal(store.getSnapshot().paginationError, null);
  assert.deepEqual(calls.map((args) => args[2]), [null, null, 'cursor-a', 'cursor-a']);
});

test('reset clears items and cursors; late success or error cannot overwrite a newer generation', async () => {
  for (const rejectOld of [false, true]) {
    const pending = deferred();
    let calls = 0;
    const cursors = [];
    const { store } = session((uid, size, cursor) => {
      cursors.push(cursor);
      if (++calls === 1) return Promise.resolve(page(['a'], 'cursor-a'));
      return calls === 2 ? pending.promise : Promise.resolve(page(['fresh']));
    });
    // Filtered sessions bypass the first-page cache.
    await store.loadFirstPage({ minAmount: 0 });
    const old = store.loadNextPage();
    await Promise.resolve();
    store.resetPagination();
    assert.deepEqual(ids(store), []);
    assert.equal(store.getSnapshot().hasMore, false);
    assert.equal(store.getSnapshot().isNextPageLoading, false);
    await store.loadFirstPage({ minAmount: 0 });
    if (rejectOld) pending.reject(new Error('old failure'));
    else pending.resolve(page(['old']));
    await old;
    assert.deepEqual(ids(store), ['fresh']);
    assert.equal(store.getSnapshot().paginationError, null);
    assert.deepEqual(cursors, [null, 'cursor-a', null]);
  }
});

test('reset or unmount before a scheduled load prevents the query; unmounted late responses are ignored', async () => {
  let calls = 0;
  const pending = deferred();
  const { store, unsubscribe } = session(() => { calls++; return pending.promise; });
  const skipped = store.loadFirstPage();
  store.resetPagination();
  await skipped;
  assert.equal(calls, 0);
  const skippedOnUnmount = store.loadFirstPage();
  unsubscribe();
  await skippedOnUnmount;
  assert.equal(calls, 0);
  const stop = store.subscribe(() => {});
  const late = store.loadFirstPage();
  await Promise.resolve();
  stop();
  pending.resolve(page(['old']));
  await late;
  assert.deepEqual(ids(store), []);
  assert.equal(store.getSnapshot().isInitialPageLoading, false);
});

test('hook isolates A → B → logout → A, detaches old sessions and never reuses a cursor', async () => {
  let previousDependencies;
  let memoized;
  let subscribedStore;
  let cleanup;
  const react = {
    useMemo: (factory, dependencies) => {
      if (!previousDependencies || dependencies.some((value, i) => value !== previousDependencies[i])) {
        memoized = factory();
        previousDependencies = dependencies;
      }
      return memoized;
    },
    useSyncExternalStore: (subscribe, getSnapshot) => {
      if (subscribedStore !== subscribe) {
        cleanup?.();
        subscribedStore = subscribe;
        cleanup = subscribe(() => {});
      }
      return getSnapshot();
    },
  };
  const { useTransactionsPagination: usePagination } = loadModule(
    'hooks/use-transactions-pagination.ts', { react }
  );
  const pending = deferred();
  const pendingCount = deferred();
  let countReads = 0;
  const countUseCase = { execute: () => ++countReads === 1 ? pendingCount.promise : Promise.resolve(1) };
  const calls = [];
  const useCase = { execute: (uid, size, cursor) => {
    calls.push([uid, size, cursor]);
    return calls.length === 1 ? pending.promise : Promise.resolve(page([uid]));
  } };
  let api = usePagination('user-a', useCase, countUseCase);
  const old = api.loadFirstPage();
  await Promise.resolve();
  api = usePagination('user-b', useCase, countUseCase);
  assert.equal(api.paginatedTransactions.length, 0);
  assert.equal(api.transactionsCount, null);
  await api.loadFirstPage();
  pending.resolve(page(['private-a'], 'cursor-a'));
  pendingCount.resolve(99);
  await old;
  api = usePagination('user-b', useCase, countUseCase);
  assert.deepEqual(Array.from(api.paginatedTransactions, (item) => item.id), ['user-b']);
  assert.equal(api.transactionsCount, 1);
  api = usePagination(null, useCase, countUseCase);
  await api.loadFirstPage(); await api.loadNextPage();
  assert.equal(api.paginatedTransactions.length, 0);
  assert.equal(api.hasMore, false);
  assert.equal(api.transactionsCount, null);
  api = usePagination('user-a', useCase, countUseCase);
  assert.equal(api.paginatedTransactions.length, 0);
  await api.loadNextPage();
  assert.deepEqual(calls, [['user-a', 10, null], ['user-b', 10, null], ['user-a', 10, null]]);
  cleanup();
});

test('invalidation is lazy until used, clears all pages and discards a request predating the write', async () => {
  const pending = deferred();
  let calls = 0;
  const { store } = session(() => ++calls === 1 ? pending.promise : Promise.resolve(page(['after-write'])));
  await store.invalidatePagination();
  assert.equal(calls, 0);
  const old = store.loadFirstPage();
  await Promise.resolve();
  await store.invalidatePagination();
  assert.deepEqual(ids(store), ['after-write']);
  pending.resolve(page(['before-write'], 'old-cursor'));
  await old;
  assert.deepEqual(ids(store), ['after-write']);
  assert.equal(store.getSnapshot().hasMore, false);
});

test('Context invalidates after confirmed CRUD, contains refresh failure and exposes no full-history API/listener', async () => {
  let reads = 0;
  let writes = 0;
  let summaryRefreshes = 0;
  const invalidations = [];
  const { store } = session(async () => {
    reads++;
    if (reads > 1) throw new Error('offline');
    return page(['a'], 'cursor');
  });
  await store.loadFirstPage();
  const execute = async () => { writes++; };
  const useCases = {
    create: { execute }, update: { execute }, delete: { execute },
  };
  const { TransactionsProvider } = loadModule('contexts/TransactionsContext.tsx', {
    react: {
      createContext: () => ({ Provider: () => null }),
      useCallback: (callback) => callback,
      useRef: (initial) => ({ current: initial }),
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    './AuthContext': { useAuth: () => ({ user: { uid: 'user-a' } }) },
    '../hooks/use-financial-summary': {
      useFinancialSummary: () => ({ invalidateFinancialSummary: async () => { summaryRefreshes++; } }),
    },
    '../hooks/use-transactions-pagination': {
      useTransactionsPagination: () => ({
        ...store.getSnapshot(), ...store,
        invalidatePagination: () => {
          const request = store.invalidatePagination();
          invalidations.push(request);
          return request;
        },
      }),
    },
  });
  const api = TransactionsProvider({ children: null, useCases }).props.value;
  assert.equal(api.loadFirstPage, store.loadFirstPage);
  assert.equal(api.loadNextPage, store.loadNextPage);
  assert.equal(api.resetPagination, store.resetPagination);
  assert.equal('transactions' in api, false);
  for (const write of [() => api.addTransaction({}), () => api.updateTransaction('a', {}), () => api.deleteTransaction('a')]) {
    await assert.doesNotReject(write);
    await invalidations.at(-1);
    assert.ok(store.getSnapshot().paginationError);
    assert.deepEqual(ids(store), []);
  }
  assert.equal(reads, 4);
  assert.equal(writes, 3);
  assert.equal(summaryRefreshes, 3);
  useCases.create.execute = async () => { throw new Error('write failed'); };
  await assert.rejects(api.addTransaction({}), /write failed/);
  assert.equal(reads, 4);
  assert.equal(summaryRefreshes, 3);
});

test('Context and pagination hook have no Firebase runtime dependency', () => {
  assert.equal(typeof useTransactionsPagination, 'function');
  for (const file of ['contexts/TransactionsContext.tsx', 'hooks/use-transactions-pagination.ts']) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    assert.doesNotMatch(source, /from\s+["'](?:firebase|.*infrastructure)/);
  }
});

test('filter changes discard pending pages and counts, including late errors and a switch back to no filters', async () => {
  for (const lateError of [false, true]) {
    const oldPage = deferred();
    const oldCount = deferred();
    const calls = [];
    const store = createTransactionsPaginationStore('user-a', (uid, size, cursor, filters) => {
      calls.push({ uid, size, cursor, filters });
      return filters?.minAmount === 1 ? oldPage.promise : Promise.resolve(page(['fresh']));
    }, (uid, filters) => filters?.minAmount === 1 ? oldCount.promise : Promise.resolve(1));
    const stop = store.subscribe(() => {});
    const first = store.loadFirstPage({ minAmount: 1 });
    await Promise.resolve();
    await store.loadFirstPage({ minAmount: 2 });
    if (lateError) { oldPage.reject(new Error('old')); oldCount.reject(new Error('old')); }
    else { oldPage.resolve(page(['old'], 'old-cursor')); oldCount.resolve(99); }
    await first;
    assert.deepEqual(ids(store), ['fresh']);
    assert.equal(store.getSnapshot().transactionsCount, 1);
    assert.equal(store.getSnapshot().paginationError, null);
    assert.equal(store.getSnapshot().transactionsCountError, null);
    await store.loadFirstPage();
    assert.equal(calls.at(-1).filters, undefined);
    stop();
  }
});

test('filter dates are copied, next pages retain filters, and CRUD invalidation refreshes the current filtered count', async () => {
  const calls = [];
  const countCalls = [];
  const store = createTransactionsPaginationStore('user-a', async (uid, size, cursor, filters) => {
    calls.push({ uid, size, cursor, filters });
    return page([cursor ? 'b' : 'a'], cursor ? null : 'next');
  }, async (uid, filters) => { countCalls.push({ uid, filters }); return 2; });
  const stop = store.subscribe(() => {});
  const startDate = new Date(2026, 10, 1);
  await store.loadFirstPage({ minAmount: 12, startDate });
  startDate.setFullYear(2000);
  await store.loadNextPage();
  assert.equal(calls[1].filters.startDate.getFullYear(), 2026);
  assert.equal(countCalls.length, 1);
  await store.invalidatePagination();
  assert.equal(calls.at(-1).cursor, null);
  assert.equal(calls.at(-1).filters.minAmount, 12);
  assert.equal(countCalls.length, 2);
  assert.deepEqual(ids(store), ['a']);
  stop();
});

test('count failures retain valid pages and never become a zero or a page error; retry count does not fetch pages', async () => {
  let pageReads = 0;
  let countReads = 0;
  let failCount = true;
  const store = createTransactionsPaginationStore('user-a', async () => { pageReads++; return page(['a']); }, async () => {
    countReads++;
    if (failCount) throw new Error('failed-precondition');
    return 1;
  });
  const stop = store.subscribe(() => {});
  await store.loadFirstPage({ maxAmount: 10 });
  assert.deepEqual(ids(store), ['a']);
  assert.equal(store.getSnapshot().transactionsCount, null);
  assert.ok(store.getSnapshot().transactionsCountError);
  assert.equal(store.getSnapshot().paginationError, null);
  failCount = false;
  const retry = store.refreshTransactionsCount();
  assert.equal(store.refreshTransactionsCount(), retry);
  await retry;
  assert.equal(store.getSnapshot().transactionsCount, 1);
  assert.equal(store.getSnapshot().transactionsCountError, null);
  assert.equal(pageReads, 1);
  assert.equal(countReads, 2);
  stop();
});
