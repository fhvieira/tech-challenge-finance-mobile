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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, require: (name) => { assert.ok(Object.hasOwn(modules, name)); return modules[name]; },
  });
  return exports;
}
const { GetTransactionsPage } = load('src/application/use-cases/GetTransactionsPage.ts');
const { createTransactionsPaginationStore } = load('hooks/use-transactions-pagination.ts', { react: {} });

function records(count, category = (i) => i < 10 ? 'Mercado' : 'Outros') {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i), category: category(i), amount: i, date: new Date(2026, 10, i + 1),
  }));
}
function repository(rows) {
  const calls = [];
  let failAt = 0;
  const repo = {
    getPage: async (uid, size, cursor, filters = {}) => {
      calls.push({ uid, size, cursor, filters });
      if (calls.length === failAt) throw new Error('offline');
      assert.equal(filters.category, undefined, 'Category must not become an unsupported remote filter');
      const matching = rows.filter((r) =>
        (filters.minAmount === undefined || r.amount >= filters.minAmount) &&
        (filters.maxAmount === undefined || r.amount <= filters.maxAmount) &&
        (filters.startDate === undefined || r.date >= filters.startDate) &&
        (filters.endDate === undefined || r.date <= filters.endDate));
      const start = cursor ? Number(cursor.split(':')[1]) : 0;
      const hasMore = start + size < matching.length;
      return {
        transactions: matching.slice(start, start + size), hasMore,
        nextCursor: hasMore ? `native:${start + size}` : null,
      };
    },
  };
  return { repo, calls, failOn: (index) => { failAt = index; } };
}
const ids = (page) => Array.from(page.transactions, (r) => r.id);
const options = { candidateBatchSize: 10, maxCandidateReads: 22 };

test('category keeps trim/lowercase/includes semantics and fills a first page without scanning further', async () => {
  const { repo, calls } = repository(records(25));
  const useCase = new GetTransactionsPage(repo, options);
  const first = await useCase.execute('a', 10, null, { category: '  eRcA  ' });
  assert.deepEqual(ids(first), Array.from({ length: 10 }, (_, i) => String(i)));
  assert.equal(calls.length, 1);
  assert.equal(first.hasMore, true);
  assert.equal(first.searchLimitReached, false);
  assert.equal(calls[0].size, 10);
});

test('rare category after several batches resumes at the next candidate after reaching the read budget', async () => {
  const { repo, calls } = repository(records(45, (i) => i === 42 ? 'Rara' : 'Outra'));
  const useCase = new GetTransactionsPage(repo, options);
  const collected = [];
  let cursor = null;
  const readStarts = [];
  do {
    const callStart = calls.length;
    const result = await useCase.execute('a', 10, cursor, { category: 'rara' });
    collected.push(...ids(result));
    const action = calls.slice(callStart);
    assert.ok(action.reduce((total, call) => total + call.size + 1, 0) <= 22);
    readStarts.push(action[0].cursor);
    if (result.hasMore) { assert.equal(result.searchLimitReached, true); assert.ok(result.nextCursor); }
    cursor = result.nextCursor;
  } while (cursor);
  assert.deepEqual(collected, ['42']);
  assert.deepEqual(readStarts, [null, 'native:20', 'native:40']);
  assert.deepEqual(calls.map((call) => call.cursor), [null, 'native:10', 'native:20', 'native:30', 'native:40']);
});

test('nonexistent category returns a continuation while candidates remain, then exhausts without false matches', async () => {
  const { repo } = repository(records(35));
  const useCase = new GetTransactionsPage(repo, options);
  const first = await useCase.execute('a', 10, null, { category: 'inexistente' });
  assert.equal(first.transactions.length, 0);
  assert.equal(first.searchLimitReached, true);
  assert.equal(first.hasMore, true);
  const last = await useCase.execute('a', 10, first.nextCursor, { category: 'inexistente' });
  assert.equal(last.transactions.length, 0);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextCursor, null);
});

test('partial matches survive budget pauses and the cursor advances beyond non-matching candidates', async () => {
  const { repo, calls } = repository(records(45, (i) => i === 2 || i === 42 ? 'Rara' : 'Outra'));
  const useCase = new GetTransactionsPage(repo, options);
  const first = await useCase.execute('a', 10, null, { category: 'rara' });
  assert.deepEqual(ids(first), ['2']);
  assert.equal(first.searchLimitReached, true);
  const priorReads = calls.length;
  const second = await useCase.execute('a', 10, first.nextCursor, { category: 'rara' });
  assert.equal(calls[priorReads].cursor, 'native:19');
  const last = await useCase.execute('a', 10, second.nextCursor, { category: 'rara' });
  assert.deepEqual([...ids(first), ...ids(second), ...ids(last)], ['2', '42']);
  assert.equal(last.hasMore, false);
});

test('small remaining match slots do not discard surplus matches, and all IDs across pages are preserved', async () => {
  const rows = records(24, (i) => i % 3 ? 'Mercado' : 'Outra');
  const { repo } = repository(rows);
  const useCase = new GetTransactionsPage(repo, { maxCandidateReads: 100 });
  const collected = [];
  let cursor = null;
  do {
    const page = await useCase.execute('a', 4, cursor, { category: 'merc' });
    assert.ok(page.transactions.length <= 4);
    collected.push(...ids(page)); cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(collected, rows.filter((r) => r.category === 'Mercado').map((r) => r.id));
  assert.equal(new Set(collected).size, collected.length);
});

test('category combines with inclusive date/value bounds while all candidates still use repository ordering', async () => {
  const rows = records(25, () => 'Supermercado');
  const { repo, calls } = repository(rows);
  const useCase = new GetTransactionsPage(repo);
  const result = await useCase.execute('a', 10, null, {
    category: 'merc', minAmount: 5, maxAmount: 12,
    startDate: new Date(2026, 10, 9), endDate: new Date(2026, 10, 11),
  });
  assert.deepEqual(ids(result), ['8', '9', '10']);
  assert.equal(result.hasMore, false);
  assert.equal(calls[0].filters.minAmount, 5);
  assert.equal(calls[0].filters.maxAmount, 12);
});

test('search envelope rejects another UID/category/date/value or malformed/foreign cursor', async () => {
  const { repo, calls } = repository(records(35));
  const useCase = new GetTransactionsPage(repo, options);
  const first = await useCase.execute('a', 2, null, { category: 'merc' });
  const before = calls.length;
  for (const [uid, filters] of [
    ['b', { category: 'merc' }], ['a', { category: 'outra' }], ['a', { category: 'merc', minAmount: 1 }],
    ['a', { category: 'merc', endDate: new Date() }], ['a', {}],
  ]) await assert.rejects(useCase.execute(uid, 2, first.nextCursor, filters), /Cursor/);
  await assert.rejects(useCase.execute('a', 2, 'native:2', { category: 'merc' }), /Cursor/);
  await assert.rejects(useCase.execute('a', 2, 'category:%', { category: 'merc' }), /Cursor/);
  assert.equal(calls.length, before);
});

test('a mid-action network failure retries the original action without losing its earlier matches', async () => {
  const { repo, calls, failOn } = repository(records(28, (i) => i === 2 || i === 25 ? 'Rara' : 'Outra'));
  const useCase = new GetTransactionsPage(repo);
  failOn(2);
  await assert.rejects(useCase.execute('a', 10, null, { category: 'rara' }), /offline/);
  failOn(0);
  const result = await useCase.execute('a', 10, null, { category: 'rara' });
  assert.equal(calls[2].cursor, null);
  assert.deepEqual(ids(result), ['2', '25']);
});

test('pending search is coalesced and cancels further batches after category or UID changes', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { repo, calls } = repository(records(35));
  const original = repo.getPage;
  repo.getPage = (...args) => calls.length === 0 ? (calls.push({}), pending) : original(...args);
  const useCase = new GetTransactionsPage(repo, options);
  let countReads = 0;
  const store = createTransactionsPaginationStore('a', (...args) => useCase.execute(...args), async () => { countReads++; return 35; });
  const stop = store.subscribe(() => {});
  const old = store.loadFirstPage({ category: 'antiga' });
  store.loadNextPage();
  await Promise.resolve();
  await store.loadFirstPage({ category: 'merc' });
  resolve({ transactions: records(10), hasMore: true, nextCursor: 'native:10' });
  await old;
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().paginatedTransactions[0].category, 'Mercado');
  assert.equal(countReads, 0);
  assert.equal(store.getSnapshot().transactionsCount, null);
  stop();
  assert.equal(store.getSnapshot().paginatedTransactions.length, 0);
});

test('category totals remain unknown on partial scans and become the scanned result count only at exhaustion', async () => {
  const { repo } = repository(records(35, (i) => i === 31 ? 'Rara' : 'Outra'));
  const useCase = new GetTransactionsPage(repo, options);
  const store = createTransactionsPaginationStore('a', (...args) => useCase.execute(...args), async () => { throw new Error('Must not count candidates as matches'); });
  const stop = store.subscribe(() => {});
  await store.loadFirstPage({ category: 'rara' });
  assert.equal(store.getSnapshot().transactionsCount, null);
  assert.equal(store.getSnapshot().searchLimitReached, true);
  await store.loadNextPage();
  assert.equal(store.getSnapshot().transactionsCount, 1);
  assert.equal(store.getSnapshot().hasMore, false);
  assert.equal(store.getSnapshot().paginatedTransactions[0].id, '31');
  stop();
});

test('invalid budgets and broken non-advancing candidate pages fail instead of looping', async () => {
  for (const options of [{ maxCandidateReads: 1 }, { candidateBatchSize: 0 }, { maxCandidateReads: NaN }]) {
    assert.throws(() => new GetTransactionsPage({}, options), /Configuração/);
  }
  const useCase = new GetTransactionsPage({ getPage: async () => ({ transactions: [], hasMore: true, nextCursor: null }) });
  await assert.rejects(useCase.execute('a', 10, null, { category: 'x' }), /cursor/);
});

test('UID changes cancel remaining category batches and keep new-account results isolated', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const calls = [];
  const useCase = new GetTransactionsPage({ getPage: async (uid) => {
    calls.push(uid);
    return uid === 'a' ? pending : { transactions: [{ id: 'private-b', category: 'Mercado' }], hasMore: false, nextCursor: null };
  } });
  const first = createTransactionsPaginationStore('a', (...args) => useCase.execute(...args));
  const stop = first.subscribe(() => {});
  const old = first.loadFirstPage({ category: 'merc' });
  await Promise.resolve(); stop();
  const second = createTransactionsPaginationStore('b', (...args) => useCase.execute(...args));
  const stopSecond = second.subscribe(() => {});
  await second.loadFirstPage({ category: 'merc' });
  resolve({ transactions: records(10), hasMore: true, nextCursor: 'native:10' });
  await old;
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(first.getSnapshot().paginatedTransactions.length, 0);
  assert.equal(second.getSnapshot().paginatedTransactions[0].id, 'private-b');
  stopSecond();
});

test('confirmed create, edit and delete restart the same category search and clear previous results', async () => {
  const data = records(15);
  const { repo } = repository(data);
  const useCase = new GetTransactionsPage(repo);
  const store = createTransactionsPaginationStore('a', (...args) => useCase.execute(...args));
  const stop = store.subscribe(() => {});
  await store.loadFirstPage({ category: 'merc' });
  data.unshift({ ...data[0], id: 'created', category: 'Mercado novo' });
  await store.invalidatePagination();
  assert.equal(store.getSnapshot().paginatedTransactions[0].id, 'created');
  data[0].category = 'Outra';
  await store.invalidatePagination();
  assert.equal(store.getSnapshot().paginatedTransactions.some((r) => r.id === 'created'), false);
  data.splice(1, 1);
  await store.invalidatePagination();
  assert.equal(store.getSnapshot().paginatedTransactions.some((r) => r.id === '0'), false);
  assert.equal(store.getSnapshot().transactionsCount, 9);
  stop();
});

test('source tree contains no transaction subscription contract, composition or onSnapshot implementation', () => {
  for (const file of ['src/domain/repositories/TransactionRepository.ts',
    'src/infrastructure/repositories/FirebaseTransactionRepository.ts', 'contexts/TransactionsContext.tsx', 'app/_layout.tsx']) {
    const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    assert.doesNotMatch(source, /\bonSnapshot\b|\bObserveTransactions\b|\bsubscribe\s*\(/);
  }
  assert.equal(fs.existsSync(path.join(projectRoot, 'src/application/use-cases/ObserveTransactions.ts')), false);
});
