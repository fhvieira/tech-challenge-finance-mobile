const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const projectRoot = path.dirname(require.resolve('../package.json'));
function load(file, modules, globals = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(projectRoot, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, ...globals,
    require: (name) => {
      assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}
const { createTransactionsPaginationStore } = load('hooks/use-transactions-pagination.ts', { react: {} });
const { GetTransactionsPage } = load('src/application/use-cases/GetTransactionsPage.ts', {});

function rows(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `tx-${i}`, type: 'income', amount: i + 1,
    category: i < 20 ? 'Salário' : 'Mercado', description: '', date: new Date(2026, 10, i + 1, 12),
  }));
}

function visit(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (Array.isArray(element)) {
    for (const child of element) { const found = visit(child, predicate); if (found) return found; }
    return null;
  }
  if (predicate(element)) return element;
  return visit(element.props?.children, predicate);
}
function label(element, value) {
  const found = visit(element, (item) => item.props?.accessibilityLabel === value);
  assert.ok(found, `Missing element: ${value}`);
  return found;
}
function text(element) {
  if (element == null || typeof element === 'boolean') return '';
  if (typeof element !== 'object') return String(element);
  if (Array.isArray(element)) return element.map(text).join(' ');
  return text(element.props?.children);
}

function harness(initialRows, options) {
  let allRows = initialRows;
  let store;
  let stop;
  let hookIndex = 0;
  const hooks = [];
  let focusCallback;
  let focusCleanup;
  let focused = true;
  let effectQueue = [];
  let tree;
  let fail = false;
  let pending = null;
  let failCount = false;
  let firstRequest;
  let loadFirstPage;
  let loadNextPage;
  const calls = [];
  const countCalls = [];
  const timers = new Map();
  let timerId = 0;
  const navigation = [];
  const deleteCalls = [];
  const alerts = [];

  function matching(filters = {}) {
    return allRows.filter((item) =>
      (filters.minAmount === undefined || item.amount >= filters.minAmount) &&
      (filters.maxAmount === undefined || item.amount <= filters.maxAmount) &&
      (filters.startDate === undefined || item.date >= filters.startDate) &&
      (filters.endDate === undefined || item.date <= filters.endDate));
  }

  function changeUser(uid) {
    stop?.();
    const useCase = new GetTransactionsPage({ getPage: async (userId, size, cursor, filters) => {
      calls.push({ userId, size, cursor, filters });
      if (fail) throw new Error('offline');
      if (pending) return pending.promise;
      const offset = cursor ? Number(cursor) : 0;
      const matches = matching(filters);
      return {
        transactions: matches.slice(offset, offset + size),
        nextCursor: offset + size < matches.length ? String(offset + size) : null,
        hasMore: offset + size < matches.length,
      };
    } }, options);
    store = createTransactionsPaginationStore(uid, (...args) => useCase.execute(...args), async (userId, filters) => {
      countCalls.push({ userId, filters });
      if (failCount) throw new Error('count offline');
      return matching(filters).length;
    });
    const session = store;
    loadFirstPage = (filters) => {
      firstRequest = session.loadFirstPage(filters);
      return firstRequest;
    };
    loadNextPage = () => { firstRequest = session.loadNextPage(); return firstRequest; };
    stop = store.subscribe(() => {});
  }
  changeUser('user-a');
  const same = (left, right) => left?.length === right.length && right.every((v, i) => v === left[i]);
  const react = {
    useState: (initial) => {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef: (initial) => {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback: (callback, deps) => {
      const index = hookIndex++;
      if (!same(hooks[index]?.deps, deps)) hooks[index] = { callback, deps };
      return hooks[index].callback;
    },
    useMemo: (factory, deps) => {
      const index = hookIndex++;
      if (!same(hooks[index]?.deps, deps)) hooks[index] = { value: factory(), deps };
      return hooks[index].value;
    },
    useEffect: (effect, deps) => {
      const index = hookIndex++;
      if (!same(hooks[index]?.deps, deps)) effectQueue.push(() => {
        hooks[index]?.cleanup?.();
        hooks[index] = { deps, cleanup: effect() };
      });
    },
  };
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'Text', 'TextInput', 'View']
    .map((name) => [name, name]));
  Object.assign(native, {
    Keyboard: { dismiss: () => {} }, StyleSheet: { create: (styles) => styles },
    Alert: { alert: (...args) => alerts.push(args) },
  });
  const { default: Screen } = load('app/transactions.tsx', {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    '@react-native-community/datetimepicker': { default: 'DateTimePicker', __esModule: true },
    'expo-router': {
      router: { push: (destination) => navigation.push(destination) },
      useFocusEffect: (callback) => {
        if (callback !== focusCallback) effectQueue.push(() => {
          focusCleanup?.(); focusCallback = callback;
          focusCleanup = focused ? callback() : undefined;
        });
      },
    },
    '../constants/formatters': { formatCurrency: String, formatDate: (date) => date.toISOString() },
    '../constants/pressableFeedback': { getPressedFeedbackStyle: () => ({}) },
    '../contexts/TransactionsContext': { useTransactions: () => ({
      get transactions() { throw new Error('Full-history consumers are forbidden'); },
      ...store.getSnapshot(),
      loadFirstPage, loadNextPage, resetPagination: store.resetPagination,
      refreshTransactionsCount: store.refreshTransactionsCount,
      deleteTransaction: async (id) => { deleteCalls.push(id); allRows = allRows.filter((item) => item.id !== id); await store.invalidatePagination(); },
    }) },
  }, {
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });

  function render() {
    hookIndex = 0; effectQueue = [];
    tree = Screen();
    effectQueue.forEach((effect) => effect());
    return tree;
  }
  function list() { return visit(tree, (item) => item.type === 'FlatList').props; }
  render();
  return {
    render, list, calls, countCalls, timers, navigation, deleteCalls, alerts,
    settle: () => firstRequest,
    store: () => store,
    input: (name, value) => { label(list().ListHeaderComponent, name).props.onChangeText(value); render(); },
    clear: () => { label(list().ListHeaderComponent, 'Limpar filtros do extrato').props.onPress(); render(); },
    setFail: (value) => { fail = value; },
    setFailCount: (value) => { failCount = value; },
    setPending: (value) => { pending = value; },
    flushTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); render(); },
    blur: () => { focused = false; focusCleanup?.(); focusCleanup = undefined; },
    focus: () => { focused = true; focusCleanup = focusCallback(); render(); },
    changeUser: (uid, newRows) => { allRows = newRows; changeUser(uid); render(); },
    text: () => text(tree),
  };
}

test('screen uses real pages of 10 for 0, 1, 10, 11 and 23 records, without timers or client slicing', async () => {
  for (const count of [0, 1, 10, 11, 23]) {
    const app = harness(rows(count));
    app.render();
    assert.match(text(app.list().ListEmptyComponent), /Carregando transações/);
    await app.settle();
    app.render();
    assert.equal(app.list().data, app.store().getSnapshot().paginatedTransactions);
    assert.equal(app.list().data.length, Math.min(count, 10));
    while (app.store().getSnapshot().hasMore) {
      app.list().onEndReached();
      app.list().onEndReached(); // Same render, before loading flags change.
      await app.store().loadNextPage();
      app.render();
    }
    assert.equal(app.list().data.length, count);
    assert.equal(app.calls.length, Math.max(1, Math.ceil(count / 10)));
    assert.ok(app.calls.every((call) => call.size === 10));
    assert.equal(app.timers.size, 0);
    if (count) assert.equal(text(app.list().ListFooterComponent), 'Fim do histórico.');
    else assert.match(text(app.list().ListEmptyComponent), /Nenhuma transação/);
    app.list().onEndReached();
    assert.match(app.text(), new RegExp(`${count} de ${count} transações`));
  }
});

test('category search reads complete results outside the first page and clearing filters reloads real pages', async () => {
  const app = harness(rows(23));
  await app.settle(); app.render();
  app.input('Filtrar transações por categoria', '  mErCa  ');
  await app.settle(); app.render();
  assert.deepEqual(Array.from(app.list().data, (item) => item.id), ['tx-20', 'tx-21', 'tx-22']);
  assert.match(app.text(), /3 de 3 transações filtradas/);
  const calls = app.calls.length;
  app.list().onEndReached();
  assert.equal(app.calls.length, calls);
  app.clear();
  await app.settle(); app.render();
  assert.equal(app.list().data.length, 10);
  assert.equal(app.calls.at(-1).cursor, null);
});

test('category pages reveal no exact total before exhaustion and use no artificial timers', async () => {
  const app = harness(rows(23));
  await app.settle(); app.render();
  app.input('Filtrar transações por categoria', 'a');
  app.input('Filtrar por valor mínimo', '1,0');
  await app.settle(); app.render();
  assert.match(app.text(), /10 transações encontradas — pesquisa em andamento/);
  app.list().onEndReached(); app.list().onEndReached();
  await app.settle(); app.render();
  assert.equal(app.timers.size, 0);
  assert.equal(app.list().data.length, 20);
  app.list().onEndReached(); await app.settle(); app.render();
  assert.equal(app.list().data.length, 23);
  assert.match(app.text(), /23 de 23 transações filtradas/);
  assert.ok(app.calls.length >= 4);
});

test('value and date filters retain inclusive boundaries, comma parsing and full-day semantics', async () => {
  const app = harness(rows(23));
  await app.settle(); app.render();
  app.input('Filtrar por valor mínimo', '21,0');
  app.input('Filtrar por valor máximo', '23,0');
  await app.settle(); app.render();
  assert.deepEqual(Array.from(app.list().data, (item) => item.amount), [21, 22, 23]);
  label(app.list().ListHeaderComponent, 'Selecionar data inicial').props.onPress(); app.render();
  visit(app.list().ListHeaderComponent, (item) => item.type === 'DateTimePicker').props.onChange(null, new Date(2026, 10, 22, 18));
  app.render();
  label(app.list().ListHeaderComponent, 'Selecionar data final').props.onPress(); app.render();
  visit(app.list().ListHeaderComponent, (item) => item.type === 'DateTimePicker').props.onChange(null, new Date(2026, 10, 23, 1));
  app.render();
  await app.settle(); app.render();
  assert.deepEqual(Array.from(app.list().data, (item) => item.amount), [22, 23]);
  assert.match(app.text(), /2 de 2 transações filtradas/);
});

test('initial and additional errors show retry, never empty success or end of history, and do not auto-loop', async () => {
  const app = harness(rows(11));
  app.setFail(true);
  await app.settle(); app.render();
  assert.equal(app.list().ListEmptyComponent, undefined);
  assert.doesNotMatch(text(app.list().ListFooterComponent), /Fim do histórico/);
  app.list().onEndReached();
  assert.equal(app.calls.length, 1);
  app.setFail(false);
  label(app.list().ListFooterComponent, 'Tentar carregar transações novamente').props.onPress();
  await app.settle(); app.render();
  app.setFail(true);
  app.list().onEndReached();
  await app.store().loadNextPage(); app.render();
  assert.equal(app.list().data.length, 10);
  assert.doesNotMatch(text(app.list().ListFooterComponent), /Fim do histórico/);
  const calls = app.calls.length;
  app.list().onEndReached();
  assert.equal(app.calls.length, calls);
  app.setFail(false);
  label(app.list().ListFooterComponent, 'Tentar carregar transações novamente').props.onPress();
  await app.store().loadNextPage(); app.render();
  assert.equal(app.list().data.length, 11);
  assert.equal(text(app.list().ListFooterComponent), 'Fim do histórico.');
});

test('additional loading indicator and repeated end events keep a single in-flight page request', async () => {
  const app = harness(rows(11));
  await app.settle(); app.render();
  let resolve;
  app.setPending({ promise: new Promise((done) => { resolve = done; }) });
  app.list().onEndReached(); app.list().onEndReached();
  const request = app.store().loadNextPage();
  await Promise.resolve(); app.render();
  assert.match(text(app.list().ListFooterComponent), /Carregando mais transações/);
  app.list().onEndReached();
  assert.equal(app.calls.length, 2);
  resolve({ transactions: rows(11).slice(10), hasMore: false, nextCursor: null });
  await request; app.render();
  assert.equal(app.list().data.length, 11);
});

test('focus, account changes, logout and confirmed deletion update the paginated source; editing navigation is preserved', async () => {
  const app = harness(rows(11));
  await app.settle(); app.render();
  const card = app.list().renderItem({ item: app.list().data[0] });
  label(card, 'Editar transação Salário').props.onPress();
  assert.equal(app.navigation[0].pathname, '/transaction-form');
  assert.equal(app.navigation[0].params.id, 'tx-0');
  label(card, 'Excluir transação Salário').props.onPress();
  await app.alerts[0][2][1].onPress(); app.render();
  assert.equal(app.list().data[0].id, 'tx-1');
  assert.equal(app.list().data.length, 10);
  app.blur();
  assert.equal(app.store().getSnapshot().paginatedTransactions.length, 0);
  app.focus(); await app.settle(); app.render();
  assert.equal(app.calls.at(-1).cursor, null);
  const otherRows = [{ ...rows(1)[0], id: 'private-b' }];
  app.changeUser('user-b', otherRows);
  assert.equal(app.list().data.length, 0);
  await app.settle(); app.render();
  assert.equal(app.list().data[0].id, 'private-b');
  assert.equal(app.calls.at(-1).userId, 'user-b');
  app.changeUser(null, []); app.render();
  assert.equal(app.list().data.length, 0);
});

test('remote filtered count failure never appears as a zero total and can be retried independently', async () => {
  const app = harness(rows(23));
  await app.settle(); app.render();
  app.setFailCount(true);
  app.input('Filtrar por valor mínimo', '20');
  await app.settle(); app.render();
  assert.equal(app.list().data.length, 4);
  assert.match(app.text(), /4 transações carregadas/);
  assert.doesNotMatch(app.text(), /4 de 0/);
  assert.match(text(app.list().ListHeaderComponent), /Não foi possível atualizar a contagem/);
  const reads = app.calls.length;
  app.setFailCount(false);
  label(app.list().ListHeaderComponent, 'Tentar atualizar contagem novamente').props.onPress();
  await app.store().refreshTransactionsCount(); app.render();
  assert.equal(app.calls.length, reads);
  assert.match(app.text(), /4 de 4 transações filtradas/);
});

test('rare-category budget pause blocks automatic requests and continues without resetting an empty result cursor', async () => {
  const data = rows(60).map((r, i) => ({ ...r, category: i === 54 ? 'Rara' : 'Outra' }));
  const app = harness(data, { maxCandidateReads: 22 });
  await app.settle(); app.render();
  app.input('Filtrar transações por categoria', 'rara');
  await app.settle(); app.render();
  assert.equal(app.list().data.length, 0);
  assert.equal(app.list().ListEmptyComponent, undefined);
  assert.equal(app.store().getSnapshot().transactionsCount, null);
  assert.match(text(app.list().ListFooterComponent), /Continuar pesquisa/);
  const pausedReads = app.calls.length;
  app.list().onEndReached(); app.list().onEndReached();
  await Promise.resolve();
  assert.equal(app.calls.length, pausedReads);

  app.setFail(true);
  label(app.list().ListFooterComponent, 'Continuar pesquisa de transações').props.onPress();
  await app.settle(); app.render();
  assert.equal(app.calls.at(-1).cursor, '20');
  assert.doesNotMatch(text(app.list().ListFooterComponent), /Fim do histórico/);
  assert.equal(app.list().ListEmptyComponent, undefined);
  app.setFail(false);
  label(app.list().ListFooterComponent, 'Tentar carregar transações novamente').props.onPress();
  await app.settle(); app.render();
  assert.equal(app.calls[pausedReads + 1].cursor, '20');
  assert.equal(app.list().data.length, 0);
  label(app.list().ListFooterComponent, 'Continuar pesquisa de transações').props.onPress();
  await app.settle(); app.render();
  assert.equal(app.list().data[0].id, 'tx-54');
  assert.match(app.text(), /1 de 1 transações filtradas/);
});

test('nonexistent category shows no empty-result message until all bounded actions exhaust candidates', async () => {
  const app = harness(rows(45), { maxCandidateReads: 22 });
  await app.settle(); app.render();
  app.input('Filtrar transações por categoria', 'inexistente');
  await app.settle(); app.render();
  assert.equal(app.list().ListEmptyComponent, undefined);
  while (app.store().getSnapshot().hasMore) {
    label(app.list().ListFooterComponent, 'Continuar pesquisa de transações').props.onPress();
    await app.settle(); app.render();
  }
  assert.match(text(app.list().ListEmptyComponent), /Nenhuma transação encontrada/);
  assert.match(app.text(), /0 de 0 transações filtradas/);
});
