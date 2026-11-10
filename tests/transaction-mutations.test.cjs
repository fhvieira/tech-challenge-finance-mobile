const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.dirname(require.resolve('../package.json'));
function load(file, modules = {}, globals = {}, extra = '') {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code + extra, { exports, ...globals, require: (name) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  return exports;
}
const entity = load('src/domain/entities/Transaction.ts');
const receiptContract = load('src/domain/repositories/ReceiptRepository.ts');
const writeErrors = load('src/domain/errors/TransactionWriteRejected.ts');
const { TransactionWriteRejected } = writeErrors;
const { ReceiptUploadError } = receiptContract;
const { CreateTransaction } = load('src/application/use-cases/CreateTransaction.ts', { '../../domain/entities/Transaction': entity });
const { UpdateTransaction } = load('src/application/use-cases/UpdateTransaction.ts', { '../../domain/entities/Transaction': entity });
const { SaveTransactionWithReceipt, TransactionSaveError } = load('src/application/use-cases/SaveTransactionWithReceipt.ts', {
  '../../domain/entities/Transaction': entity, '../../domain/errors/TransactionWriteRejected': writeErrors,
});
const input = { type: 'income', amount: 25.5, category: 'Salário', description: 'Descrição', date: new Date(), receiptUrl: 'existing-receipt' };
const file = { uri: 'file:///selected.pdf' };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function saver(options = {}) {
  const calls = { create: [], update: [], upload: [], remove: [], release: [] };
  const uploaded = { path: 'users/a/receipts/new-id', url: 'new-receipt' };
  const repository = {
    create: async (...args) => { calls.create.push(args); if (options.writeError) throw options.writeError; },
    update: async (...args) => { calls.update.push(args); if (options.writeError) throw options.writeError; },
  };
  const receipts = {
    upload: async (...args) => { calls.upload.push(args); if (options.uploadError) throw options.uploadError; return uploaded; },
    removeNewUpload: async (...args) => { calls.remove.push(args); if (options.cleanupError) throw options.cleanupError; },
    releaseUpload: (...args) => calls.release.push(args),
  };
  return { calls, execute: (...args) => new SaveTransactionWithReceipt(new CreateTransaction(repository), new UpdateTransaction(repository), receipts).execute(...args) };
}

test('create/update reject NaN, infinities, zero and negatives before persistence or upload', async () => {
  for (const amount of [NaN, Infinity, -Infinity, 0, -1]) {
    const service = saver();
    for (const id of [undefined, 'tx']) await assert.rejects(service.execute('a', { ...input, amount }, file, id), /valor válido/);
    assert.equal(service.calls.create.length + service.calls.update.length + service.calls.upload.length, 0);
    for (const UseCase of [CreateTransaction, UpdateTransaction]) {
      const repository = { create: () => assert.fail('Invalid value reached create'), update: () => assert.fail('Invalid value reached update') };
      await assert.rejects(UseCase === CreateTransaction
        ? new UseCase(repository).execute('a', { ...input, amount })
        : new UseCase(repository).execute('a', 'tx', { ...input, amount }), /valor válido/);
    }
  }
});

test('successful create/edit preserves an existing receipt, never deletes it and replaces URL only for a new upload', async () => {
  const service = saver();
  await service.execute('a', input);
  await service.execute('a', input, null, 'tx');
  assert.equal(service.calls.create[0][1].receiptUrl, 'existing-receipt');
  assert.equal(service.calls.update[0][2].receiptUrl, 'existing-receipt');
  await service.execute('a', input, file, 'tx');
  assert.equal(service.calls.update[1][2].receiptUrl, 'new-receipt');
  assert.equal(service.calls.remove.length, 0);
  assert.equal(service.calls.release.length, 1);
});

test('explicit create/edit rejections clean only the newly uploaded handle and retain the original error', async () => {
  for (const id of [undefined, 'tx']) {
    const original = new Error('refused');
    const rejected = new TransactionWriteRejected(original);
    const service = saver({ writeError: rejected });
    await assert.rejects(service.execute('a', input, file, id), (error) => {
      assert.ok(error instanceof TransactionSaveError);
      assert.equal(error.originalError, rejected);
      assert.equal(error.originalError.originalError, original);
      assert.equal(error.outcomeUnknown, false);
      assert.equal(error.cleanupFailed, false);
      return true;
    });
    assert.equal(service.calls.remove.length, 1);
    assert.equal(service.calls.remove[0][1].url, 'new-receipt');
    assert.equal(service.calls.release.length, 1);
  }
});

test('uncertain write outcomes preserve new uploads and warn to check the statement before retrying', async () => {
  for (const id of [undefined, 'tx']) {
    const service = saver({ writeError: new Error('connection lost') });
    await assert.rejects(service.execute('a', input, file, id), (error) => {
      assert.equal(error.outcomeUnknown, true);
      assert.match(error.message, /Confira o extrato/);
      return true;
    });
    assert.equal(service.calls.remove.length, 0);
    assert.equal(service.calls.release.length, 1);
  }
});

test('cleanup failure is explicit without replacing the original write rejection', async () => {
  const original = new TransactionWriteRejected(new Error('refused'));
  const service = saver({ writeError: original, cleanupError: new Error('storage offline') });
  await assert.rejects(service.execute('a', input, file), (error) => {
    assert.equal(error.originalError, original);
    assert.equal(error.cleanupFailed, true);
    assert.match(error.message, /Também não foi possível remover/);
    return true;
  });
});

test('upload failure prevents create/edit and unauthenticated save performs no upload or write', async () => {
  const failure = new ReceiptUploadError(new Error('upload failed'));
  const service = saver({ uploadError: failure });
  await assert.rejects(service.execute('a', input, file), (error) => error === failure);
  await assert.rejects(service.execute('', input, file), /Entre na sua conta/);
  assert.equal(service.calls.create.length + service.calls.update.length + service.calls.remove.length, 0);
});

function receiptRepository(options = {}) {
  const calls = { upload: [], metadata: [], remove: [], paths: [], closed: 0 };
  let sequence = 0;
  const { FirebaseReceiptRepository } = load('src/infrastructure/repositories/FirebaseReceiptRepository.ts', {
    '../../domain/repositories/ReceiptRepository': receiptContract,
    'firebase/firestore': { collection: () => ({}), doc: () => ({ id: `unique-${++sequence}` }) },
    'firebase/storage': {
      ref: (_, target) => { calls.paths.push(target); return { path: target }; },
      uploadBytes: async (target, blob, metadata) => { calls.upload.push(target.path); calls.metadata.push(metadata); if (options.uploadFailure) throw options.uploadFailure; },
      getDownloadURL: async () => { if (options.urlFailure) throw options.urlFailure; return 'new-url'; },
      deleteObject: async (target) => { calls.remove.push(target.path); if (options.cleanupFailure) throw options.cleanupFailure; },
    },
  }, { fetch: async () => {
    if (options.fetchFailure) throw options.fetchFailure;
    return { blob: async () => ({ type: options.blobType ?? '', close: () => calls.closed++ }) };
  } });
  return { calls, repository: new FirebaseReceiptRepository({}, {}) };
}

test('upload uses exclusive random paths scoped by UID and releases local blobs', async () => {
  const { repository, calls } = receiptRepository();
  const first = await repository.upload('a', file);
  const second = await repository.upload('a', file);
  assert.notEqual(first.path, second.path);
  assert.ok(calls.upload.every((value) => value.startsWith('users/a/receipts/')));
  assert.equal(calls.closed, 2);
  await assert.rejects(repository.removeNewUpload('b', first), /Não é permitido/);
  repository.releaseUpload(first);
  await assert.rejects(repository.removeNewUpload('a', first), /Não é permitido/);
  await assert.rejects(repository.removeNewUpload('a', { path: 'users/a/receipts/existing', url: 'old' }), /Não é permitido/);
  assert.equal(calls.remove.length, 0);
});

test('URL failure cleans a confirmed new upload before any write; cleanup failure retains original upload error', async () => {
  const original = new Error('url failed');
  for (const cleanupFailure of [undefined, new Error('cleanup failed')]) {
    const { repository, calls } = receiptRepository({ urlFailure: original, cleanupFailure });
    await assert.rejects(repository.upload('a', file), (error) => {
      assert.equal(error.originalError, original);
      assert.equal(error.cleanupFailed, Boolean(cleanupFailure));
      return true;
    });
    assert.equal(calls.remove.length, 1);
  }
});

test('failed fetch/upload never deletes an uncertain object and reports upload failure', async () => {
  for (const options of [{ fetchFailure: new Error('file failed') }, { uploadFailure: new Error('upload failed') }]) {
    const { repository, calls } = receiptRepository(options);
    await assert.rejects(repository.upload('a', file), (error) => error instanceof ReceiptUploadError);
    assert.equal(calls.remove.length, 0);
  }
});

test('Firestore marks only definite create/update rejections, preserving unknown errors and delete failures', async () => {
  let failure;
  const { FirebaseTransactionRepository } = load('src/infrastructure/repositories/FirebaseTransactionRepository.ts', {
    '../../domain/errors/TransactionWriteRejected': writeErrors,
    'firebase/firestore': {
      collection: () => ({}), doc: () => ({}), Timestamp: { fromDate: (date) => date }, serverTimestamp: () => 'server',
      addDoc: async () => { throw failure; }, updateDoc: async () => { throw failure; }, deleteDoc: async () => { throw failure; },
    },
  });
  const repository = new FirebaseTransactionRepository({});
  for (const code of ['permission-denied', 'unauthenticated', 'invalid-argument', 'not-found', 'already-exists', 'unavailable', 'deadline-exceeded', 'unknown']) {
    failure = { code };
    const definite = !['unavailable', 'deadline-exceeded', 'unknown'].includes(code);
    for (const write of [() => repository.create('a', input), () => repository.update('a', 'tx', input)]) {
      await assert.rejects(write(), (error) => definite ? error instanceof TransactionWriteRejected && error.originalError === failure : error === failure);
    }
    await assert.rejects(repository.delete('a', 'tx'), (error) => error === failure);
  }
});

function hooksHarness() {
  const hooks = [];
  let index = 0;
  const cleanups = [];
  return {
    reset: () => { index = 0; }, unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
    react: {
      useState: (initial) => {
        const slot = index++;
        if (!(slot in hooks)) hooks[slot] = typeof initial === 'function' ? initial() : initial;
        return [hooks[slot], (value) => { hooks[slot] = typeof value === 'function' ? value(hooks[slot]) : value; }];
      },
      useRef: (initial) => { const slot = index++; return hooks[slot] ??= { current: initial }; },
      useEffect: (effect) => { const slot = index++; if (!(slot in hooks)) { hooks[slot] = true; cleanups.push(effect()); } },
      useCallback: (callback) => callback, useMemo: (factory) => factory(),
      createContext: () => ({ Provider: 'Provider' }),
    },
  };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) { for (const child of tree) { const match = find(child, predicate); if (match) return match; } return null; }
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
function byLabel(tree, label) {
  const element = find(tree, (item) => item.props?.accessibilityLabel === label);
  assert.ok(element, `Missing: ${label}`);
  return element;
}
function contextHarness(uid = 'a') {
  const hooks = hooksHarness();
  let user = uid ? { uid } : null;
  const calls = [];
  let write = async () => {};
  let refreshFails = false;
  const refresh = async () => { calls.push('refresh'); if (refreshFails) throw new Error('refresh failed'); };
  const execute = async (...args) => { calls.push(args); await write(); };
  const { TransactionsProvider } = load('contexts/TransactionsContext.tsx', {
    react: hooks.react, 'react/jsx-runtime': require('react/jsx-runtime'),
    './AuthContext': { useAuth: () => ({ user }) },
    '../hooks/use-transactions-pagination': { useTransactionsPagination: () => ({ invalidatePagination: refresh }) },
    '../hooks/use-financial-summary': { useFinancialSummary: () => ({ invalidateFinancialSummary: refresh }) },
  });
  function render() { hooks.reset(); return TransactionsProvider({ children: null, useCases: {
    create: { execute }, update: { execute }, delete: { execute }, saveWithReceipt: { execute },
  } }).props.value; }
  return { render, calls, setWrite: (value) => { write = value; }, setUser: (value) => { user = value ? { uid: value } : null; }, failRefresh: () => { refreshFails = true; } };
}

test('Context explicitly rejects unauthenticated create/edit/delete/save without invoking use cases', async () => {
  const context = contextHarness(null);
  const api = context.render();
  for (const write of [() => api.addTransaction(input), () => api.updateTransaction('tx', input), () => api.deleteTransaction('tx'), () => api.saveTransaction(input, file)]) {
    await assert.rejects(write(), /Entre na sua conta/);
  }
  assert.equal(context.calls.length, 0);
});

test('rapid duplicate CRUD calls share one request; failures propagate and allow retry; refresh failure does not reject success', async () => {
  for (const operation of ['create', 'edit', 'delete', 'receipt']) {
    const context = contextHarness();
    let api = context.render();
    const pending = deferred(); context.setWrite(() => pending.promise);
    const invoke = () => operation === 'create' ? api.addTransaction(input) : operation === 'edit' ? api.updateTransaction('tx', input)
      : operation === 'delete' ? api.deleteTransaction('tx') : api.saveTransaction(input, file);
    const first = invoke(); api = context.render(); const second = invoke();
    assert.equal(first, second);
    await Promise.resolve();
    assert.equal(context.calls.length, 1);
    pending.reject(new Error('write failed'));
    await assert.rejects(first, /write failed/);
    assert.equal(context.calls.length, 1);
    context.setWrite(async () => {}); context.failRefresh();
    await assert.doesNotReject(invoke());
    assert.equal(context.calls.filter(Array.isArray).length, 2);
  }
});

test('in-flight mutation keys are isolated between UIDs and logout cannot perform a new operation', async () => {
  const context = contextHarness();
  const pending = deferred(); context.setWrite(() => pending.promise);
  const first = context.render().deleteTransaction('tx');
  await Promise.resolve();
  context.setUser('b'); context.setWrite(async () => {});
  await context.render().deleteTransaction('tx');
  context.setUser(null);
  await assert.rejects(context.render().deleteTransaction('tx'), /Entre na sua conta/);
  assert.deepEqual(context.calls.filter(Array.isArray).map((args) => args[0]), ['a', 'b']);
  pending.resolve(); await first;
});

function formHarness(options = {}) {
  const hooks = hooksHarness();
  const calls = [];
  const browserCalls = [];
  let openBrowser = options.openBrowser ?? (async () => ({ type: 'dismiss' }));
  let navigations = 0;
  let write = options.write ?? (async () => {});
  const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map((name) => [name, name]));
  Object.assign(native, { StyleSheet: { create: (styles) => styles }, Keyboard: { dismiss: () => {} }, Platform: { OS: 'ios' } });
  const { TransactionForm } = load('app/transaction-form.tsx', {
    react: hooks.react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DateTimePicker' },
    'expo-web-browser': { openBrowserAsync: async (url) => { browserCalls.push(url); return openBrowser(url); } },
    'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ ...file, name: 'receipt.pdf', mimeType: 'application/pdf' }] }) },
    'expo-router': { Stack: { Screen: 'Screen' }, router: { back: () => navigations++ } },
    '../constants/formatters': { formatDate: String }, '../constants/formValidationStyles': { formValidationStyles: {} },
    '../constants/pressableFeedback': { getPressedFeedbackStyle: () => ({}) },
    '../contexts/AuthContext': {},
    '../contexts/TransactionsContext': { useTransactions: () => ({ saveTransaction: async (...args) => { calls.push(args); await write(); } }) },
    '../src/domain/repositories/ReceiptRepository': receiptContract,
    '../src/application/use-cases/SaveTransactionWithReceipt': { TransactionSaveError },
  }, { console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map((method) => [method, () => assert.fail(`Unexpected ${method} log in form`)])) }, '\nexports.TransactionForm = TransactionForm;');
  let tree;
  function render() { hooks.reset(); tree = TransactionForm({ id: options.id, transaction: options.id ? options.transaction ?? input : null }); return tree; }
  render();
  const label = options.id ? 'Salvar alterações da transação' : 'Concluir transação';
  return {
    calls, browserCalls, render, unmount: hooks.unmount, navigations: () => navigations,
    setBrowser: (value) => { openBrowser = value; },
    find: (predicate) => find(tree, predicate),
    setWrite: (value) => { write = value; },
    element: (name) => byLabel(tree, name),
    submit: () => byLabel(tree, label).props.onPress(),
    input: (name, value) => { byLabel(tree, name).props.onChangeText(value); render(); },
    alert: () => find(tree, (item) => item.props?.accessibilityRole === 'alert'),
  };
}

test('form blocks two rapid Save taps before rerender, displays pending state and navigates only on success', async () => {
  const pending = deferred();
  const form = formHarness({ write: () => pending.promise });
  form.input('Valor da transação', '25,50'); form.input('Categoria da transação', 'Mercado');
  const first = form.submit(); const second = form.submit();
  assert.equal(form.calls.length, 1);
  form.render();
  assert.equal(form.element('Concluir transação').props.disabled, true);
  assert.equal(form.navigations(), 0);
  pending.resolve(); await Promise.all([first, second]);
  assert.equal(form.navigations(), 1);
  assert.equal(form.calls[0][0].amount, 25.5);
});

test('create/edit/upload failures retain every field and selected receipt, show error, unlock Save and allow retry', async () => {
  for (const options of [{}, { id: 'tx' }, { upload: true }]) {
    const failure = options.upload ? new ReceiptUploadError(new Error('upload')) : new Error('save failed');
    const form = formHarness({ ...options, write: async () => { throw failure; } });
    form.input('Valor da transação', '123,45'); form.input('Categoria da transação', 'Categoria'); form.input('Descrição da transação', 'Preservar');
    form.element('Selecionar entrada').props.onPress(); form.render();
    await form.element('Selecionar comprovante').props.onPress(); form.render();
    await form.submit(); form.render();
    assert.equal(form.navigations(), 0);
    assert.ok(form.alert());
    assert.equal(form.element('Valor da transação').props.value, '123,45');
    assert.equal(form.element('Categoria da transação').props.value, 'Categoria');
    assert.equal(form.element('Descrição da transação').props.value, 'Preservar');
    assert.equal(form.calls[0][1].uri, file.uri);
    assert.equal(form.calls[0][0].type, 'income');
    assert.equal(form.element(options.id ? 'Salvar alterações da transação' : 'Concluir transação').props.disabled, false);
    form.setWrite(async () => {}); await form.submit();
    assert.equal(form.navigations(), 1);
    assert.equal(form.calls[1][1].uri, file.uri);
    assert.equal(form.calls[1][0].date, form.calls[0][0].date);
    assert.equal(form.calls[1][0].type, 'income');
    if (options.id) assert.equal(form.calls[1][0].receiptUrl, 'existing-receipt');
  }
});

test('form rejects invalid monetary strings and does not navigate after unmount during save', async () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', '0', '-1', '']) {
    const form = formHarness();
    form.input('Categoria da transação', 'Categoria'); form.input('Valor da transação', value);
    await form.submit(); assert.equal(form.calls.length, 0);
  }
  const pending = deferred();
  const form = formHarness({ id: 'tx', write: () => pending.promise });
  const request = form.submit(); form.unmount(); pending.resolve(); await request;
  assert.equal(form.navigations(), 0);
});

function deleteScreenHarness() {
  const hooks = hooksHarness();
  const alerts = [];
  const calls = [];
  const pending = deferred();
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'Text', 'TextInput', 'View'].map((name) => [name, name]));
  Object.assign(native, { StyleSheet: { create: (styles) => styles }, Keyboard: { dismiss: () => {} }, Alert: { alert: (...args) => alerts.push(args) } });
  const { default: Screen } = load('app/transactions.tsx', {
    react: hooks.react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    '@react-native-community/datetimepicker': { __esModule: true, default: 'Picker' },
    'expo-router': { router: { push: () => {} }, useFocusEffect: () => {} },
    '../constants/formatters': { formatDate: String, formatCurrency: String },
    '../constants/pressableFeedback': { getPressedFeedbackStyle: () => ({}) },
    '../contexts/TransactionsContext': { useTransactions: () => ({
      paginatedTransactions: [{ ...input, id: 'tx' }], transactionsCount: 1,
      deleteTransaction: (id) => { calls.push(id); return pending.promise; },
    }) },
  });
  let row;
  function render() {
    hooks.reset();
    const tree = Screen();
    const list = find(tree, (item) => item.type === 'FlatList');
    row = list.props.renderItem({ item: { ...input, id: 'tx' } });
  }
  render();
  return { alerts, calls, pending, render, button: () => byLabel(row, 'Excluir transação Salário') };
}

test('delete UI blocks repeated prompts/confirmations synchronously and displays failure without removing the row', async () => {
  const screen = deleteScreenHarness();
  screen.button().props.onPress(); screen.button().props.onPress();
  assert.equal(screen.alerts.length, 1);
  const confirm = screen.alerts[0][2].find((button) => button.text === 'Excluir').onPress;
  const first = confirm(); const second = confirm();
  assert.deepEqual(screen.calls, ['tx']);
  screen.render();
  assert.equal(screen.button().props.disabled, true);
  screen.pending.reject(new Error('offline'));
  await Promise.all([first, second]); screen.render();
  assert.equal(screen.alerts[1][0], 'Não foi possível excluir');
  assert.equal(screen.button().props.disabled, false);
  screen.button().props.onPress();
  assert.equal(screen.alerts.length, 3);
});

test('canceling or dismissing delete confirmation releases the prompt lock without executing a delete', () => {
  const screen = deleteScreenHarness();
  screen.button().props.onPress();
  screen.alerts[0][2].find((button) => button.text === 'Cancelar').onPress();
  screen.button().props.onPress();
  screen.alerts[1][3].onDismiss();
  screen.button().props.onPress();
  assert.equal(screen.alerts.length, 3);
  assert.equal(screen.calls.length, 0);
});

test('mutation application/domain contracts remain independent of React/Firebase and the form has no Storage infrastructure', () => {
  for (const file of [
    'src/domain/entities/Transaction.ts', 'src/domain/repositories/ReceiptRepository.ts',
    'src/domain/errors/TransactionWriteRejected.ts', 'src/application/use-cases/CreateTransaction.ts',
    'src/application/use-cases/UpdateTransaction.ts', 'src/application/use-cases/SaveTransactionWithReceipt.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /from\s+["'](?:firebase|react|expo|.*infrastructure)/);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app/transaction-form.tsx'), 'utf8'), /firebase\/storage|\buploadBytes\b|\bfetch\(/);
});

test('receipt viewer is visible only in edit mode with a saved receipt URL', () => {
  for (const options of [{}, { id: 'tx', transaction: { ...input, receiptUrl: null } }, { id: 'tx', transaction: { ...input, receiptUrl: '' } }, { id: 'tx', transaction: { ...input, receiptUrl: undefined } }]) {
    const form = formHarness(options);
    assert.equal(form.find((item) => item.props?.accessibilityLabel === 'Abrir comprovante atual'), null);
  }
  assert.ok(formHarness({ id: 'tx' }).element('Abrir comprovante atual'));
});

test('image and PDF URLs open unchanged in WebBrowser without saving or navigating', async () => {
  for (const url of ['https://example.invalid/receipt.jpg?token=FAKE', 'https://example.invalid/receipt.pdf?token=FAKE']) {
    const form = formHarness({ id: 'tx', transaction: { ...input, receiptUrl: url } });
    await form.element('Abrir comprovante atual').props.onPress(); form.render();
    assert.deepEqual(form.browserCalls, [url]);
    assert.equal(form.calls.length, 0);
    assert.equal(form.navigations(), 0);
    assert.equal(form.alert(), null);
  }
});

test('rapid open taps are blocked before rerender and the button unlocks on browser dismissal', async () => {
  const pending = deferred();
  const form = formHarness({ id: 'tx', openBrowser: () => pending.promise });
  const button = form.element('Abrir comprovante atual');
  const first = button.props.onPress(); const second = button.props.onPress();
  assert.equal(form.browserCalls.length, 1);
  form.render();
  assert.equal(form.element('Abrir comprovante atual').props.disabled, true);
  assert.equal(form.element('Abrir comprovante atual').props.accessibilityState.busy, true);
  pending.resolve({ type: 'dismiss' }); await Promise.all([first, second]); form.render();
  assert.equal(form.element('Abrir comprovante atual').props.disabled, false);
  assert.equal(form.calls.length, 0);
  assert.equal(form.alert(), null);
});

test('new unsaved receipt is distinguished from the saved attachment and viewing keeps form edits intact', async () => {
  const form = formHarness({ id: 'tx' });
  form.input('Valor da transação', '123,45');
  form.input('Categoria da transação', 'Alterada');
  form.input('Descrição da transação', 'Ainda não salvo');
  await form.element('Selecionar comprovante').props.onPress(); form.render();
  const selected = form.find((item) => item.type === 'Text' && Array.isArray(item.props.children) && item.props.children[0] === 'Novo arquivo selecionado (ainda não salvo): ');
  assert.ok(selected);
  assert.equal(selected.props.children[1], 'receipt.pdf');
  await form.element('Abrir comprovante atual').props.onPress(); form.render();
  assert.deepEqual(form.browserCalls, ['existing-receipt']);
  assert.equal(form.calls.length, 0);
  assert.equal(form.element('Valor da transação').props.value, '123,45');
  assert.equal(form.element('Categoria da transação').props.value, 'Alterada');
  assert.equal(form.element('Descrição da transação').props.value, 'Ainda não salvo');
  await form.submit();
  assert.equal(form.calls[0][0].receiptUrl, 'existing-receipt');
  assert.equal(form.calls[0][1].uri, file.uri);
});

test('browser failures show a sanitized friendly error, unlock retry and never expose URLs/tokens or write data', async () => {
  const url = 'https://example.invalid/file?token=FAKE-private';
  const form = formHarness({ id: 'tx', transaction: { ...input, receiptUrl: url }, openBrowser: async () => { throw new Error(`Native failure: ${url}`); } });
  await form.element('Abrir comprovante atual').props.onPress(); form.render();
  assert.equal(form.alert().props.children, 'Não foi possível abrir o comprovante. Tente novamente.');
  assert.doesNotMatch(form.alert().props.children, /token|FAKE|Native failure/);
  assert.equal(form.element('Abrir comprovante atual').props.disabled, false);
  assert.equal(form.calls.length, 0);
  assert.equal(form.navigations(), 0);
  form.setBrowser(async () => ({ type: 'cancel' }));
  await form.element('Abrir comprovante atual').props.onPress(); form.render();
  assert.equal(form.browserCalls.length, 2);
  assert.equal(form.alert(), null);
});

test('opening is blocked during a pending save and browser failure after unmount is ignored', async () => {
  const pendingSave = deferred();
  const saving = formHarness({ id: 'tx', write: () => pendingSave.promise });
  const open = saving.element('Abrir comprovante atual').props.onPress;
  const request = saving.submit(); await open(); saving.render();
  assert.equal(saving.browserCalls.length, 0);
  assert.equal(saving.element('Abrir comprovante atual').props.disabled, true);
  pendingSave.resolve(); await request;
  const pendingBrowser = deferred();
  const opening = formHarness({ id: 'tx', openBrowser: () => pendingBrowser.promise });
  const openingRequest = opening.element('Abrir comprovante atual').props.onPress();
  opening.unmount(); pendingBrowser.reject(new Error('native failure'));
  await openingRequest; opening.render();
  assert.equal(opening.alert(), null);
  assert.equal(opening.calls.length, 0);
});

test('PDF, JPEG and PNG picker MIME types are explicitly uploaded with inline disposition', async () => {
  for (const mimeType of ['application/pdf', 'image/jpeg', 'image/png']) {
    const { repository, calls } = receiptRepository({ blobType: 'application/octet-stream' });
    await repository.upload('a', { ...file, name: 'no-extension', mimeType });
    assert.equal(calls.metadata[0].contentType, mimeType);
    assert.equal(calls.metadata[0].contentDisposition, 'inline');
  }
});

test('known extensions identify PDFs and images when picker/blob MIME types are missing or generic', async () => {
  for (const [name, expected] of [['receipt.PDF', 'application/pdf'], ['photo.JPG', 'image/jpeg'], ['photo.jpeg', 'image/jpeg'], ['image.PNG', 'image/png']]) {
    for (const mimeType of [undefined, 'application/octet-stream', 'image/*', 'invalid-mime']) {
      const { repository, calls } = receiptRepository();
      await repository.upload('a', { ...file, name, mimeType });
      assert.equal(calls.metadata[0].contentType, expected);
      assert.equal(calls.metadata[0].contentDisposition, 'inline');
    }
  }
  const { repository, calls } = receiptRepository();
  await repository.upload('a', { uri: 'file:///cache/photo.PNG' });
  assert.equal(calls.metadata[0].contentType, 'image/png');
});

test('specific Blob MIME is used when picker metadata and filename cannot identify the format', async () => {
  for (const blobType of ['application/pdf', 'image/jpeg', 'image/png']) {
    const { repository, calls } = receiptRepository({ blobType });
    await repository.upload('a', { uri: 'file:///cache/opaque-id', name: 'unknown.bin', mimeType: 'application/octet-stream' });
    assert.equal(calls.metadata[0].contentType, blobType);
    assert.equal(calls.metadata[0].contentDisposition, 'inline');
  }
});

test('unknown files keep generic metadata instead of being mislabeled as PDF or image', async () => {
  for (const type of [undefined, '', 'application/octet-stream', 'binary/octet-stream', 'application/unknown', 'unknown/unknown', 'image/*', 'malformed', 'image/png\r\nInjected: value']) {
    const { repository, calls } = receiptRepository({ blobType: type });
    await repository.upload('a', { uri: 'file:///opaque-id', name: 'unknown.bin', mimeType: type });
    assert.equal(calls.metadata[0].contentType, 'application/octet-stream');
    assert.equal(calls.metadata[0].contentDisposition, 'inline');
  }
});

test('names without a known extension do not invent a format or read inherited object properties', async () => {
  for (const name of ['pdf', 'png', 'unknown.constructor', 'unknown.__proto__']) {
    const { repository, calls } = receiptRepository();
    await repository.upload('a', { uri: 'file:///opaque-id', name });
    assert.equal(calls.metadata[0].contentType, 'application/octet-stream');
  }
});

test('specific picker MIME takes priority, is normalized and does not depend on the remote random path extension', async () => {
  const { repository, calls } = receiptRepository({ blobType: 'image/png' });
  await repository.upload('a', { ...file, name: 'conflicting.png', mimeType: ' Application/PDF; charset=binary ' });
  assert.equal(calls.metadata[0].contentType, 'application/pdf');
  assert.equal(calls.upload[0], 'users/a/receipts/unique-1');
});

test('existing files are never updated by upload and specific unknown MIME types are preserved as reported', async () => {
  const { repository, calls } = receiptRepository({ blobType: 'application/x-custom' });
  await repository.upload('a', { uri: 'file:///opaque-id', name: 'unknown.bin' });
  assert.equal(calls.metadata[0].contentType, 'application/x-custom');
  // No updateMetadata mock exists: any attempt to modify old objects fails.
  assert.equal(calls.remove.length, 0);
});

test('the form passes the picker filename and MIME through the existing save flow', async () => {
  const form = formHarness({ id: 'tx' });
  await form.element('Selecionar comprovante').props.onPress(); form.render();
  await form.submit();
  assert.equal(form.calls[0][1].name, 'receipt.pdf');
  assert.equal(form.calls[0][1].mimeType, 'application/pdf');
});
