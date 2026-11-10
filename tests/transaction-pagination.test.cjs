const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { Timestamp } = require('firebase/firestore');

const projectRoot = path.dirname(require.resolve('../package.json'));

function loadModule(file, modules = {}) {
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(projectRoot, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === "../../domain/errors/TransactionWriteRejected") return loadModule("src/domain/errors/TransactionWriteRejected.ts");
      assert.ok(Object.hasOwn(modules, name), `Unexpected runtime dependency: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

const { GetTransactionsPage } = loadModule('src/application/use-cases/GetTransactionsPage.ts');
const { GetTransactionsCount } = loadModule('src/application/use-cases/GetTransactionsCount.ts');

function row(id, seconds = 100, nanoseconds = 0, userId = 'user-a') {
  return {
    id, userId,
    data: {
      type: 'income', amount: 12, category: 'Salário', description: '',
      date: new Timestamp(10, 0), createdAt: new Timestamp(seconds, nanoseconds),
      receiptUrl: 'existing-receipt',
    },
  };
}

function compareValue(left, right) {
  if (left === null) return right === null ? 0 : -1;
  if (right === null) return 1;
  if (left instanceof Timestamp) return Math.sign(left.seconds - right.seconds || left.nanoseconds - right.nanoseconds);
  return left < right ? -1 : left > right ? 1 : 0;
}

function compare(a, b, fields) {
  for (const field of fields) {
    const order = compareValue(field === '__name__' ? a.id : a.data[field], field === '__name__' ? b.id : b.data[field]);
    if (order) return -order;
  }
  return 0;
}

function setup(rows = [], failure = null) {
  const calls = [];
  function matchingRows(query) {
    const fields = query.constraints.filter((c) => c.kind === 'order').map((c) => c.field);
    assert.equal(fields[0], 'createdAt');
    assert.equal(fields.at(-1), '__name__');
    assert.ok(query.constraints.filter((c) => c.kind === 'order').every((c) => c.direction === 'desc'));
    return rows.filter((r) => r.userId === query.segments[1] &&
      fields.every((f) => f === '__name__' || Object.hasOwn(r.data, f)) &&
      query.constraints.filter((c) => c.kind === 'where').every((c) => {
        if (!Object.hasOwn(r.data, c.field)) return false;
        const difference = compareValue(r.data[c.field], c.value);
        return c.operator === '>=' ? difference >= 0 : c.operator === '<=' ? difference <= 0 : difference < 0;
      })
    ).sort((a, b) => compare(a, b, fields));
  }
  const firestore = {
    Timestamp,
    collection: (_, ...segments) => ({ segments }),
    documentId: () => '__name__',
    orderBy: (field, direction) => ({ kind: 'order', field, direction }),
    limit: (size) => ({ kind: 'limit', size }),
    startAfter: (...values) => ({ kind: 'cursor', values, timestamp: values[0], id: values.at(-1) }),
    where: (field, operator, value) => ({ kind: 'where', field, operator, value }),
    count: () => ({ kind: 'count' }),
    query: (base, ...constraints) => ({ ...base, constraints }),
    getDocsFromServer: async (query) => {
      calls.push(query);
      if (failure) throw failure;
      assert.deepEqual(query.segments.filter((_, i) => i !== 1), ['users', 'transactions']);
      const fields = query.constraints.filter((c) => c.kind === 'order').map((c) => c.field);
      let matching = matchingRows(query);
      const cursor = query.constraints.find((c) => c.kind === 'cursor');
      if (cursor) {
        const boundary = { id: cursor.id, data: Object.fromEntries(fields.map((f, i) => [f, cursor.values[i]])) };
        matching = matching.filter((r) => compare(r, boundary, fields) > 0);
      }
      return {
        docs: matching.slice(0, query.constraints.find((c) => c.kind === 'limit').size)
          .map((r) => ({ id: r.id, data: () => r.data })),
      };
    },
    getAggregateFromServer: async (query) => {
      calls.push({ ...query, aggregate: true });
      if (failure) throw failure;
      assert.ok(query.constraints.every((c) => c.kind !== 'cursor' && c.kind !== 'limit'));
      return { data: () => ({ transactionCount: matchingRows(query).length }) };
    },
  };
  const { FirebaseTransactionRepository } = loadModule(
    'src/infrastructure/repositories/FirebaseTransactionRepository.ts',
    { 'firebase/firestore': firestore }
  );
  return { repository: new FirebaseTransactionRepository({}), calls };
}

function ids(page) {
  return Array.from(page.transactions, (transaction) => transaction.id);
}

test('default page, intermediate page and final page use bounded server reads', async () => {
  const rows = Array.from({ length: 23 }, (_, i) => row(String(i).padStart(2, '0'), i));
  const { repository, calls } = setup(rows);
  const useCase = new GetTransactionsPage(repository);
  const first = await useCase.execute('user-a');
  const second = await useCase.execute('user-a', undefined, first.nextCursor);
  const last = await useCase.execute('user-a', undefined, second.nextCursor);
  assert.deepEqual(ids(first), rows.slice(13).reverse().map((r) => r.id));
  assert.deepEqual(ids(second), rows.slice(3, 13).reverse().map((r) => r.id));
  assert.deepEqual(ids(last), ['02', '01', '00']);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, true);
  assert.equal(last.hasMore, false);
  assert.equal(last.nextCursor, null);
  assert.equal(new Set([...ids(first), ...ids(second), ...ids(last)]).size, 23);
  assert.ok(calls.every((c) => c.constraints.find((v) => v.kind === 'limit').size === 11));
  assert.equal(first.transactions[0].createdAt.getTime(), 22000);
  assert.equal(first.transactions[0].receiptUrl, 'existing-receipt');
});

test('empty collection, short page and exact multiples have no phantom next page', async () => {
  for (const size of [0, 1, 2, 4]) {
    const { repository } = setup(Array.from({ length: size }, (_, i) => row(String(i))));
    let page = await repository.getPage('user-a', 2);
    const collected = [...ids(page)];
    while (page.hasMore) {
      page = await repository.getPage('user-a', 2, page.nextCursor);
      collected.push(...ids(page));
    }
    assert.equal(collected.length, size);
    assert.equal(page.nextCursor, null);
  }
});

test('equal timestamps use descending IDs without duplicates or omissions', async () => {
  const { repository } = setup(['a', 'd', 'c', 'b'].map((id) => row(id, 100, 123)));
  const first = await repository.getPage('user-a', 2);
  const last = await repository.getPage('user-a', 2, first.nextCursor);
  assert.deepEqual(ids(first), ['d', 'c']);
  assert.deepEqual(ids(last), ['b', 'a']);
  assert.equal(last.hasMore, false);
});

test('cursor preserves nanoseconds even when entity Dates have the same millisecond', async () => {
  const { repository, calls } = setup([row('z', 100, 1), row('a', 100, 2), row('m', 100, 3)]);
  const first = await repository.getPage('user-a', 1);
  const second = await repository.getPage('user-a', 1, first.nextCursor);
  const last = await repository.getPage('user-a', 1, second.nextCursor);
  assert.deepEqual([...ids(first), ...ids(second), ...ids(last)], ['m', 'a', 'z']);
  assert.equal(first.transactions[0].createdAt.getTime(), second.transactions[0].createdAt.getTime());
  assert.equal(calls[1].constraints.find((c) => c.kind === 'cursor').timestamp.nanoseconds, 3);
});

test('cursor still works if its boundary document is deleted', async () => {
  const rows = ['a', 'b', 'c'].map((id) => row(id));
  const { repository } = setup(rows);
  const first = await repository.getPage('user-a', 1);
  rows.splice(rows.findIndex((r) => r.id === 'c'), 1);
  assert.deepEqual(ids(await repository.getPage('user-a', 1, first.nextCursor)), ['b']);
});

test('missing createdAt is excluded; explicit null remains pageable', async () => {
  const rows = ['a', 'b', 'c'].map((id) => row(id));
  rows.forEach((r) => { r.data.createdAt = null; });
  const missing = row('missing');
  delete missing.data.createdAt;
  const { repository } = setup([...rows, missing]);
  const first = await repository.getPage('user-a', 2);
  const last = await repository.getPage('user-a', 2, first.nextCursor);
  assert.deepEqual([...ids(first), ...ids(last)], ['c', 'b', 'a']);
});

test('queries and cursors are scoped to UID, including a switch back to the first user', async () => {
  const { repository, calls } = setup([row('a'), row('b'), row('private-b', 100, 0, 'user-b')]);
  const first = await repository.getPage('user-a', 1);
  await assert.rejects(repository.getPage('user-b', 1, first.nextCursor), /Cursor/);
  assert.equal(calls.length, 1);
  assert.deepEqual(ids(await repository.getPage('user-b')), ['private-b']);
  assert.deepEqual(ids(await repository.getPage('user-a', 1, first.nextCursor)), ['a']);
});

test('malformed, unsupported and invalid-precision cursors fail before reading', async () => {
  const { repository, calls } = setup();
  const base = { version: 1, userId: 'user-a', id: 'a', createdAt: { seconds: 100, nanoseconds: 0 } };
  const invalid = [
    '', '%', 'null', encodeURIComponent(JSON.stringify({ ...base, version: 2 })),
    encodeURIComponent(JSON.stringify({ ...base, id: 'x/y' })),
    encodeURIComponent(JSON.stringify({ ...base, createdAt: {} })),
    encodeURIComponent(JSON.stringify({ ...base, createdAt: { seconds: 100, nanoseconds: 1e9 } })),
    encodeURIComponent(JSON.stringify({ ...base, createdAt: { seconds: 1.5, nanoseconds: 0 } })),
  ];
  for (const cursor of invalid) await assert.rejects(repository.getPage('user-a', 10, cursor), /Cursor/);
  assert.equal(calls.length, 0);
});

test('invalid page sizes fail before reading', async () => {
  const { repository, calls } = setup();
  for (const size of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(repository.getPage('user-a', size), /tamanho/);
  }
  assert.equal(calls.length, 0);
});

test('server errors propagate unchanged, without returning an empty successful page', async () => {
  const error = Object.assign(new Error('permission-denied'), { code: 'permission-denied' });
  const { repository } = setup([], error);
  await assert.rejects(new GetTransactionsPage(repository).execute('user-a'), (received) => received === error);
});

test('application only delegates UID, size and opaque cursor to the repository', async () => {
  const page = { transactions: [], nextCursor: null, hasMore: false };
  const calls = [];
  const useCase = new GetTransactionsPage({ getPage: async (...args) => { calls.push(args); return page; } });
  assert.equal(await useCase.execute('uid', 7, 'opaque-token'), page);
  assert.deepEqual(calls, [['uid', 7, 'opaque-token', undefined]]);
});

test('isolated and combined inclusive bounds paginate and count the same document universe', async () => {
  const rows = Array.from({ length: 24 }, (_, i) => {
    const record = row(String(i).padStart(2, '0'), 100 + i);
    record.data.amount = i;
    record.data.date = Timestamp.fromDate(new Date(2026, 10, i + 1, 12));
    return record;
  });
  for (const filters of [
    {}, { minAmount: 10 }, { maxAmount: 12 }, { minAmount: 10, maxAmount: 12 },
    { startDate: new Date(2026, 10, 10) }, { endDate: new Date(2026, 10, 12, 23, 59, 59, 999) },
    { startDate: new Date(2026, 10, 10), endDate: new Date(2026, 10, 12, 23, 59, 59, 999) },
    { minAmount: 5, maxAmount: 20, startDate: new Date(2026, 10, 10), endDate: new Date(2026, 10, 12, 23, 59, 59, 999) },
  ]) {
    const { repository } = setup(rows);
    const expected = rows.filter((r) =>
      (filters.minAmount === undefined || r.data.amount >= filters.minAmount) &&
      (filters.maxAmount === undefined || r.data.amount <= filters.maxAmount) &&
      (filters.startDate === undefined || r.data.date.toDate() >= filters.startDate) &&
      (filters.endDate === undefined || r.data.date.toDate() <= filters.endDate)
    ).reverse().map((r) => r.id);
    const collected = [];
    let cursor = null;
    do {
      const page = await repository.getPage('user-a', 2, cursor, filters);
      collected.push(...ids(page));
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    } while (cursor);
    assert.deepEqual(collected, expected);
    assert.equal(await new GetTransactionsCount(repository).execute('user-a', filters), expected.length);
  }
});

test('approved tie-breaks retain every timestamp ordering value and nanosecond', async () => {
  const rows = ['a', 'z', 'm', 'n'].map((id, i) => {
    const record = row(id, 100, 123);
    record.data.amount = i === 3 ? 13 : 12;
    record.data.date = new Timestamp(10, i);
    return record;
  });
  const filters = { minAmount: 10, startDate: new Date(0) };
  const { repository, calls } = setup(rows);
  const first = await repository.getPage('user-a', 2, null, filters);
  const last = await repository.getPage('user-a', 2, first.nextCursor, filters);
  assert.deepEqual([...ids(first), ...ids(last)], ['n', 'm', 'z', 'a']);
  const cursor = calls[1].constraints.find((c) => c.kind === 'cursor');
  assert.equal(cursor.values.length, 4);
  assert.equal(cursor.values[0].nanoseconds, 123);
  assert.equal(cursor.values[1], 12);
  assert.equal(cursor.values[2].nanoseconds, 2);
  assert.equal(cursor.values[3], 'm');
  assert.deepEqual(calls[0].constraints.filter((c) => c.kind === 'order').map((c) => c.field), ['createdAt', 'amount', 'date', '__name__']);
});

test('local-day bounds include both endpoints and sub-millisecond precision, excluding adjacent days', async () => {
  const endDate = new Date(2026, 10, 1, 23, 59, 59, 999);
  const startDate = new Date(2026, 10, 1);
  const stamp = Timestamp.fromDate(endDate);
  const rows = ['last', 'midnight', 'start', 'previous'].map((id) => row(id));
  rows[0].data.date = new Timestamp(stamp.seconds, 999999999);
  rows[1].data.date = Timestamp.fromDate(new Date(2026, 10, 2));
  rows[2].data.date = Timestamp.fromDate(startDate);
  rows[3].data.date = Timestamp.fromDate(new Date(startDate.getTime() - 1));
  const { repository } = setup(rows);
  assert.deepEqual(ids(await repository.getPage('user-a', 10, null, { startDate, endDate })), ['last', 'start']);
  assert.equal(await repository.getCount('user-a', { startDate, endDate }), 2);
});

test('installed SDK builds page/count queries with identical explicit ordering and the document key last', async () => {
  const sdk = require('firebase/firestore');
  const { initializeApp } = require('firebase/app');
  const db = sdk.getFirestore(initializeApp({ projectId: 'local-query-shape-only' }, 'filtered-pagination-tests'));
  const queries = [];
  const { FirebaseTransactionRepository } = loadModule(
    'src/infrastructure/repositories/FirebaseTransactionRepository.ts',
    { 'firebase/firestore': {
      ...sdk,
      getDocsFromServer: async (q) => { queries.push(q); return { docs: [] }; },
      getAggregateFromServer: async (q) => { queries.push(q); return { data: () => ({ transactionCount: 0 }) }; },
    } }
  );
  const repository = new FirebaseTransactionRepository(db);
  for (const filters of [{}, { minAmount: 1 }, { endDate: new Date() }, { minAmount: 1, endDate: new Date() }]) {
    await repository.getPage('user-a', 10, null, filters);
    await repository.getCount('user-a', filters);
    const expected = ['createdAt', ...(filters.minAmount === undefined ? [] : ['amount']), ...(filters.endDate ? ['date'] : []), '__name__'];
    for (const q of queries.splice(0)) {
      sdk.queryEqual(q, q);
      assert.deepEqual(q._query.memoizedNormalizedOrderBy.map((o) => o.field.canonicalString()), expected);
    }
  }
  // No network call is made here; remote acceptance is a separate iPhone check.
});

test('cursor rejects another UID, changed bounds, changed ordering, malformed values and old versions before reading', async () => {
  const { repository, calls } = setup([row('a'), row('b'), row('c')]);
  const filters = { minAmount: 1 };
  const first = await repository.getPage('user-a', 1, null, filters);
  const cursor = first.nextCursor;
  for (const [uid, changed] of [['user-b', filters], ['user-a', { minAmount: 2 }], ['user-a', {}], ['user-a', { startDate: new Date(0) }]]) {
    await assert.rejects(repository.getPage(uid, 1, cursor, changed), /Cursor/);
  }
  const boundary = JSON.parse(decodeURIComponent(cursor));
  for (const changed of [
    { ...boundary, version: 1 }, { ...boundary, scope: 'other-order' },
    { ...boundary, values: boundary.values.slice(1) },
    { ...boundary, values: [{ seconds: 100, nanoseconds: 1e9 }, 12, 'a'] },
    { ...boundary, values: [null, '12', 'a'] },
  ]) await assert.rejects(repository.getPage('user-a', 1, encodeURIComponent(JSON.stringify(changed)), filters), /Cursor/);
  assert.equal(calls.length, 1);
});

test('NaN and inverted bounds preserve empty-result semantics without confusing query errors with zero', async () => {
  const { repository, calls } = setup([row('a')]);
  for (const filters of [{ minAmount: NaN }, { minAmount: 5, maxAmount: 2 }, { startDate: new Date(10), endDate: new Date(0) }]) {
    assert.equal((await repository.getPage('user-a', 10, null, filters)).transactions.length, 0);
    assert.equal(await repository.getCount('user-a', filters), 0);
  }
  assert.equal(calls.length, 0);
  const error = new Error('failed-precondition');
  const failing = setup([], error).repository;
  await assert.rejects(failing.getCount('user-a', { minAmount: 1 }), (received) => received === error);
});
