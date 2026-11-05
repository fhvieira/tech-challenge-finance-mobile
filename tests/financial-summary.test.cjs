const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const referenceFile = require.resolve('./fixtures/financial-summary-reference.json');
const reference = require(referenceFile);
const projectRoot = path.resolve(path.dirname(referenceFile), '../..');

function loadModule(file, modules = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      assert.ok(name in modules, `Unexpected runtime dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

const { createFinancialSummaryStore } = loadModule('hooks/use-financial-summary.ts', { react: {} });
const { GetFinancialSummary } = loadModule('src/application/use-cases/GetFinancialSummary.ts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function createRepository(rows, calls, fail = false) {
  const firestore = {
    collection: (_, ...segments) => ({ path: segments.join('/'), constraints: [] }),
    query: (base, ...constraints) => ({ ...base, constraints: [...base.constraints, ...constraints] }),
    orderBy: (field, direction) => ({ kind: 'order', field, direction }),
    where: (field, operator, value) => ({ kind: 'filter', field, operator, value }),
    count: () => ({ kind: 'count' }),
    sum: (field) => ({ kind: 'sum', field }),
    getAggregateFromServer: async (query, spec) => {
      calls.push({ query, spec });
      if (fail && Object.hasOwn(spec, 'totalExpense')) throw new Error('unavailable');
      let matching = rows;
      for (const constraint of query.constraints) {
        if (constraint.kind === 'order') {
          matching = matching.filter((row) => Object.hasOwn(row, constraint.field));
        } else {
          assert.equal(constraint.operator, '==');
          matching = matching.filter((row) => row[constraint.field] === constraint.value);
        }
      }
      const result = Object.fromEntries(Object.entries(spec).map(([alias, aggregate]) => [
        alias,
        aggregate.kind === 'count' ? matching.length : matching.reduce(
          (total, row) => total + (typeof row[aggregate.field] === 'number' ? row[aggregate.field] : 0), 0
        ),
      ]));
      return { data: () => result };
    },
  };
  const { FirebaseTransactionRepository } = loadModule(
    'src/infrastructure/repositories/FirebaseTransactionRepository.ts',
    { 'firebase/firestore': firestore }
  );
  return new FirebaseTransactionRepository({});
}

function currentIndicators(financialSummary) {
  const source = fs.readFileSync(path.join(projectRoot, 'app/index.tsx'), 'utf8');
  const formulas = source.slice(source.indexOf('  const totalIncome ='), source.indexOf('  useEffect(() => {'))
    .replace(/  const \[.*?\] = useState\(\(\) => new Animated.Value\(1?0?\)\);\n/g, '');
  const context = { financialSummary };
  vm.runInNewContext(formulas + '\nglobalThis.result = {totalIncome,totalExpense,balance,incomePercentage,expensePercentage,remainingIncomePercentage,financialInsight};', context);
  return context.result;
}

test('aggregations preserve the recorded totals, chart ratios and insight messages', async () => {
  for (const fixture of Object.values(reference.fixtures)) {
    const calls = [];
    const repository = createRepository(fixture.transactions, calls);
    const summary = await new GetFinancialSummary(repository).execute('user-a');
    for (const field of ['transactionCount', 'totalIncome', 'totalExpense']) {
      assert.equal(summary[field], fixture.expected[field]);
    }
    for (const [field, actual] of Object.entries(currentIndicators(summary))) {
      assert.equal(actual, fixture.expected[field], field);
    }
    assert.equal(calls.length, 3);
    for (const { query } of calls) {
      assert.equal(query.path, 'users/user-a/transactions');
      assert.ok(query.constraints.some((c) => c.kind === 'order' && c.field === 'createdAt' && c.direction === 'desc'));
    }
  }
});

test('createdAt existence and independent count match the original list universe', async () => {
  const rows = [
    { type: 'income', amount: 100, createdAt: 1 },
    { type: 'income', amount: 900 },
    { type: 'expense', amount: 30, createdAt: null },
    { type: 'other', amount: 50, createdAt: 2 },
  ];
  const result = await createRepository(rows, []).getFinancialSummary('user-b');
  assert.equal(result.transactionCount, 3);
  assert.equal(result.totalIncome, 100);
  assert.equal(result.totalExpense, 30);
});

test('a failed aggregation rejects the complete result', async () => {
  await assert.rejects(createRepository([], [], true).getFinancialSummary('user-a'), /unavailable/);
});

test('authentication and focus coalesce; mutations queue a fresh read and discard outdated data', async () => {
  const requests = [];
  const nextStarted = deferred();
  const store = createFinancialSummaryStore('user-a', (uid) => {
    assert.equal(uid, 'user-a');
    const pending = deferred();
    requests.push(pending);
    if (requests.length === 2) nextStarted.resolve();
    return pending.promise;
  });
  const seen = [];
  const unsubscribe = store.subscribe(() => seen.push(store.getSnapshot().financialSummary));
  const request = store.refreshFinancialSummary();
  assert.equal(request, store.refreshFinancialSummary());
  await Promise.resolve();
  assert.equal(requests.length, 1);
  assert.equal(store.getSnapshot().financialSummary, null);
  assert.equal(store.getSnapshot().isFinancialSummaryLoading, true);
  const invalidation = store.invalidateFinancialSummary();
  assert.equal(invalidation, request);
  const old = { transactionCount: 1, totalIncome: 10, totalExpense: 0 };
  const fresh = { transactionCount: 2, totalIncome: 20, totalExpense: 0 };
  requests[0].resolve(old);
  await nextStarted.promise;
  assert.equal(requests.length, 2);
  assert.equal(store.getSnapshot().financialSummary, null);
  requests[1].resolve(fresh);
  await request;
  assert.equal(store.getSnapshot().financialSummary, fresh);
  assert.ok(!seen.includes(old));
  assert.equal(store.getSnapshot().isFinancialSummaryLoading, false);
  unsubscribe();
});

test('errors retain the last valid summary and retry clears stale/error flags', async () => {
  const value = { transactionCount: 1, totalIncome: 100, totalExpense: 40 };
  let fail = true;
  const store = createFinancialSummaryStore('user-a', async () => {
    if (fail) throw new Error('offline');
    return value;
  });
  const unsubscribe = store.subscribe(() => {});
  await store.refreshFinancialSummary();
  assert.equal(store.getSnapshot().financialSummary, null);
  assert.ok(store.getSnapshot().financialSummaryError);
  fail = false;
  await store.refreshFinancialSummary();
  fail = true;
  await store.invalidateFinancialSummary();
  assert.equal(store.getSnapshot().financialSummary, value);
  assert.equal(store.getSnapshot().isFinancialSummaryStale, true);
  assert.ok(store.getSnapshot().financialSummaryError);
  fail = false;
  await store.refreshFinancialSummary();
  assert.equal(store.getSnapshot().isFinancialSummaryStale, false);
  assert.equal(store.getSnapshot().financialSummaryError, null);
  unsubscribe();
});

test('a mutation arriving when the previous request finishes still starts a fresh read', async () => {
  let reads = 0;
  let invalidated = false;
  const second = deferred();
  const firstValue = { transactionCount: 1, totalIncome: 10, totalExpense: 0 };
  const secondValue = { transactionCount: 2, totalIncome: 20, totalExpense: 0 };
  const store = createFinancialSummaryStore('user-a', async () => {
    reads++;
    return reads === 1 ? firstValue : second.promise;
  });
  const unsubscribe = store.subscribe(() => {
    if (!store.getSnapshot().isFinancialSummaryLoading && !invalidated) {
      invalidated = true;
      void store.invalidateFinancialSummary();
    }
  });
  await store.refreshFinancialSummary();
  assert.equal(reads, 2);
  second.resolve(secondValue);
  await store.refreshFinancialSummary();
  assert.equal(store.getSnapshot().financialSummary, secondValue);
  unsubscribe();
});

test('a session cancelled before the queued read starts does not query the previous UID', async () => {
  let reads = 0;
  const store = createFinancialSummaryStore('user-a', async () => { reads++; return {}; });
  const unsubscribe = store.subscribe(() => {});
  const pending = store.refreshFinancialSummary();
  unsubscribe();
  await pending;
  assert.equal(reads, 0);
});

test('logout/account change rejects late responses and never reuses a previous session summary', async () => {
  const late = deferred();
  const first = createFinancialSummaryStore('user-a', () => late.promise);
  const unsubscribe = first.subscribe(() => {});
  const pending = first.refreshFinancialSummary();
  await Promise.resolve();
  unsubscribe();
  const valueB = { transactionCount: 1, totalIncome: 200, totalExpense: 0 };
  const second = createFinancialSummaryStore('user-b', async () => valueB);
  const stopB = second.subscribe(() => {});
  await second.refreshFinancialSummary();
  late.resolve({ transactionCount: 1, totalIncome: 999, totalExpense: 0 });
  await pending;
  assert.equal(first.getSnapshot().financialSummary, null);
  assert.equal(second.getSnapshot().financialSummary, valueB);
  const anonymous = createFinancialSummaryStore(null, () => { throw new Error('Must not query'); });
  const stopAnonymous = anonymous.subscribe(() => {});
  await anonymous.refreshFinancialSummary();
  assert.equal(anonymous.getSnapshot().financialSummary, null);
  const returning = createFinancialSummaryStore('user-a', async () => valueB);
  assert.equal(returning.getSnapshot().financialSummary, null);
  stopB(); stopAnonymous();
});

test('summary failure does not reject successful CRUD and failed CRUD does not refresh', async () => {
  let reads = 0;
  const store = createFinancialSummaryStore('user-a', async () => { reads++; throw new Error('offline'); });
  const unsubscribe = store.subscribe(() => {});
  await store.refreshFinancialSummary();
  const useCases = {
    create: { execute: async () => {} },
    update: { execute: async () => {} },
    delete: { execute: async () => {} },
  };
  const modules = {
    react: {
      createContext: () => ({ Provider: () => null }),
      useState: (initial) => [initial, () => {}],
      useCallback: (callback) => callback,
      useEffect: () => {},
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    './AuthContext': { useAuth: () => ({ user: { uid: 'user-a' } }) },
    '../hooks/use-financial-summary': { useFinancialSummary: () => ({ ...store.getSnapshot(), ...store }) },
  };
  const { TransactionsProvider } = loadModule('contexts/TransactionsContext.tsx', modules);
  const api = TransactionsProvider({ useCases, children: null }).props.value;
  await api.addTransaction({}); await store.refreshFinancialSummary();
  await api.updateTransaction('tx', {}); await store.refreshFinancialSummary();
  await api.deleteTransaction('tx'); await store.refreshFinancialSummary();
  assert.equal(reads, 4);
  useCases.create.execute = async () => { throw new Error('write failed'); };
  await assert.rejects(api.addTransaction({}), /write failed/);
  assert.equal(reads, 4);
  unsubscribe();
});

test('dashboard refreshes on focus/foreground and detaches the foreground listener on blur', () => {
  let onFocus;
  let onAppState;
  let refreshes = 0;
  const summary = { transactionCount: 1, totalIncome: 100, totalExpense: 40 };
  const context = {
    financialSummary: summary,
    financialSummaryError: null,
    isFinancialSummaryStale: false,
    refreshFinancialSummary: async () => { refreshes++; },
  };
  Object.defineProperty(context, 'transactions', { get() { throw new Error('Dashboard must not read the list'); } });
  const native = {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles) => styles },
    Animated: { Value: class { interpolate() { return 0; } }, View: 'AnimatedView' },
    AppState: {
      currentState: 'active',
      addEventListener: (_, callback) => {
        onAppState = callback;
        return { remove: () => { onAppState = undefined; } };
      },
    },
  };
  for (const component of ['KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'View']) native[component] = component;
  const { default: Home } = loadModule('app/index.tsx', {
    react: { useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect: () => {}, useCallback: (fn) => fn },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': native,
    'expo-router': { useFocusEffect: (callback) => { onFocus = callback; }, router: {}, Redirect: 'Redirect' },
    'firebase/auth': { signOut: () => {} },
    '../constants/formatters': { formatCurrency: (value) => String(value) },
    '../constants/pressableFeedback': { getPressedFeedbackStyle: () => ({}) },
    '../contexts/AuthContext': { useAuth: () => ({ user: { uid: 'user-a', email: 'test@example.test' }, loading: false }) },
    '../contexts/TransactionsContext': { useTransactions: () => context },
    '../firebaseConfig': { auth: {} },
  });
  Home();
  const blur = onFocus();
  assert.equal(refreshes, 1);
  onAppState('active'); assert.equal(refreshes, 1);
  onAppState('background'); onAppState('active'); assert.equal(refreshes, 2);
  blur(); assert.equal(onAppState, undefined);

  context.financialSummary = null;
  const initial = Home();
  assert.equal(initial.props.children[0].props.children, 'Carregando...');
  context.financialSummaryError = 'Read failed';
  const failed = Home();
  assert.equal(failed.props.children[0].props.children, 'Read failed');
  assert.ok(failed.props.children[1].props.onPress);
});
