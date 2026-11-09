import { useMemo, useSyncExternalStore } from "react";
import type { GetTransactionsPage } from "../src/application/use-cases/GetTransactionsPage";
import type { Transaction } from "../src/domain/entities/Transaction";
import type { TransactionCursor, TransactionPage } from "../src/domain/entities/TransactionPage";
import type { TransactionSearchFilters } from "../src/domain/entities/TransactionFilters";
import type { GetTransactionsCount } from "../src/application/use-cases/GetTransactionsCount";

type PaginationState = {
  paginatedTransactions: Transaction[];
  isInitialPageLoading: boolean;
  isNextPageLoading: boolean;
  paginationError: string | null;
  hasMore: boolean;
  searchLimitReached: boolean;
  transactionsCount: number | null;
  isTransactionsCountLoading: boolean;
  transactionsCountError: string | null;
  firstPageSource: "cache" | "network" | null;
};

type FirstPageCache = {
  key: string;
  page: TransactionPage;
  count: number | null;
  expiresAt: number;
};

type PaginationOptions = { firstPageCacheTtlMs?: number; now?: () => number };

function emptyState(): PaginationState {
  return {
    paginatedTransactions: [],
    isInitialPageLoading: false,
    isNextPageLoading: false,
    paginationError: null,
    hasMore: false,
    searchLimitReached: false,
    transactionsCount: null,
    isTransactionsCountLoading: false,
    transactionsCountError: null,
    firstPageSource: null,
  };
}

// Presentation state owned by one UID; cursors never escape this session.
export function createTransactionsPaginationStore(
  userId: string | null,
  getPage: GetTransactionsPage["execute"],
  getCount?: GetTransactionsCount["execute"],
  options: PaginationOptions = {}
) {
  const ttl = options.firstPageCacheTtlMs ?? 30_000;
  const now = options.now ?? Date.now;
  if (!Number.isSafeInteger(ttl) || ttl < 0) throw new Error("TTL de cache inválido.");
  let state = emptyState();
  let cursor: TransactionCursor | null = null;
  let initialized = false;
  let started = false;
  let generation = 0;
  let inFlight: Promise<void> | null = null;
  let countInFlight: Promise<void> | null = null;
  let activeFilters: TransactionSearchFilters | undefined;
  let firstPageCache: FirstPageCache | null = null;
  let firstPageOperation: { key: string; promise: Promise<void> } | null = null;
  const listeners = new Set<() => void>();

  const cacheKey = (filters?: TransactionSearchFilters) => JSON.stringify([userId, filtersKey(filters)]);

  function publish(next: PaginationState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function resetPagination() {
    generation += 1;
    inFlight = null;
    countInFlight = null;
    firstPageOperation = null;
    activeFilters = undefined;
    cursor = null;
    initialized = false;
    started = false;
    publish(emptyState());
  }

  function refreshTransactionsCount(): Promise<void> {
    // count() cannot implement substring matching; the total becomes known only
    // after this category scan exhausts its candidates, never from candidate count.
    if (activeFilters?.category?.trim()) return Promise.resolve();
    if (!userId || !getCount) return Promise.resolve();
    if (countInFlight) return countInFlight;
    const readCount = getCount;
    const requestGeneration = generation;
    const filters = activeFilters;
    const isCurrent = () => requestGeneration === generation && listeners.size > 0;
    const request = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      try {
        const total = await readCount(userId, filters);
        if (isCurrent()) {
          if (firstPageCache?.key === cacheKey(filters)) firstPageCache.count = total;
          publish({ ...state, transactionsCount: total, transactionsCountError: null });
        }
      } catch {
        if (isCurrent()) publish({
          ...state, transactionsCount: null,
          transactionsCountError: "Não foi possível atualizar a contagem de transações.",
        });
      }
    }).finally(() => {
      if (countInFlight === request) {
        countInFlight = null;
        publish({ ...state, isTransactionsCountLoading: false });
      }
    });
    countInFlight = request;
    publish({ ...state, isTransactionsCountLoading: true, transactionsCountError: null });
    return request;
  }

  function load(first: boolean, filters?: TransactionSearchFilters): Promise<void> {
    if (!userId) return Promise.resolve();
    const sameFilters = filtersKey(filters) === filtersKey(activeFilters);
    const key = cacheKey(filters);
    const cacheable = isUnfiltered(filters);
    if (cacheable && firstPageOperation?.key === key && (first || !initialized)) return firstPageOperation.promise;
    if (first && cacheable && firstPageCache?.key === key) {
      const cached = firstPageCache;
      if (now() < cached.expiresAt) {
        resetPagination();
        activeFilters = filters;
        cursor = cached.page.nextCursor;
        initialized = true;
        started = true;
        publish({
          ...emptyState(),
          paginatedTransactions: [...cached.page.transactions],
          hasMore: cached.page.hasMore,
          transactionsCount: cached.count,
          firstPageSource: "cache",
        });
        return Promise.resolve();
      }
      firstPageCache = null;
    }
    if (inFlight && sameFilters) return inFlight;
    if (!first && initialized && !state.hasMore) return Promise.resolve();
    if (first || !sameFilters) {
      resetPagination();
      activeFilters = filters === undefined ? undefined : {
        ...filters,
        startDate: filters.startDate && new Date(filters.startDate.getTime()),
        endDate: filters.endDate && new Date(filters.endDate.getTime()),
      };
    }

    started = true;
    const requestGeneration = generation;
    const requestCursor = first ? null : cursor;
    const isCurrent = () => generation === requestGeneration && listeners.size > 0;
    let completedFirstPage: TransactionPage | null = null;
    // Child focus effects may run before the Provider subscribes. Defer the
    // active-session check until after the effect flush, and coalesce requests.
    const request = Promise.resolve().then(async () => {
      if (!isCurrent()) {
        if (generation === requestGeneration) {
          inFlight = null;
          publish({ ...state, isInitialPageLoading: false, isNextPageLoading: false });
        }
        return;
      }
      try {
        const page = await (activeFilters?.category?.trim()
          ? getPage(userId, 10, requestCursor, activeFilters, isCurrent)
          : activeFilters === undefined
          ? getPage(userId, 10, requestCursor)
          : getPage(userId, 10, requestCursor, activeFilters));
        if (!isCurrent()) return;
        const transactions = new Map(state.paginatedTransactions.map((item) => [item.id, item]));
        page.transactions.forEach((item) => transactions.set(item.id, item));
        if (first) completedFirstPage = { ...page, transactions: Array.from(transactions.values()) };
        cursor = page.nextCursor;
        initialized = true;
        inFlight = null;
        publish({
          ...state,
          paginatedTransactions: Array.from(transactions.values()),
          isInitialPageLoading: false,
          isNextPageLoading: false,
          paginationError: null,
          hasMore: page.hasMore,
          searchLimitReached: Boolean(page.searchLimitReached),
          transactionsCount: activeFilters?.category?.trim()
            ? page.hasMore ? null : transactions.size
            : state.transactionsCount,
          firstPageSource: first ? "network" : state.firstPageSource,
        });
      } catch {
        if (!isCurrent()) return;
        inFlight = null;
        publish({
          ...state,
          isInitialPageLoading: false,
          isNextPageLoading: false,
          paginationError: "Não foi possível carregar as transações. Tente novamente.",
        });
      }
    });
    inFlight = request;
    publish({
      ...state,
      isInitialPageLoading: first,
      isNextPageLoading: !first,
      paginationError: null,
    });
    const countRequest = first ? refreshTransactionsCount() : Promise.resolve();
    if (first && cacheable) {
      // Wait for page and count before caching. Opening during preloading shares
      // this whole operation, including the gap after the page precedes count.
      const operation = {
        key,
        promise: Promise.all([request, countRequest]).then(() => {
          if (isCurrent() && completedFirstPage && !state.paginationError && !state.transactionsCountError && ttl > 0) {
            firstPageCache = { key, page: completedFirstPage, count: state.transactionsCount, expiresAt: now() + ttl };
          }
        }).finally(() => {
          if (firstPageOperation === operation) firstPageOperation = null;
        }),
      };
      firstPageOperation = operation;
      return operation.promise;
    }
    return first && getCount ? Promise.all([request, countRequest]).then(() => {}) : request;
  }

  function loadFirstPage(filters?: TransactionSearchFilters): Promise<void> {
    return load(true, filters);
  }

  function loadNextPage(): Promise<void> {
    return load(!initialized, activeFilters);
  }

  function invalidatePagination(): Promise<void> {
    firstPageCache = null;
    const shouldReload = started;
    const filters = activeFilters;
    resetPagination();
    return shouldReload ? loadFirstPage(filters) : Promise.resolve();
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          firstPageCache = null;
          resetPagination();
        }
      };
    },
    loadFirstPage,
    loadNextPage,
    resetPagination,
    invalidatePagination,
    refreshTransactionsCount,
    preloadFirstPage: () => loadFirstPage(),
  };
}

function isUnfiltered(filters?: TransactionSearchFilters): boolean {
  return !filters?.category?.trim() && filters?.minAmount === undefined && filters?.maxAmount === undefined &&
    filters?.startDate === undefined && filters?.endDate === undefined;
}

function filtersKey(filters: TransactionSearchFilters | undefined): string {
  return JSON.stringify([
    filters?.minAmount === undefined ? null : String(filters.minAmount),
    filters?.maxAmount === undefined ? null : String(filters.maxAmount),
    filters?.startDate?.getTime() ?? null, filters?.endDate?.getTime() ?? null,
    filters?.category?.trim().toLowerCase() ?? "",
  ]);
}

export function useTransactionsPagination(userId: string | null, useCase: GetTransactionsPage, countUseCase: GetTransactionsCount) {
  const store = useMemo(
    () => createTransactionsPaginationStore(userId,
      (uid, size, cursor, filters, canContinue) => useCase.execute(uid, size, cursor, filters, canContinue),
      (uid, filters) => countUseCase.execute(uid, filters)),
    [userId, useCase, countUseCase]
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return {
    ...state,
    loadFirstPage: store.loadFirstPage,
    loadNextPage: store.loadNextPage,
    resetPagination: store.resetPagination,
    invalidatePagination: store.invalidatePagination,
    refreshTransactionsCount: store.refreshTransactionsCount,
    preloadFirstPage: store.preloadFirstPage,
  };
}
