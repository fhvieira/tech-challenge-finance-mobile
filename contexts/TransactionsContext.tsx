import type { ReceiptFile } from "../src/domain/repositories/ReceiptRepository";
import type { SaveTransactionWithReceipt } from "../src/application/use-cases/SaveTransactionWithReceipt";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
} from "react";
import type { Transaction, TransactionInput } from "../src/domain/entities/Transaction";
import type { CreateTransaction } from "../src/application/use-cases/CreateTransaction";
import type { DeleteTransaction } from "../src/application/use-cases/DeleteTransaction";
import type { GetTransactionById } from "../src/application/use-cases/GetTransactionById";
import type { GetFinancialSummary } from "../src/application/use-cases/GetFinancialSummary";
import type { FinancialSummary } from "../src/domain/entities/FinancialSummary";
import { useFinancialSummary } from "../hooks/use-financial-summary";
import { useTransactionsPagination } from "../hooks/use-transactions-pagination";
import type { GetTransactionsPage } from "../src/application/use-cases/GetTransactionsPage";
import type { GetTransactionsCount } from "../src/application/use-cases/GetTransactionsCount";
import type { TransactionSearchFilters } from "../src/domain/entities/TransactionFilters";
import type { UpdateTransaction } from "../src/application/use-cases/UpdateTransaction";
import { useAuth } from "./AuthContext";

type TransactionUseCases = {
  saveWithReceipt: SaveTransactionWithReceipt;
  create: CreateTransaction;
  update: UpdateTransaction;
  delete: DeleteTransaction;
  getById: GetTransactionById;
  getFinancialSummary: GetFinancialSummary;
  getPage: GetTransactionsPage;
  getCount: GetTransactionsCount;
};

type TransactionsContextType = {
  paginatedTransactions: Transaction[];
  isInitialPageLoading: boolean;
  isNextPageLoading: boolean;
  paginationError: string | null;
  hasMore: boolean;
  loadFirstPage: (filters?: TransactionSearchFilters) => Promise<void>;
  loadNextPage: () => Promise<void>;
  resetPagination: () => void;
  searchLimitReached: boolean;
  transactionsCount: number | null;
  isTransactionsCountLoading: boolean;
  transactionsCountError: string | null;
  refreshTransactionsCount: () => Promise<void>;
  preloadFirstPage: () => Promise<void>;
  firstPageSource: "cache" | "network" | null;
  financialSummary: FinancialSummary | null;
  isFinancialSummaryLoading: boolean;
  financialSummaryError: string | null;
  isFinancialSummaryStale: boolean;
  refreshFinancialSummary: () => Promise<void>;
  getTransactionById: (id: string) => Promise<Transaction | null>;
  saveTransaction: (transaction: TransactionInput, receipt?: ReceiptFile | null, id?: string) => Promise<void>;
  addTransaction: (
    transaction: TransactionInput
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (
    id: string,
    transaction: TransactionInput
  ) => Promise<void>;
};

const TransactionsContext = createContext<TransactionsContextType>({
  paginatedTransactions: [],
  isInitialPageLoading: false,
  isNextPageLoading: false,
  paginationError: null,
  hasMore: false,
  loadFirstPage: async () => {},
  loadNextPage: async () => {},
  resetPagination: () => {},
  searchLimitReached: false,
  transactionsCount: null,
  isTransactionsCountLoading: false,
  transactionsCountError: null,
  refreshTransactionsCount: async () => {},
  preloadFirstPage: async () => {},
  firstPageSource: null,
  financialSummary: null,
  isFinancialSummaryLoading: false,
  financialSummaryError: null,
  isFinancialSummaryStale: false,
  refreshFinancialSummary: async () => {},
  getTransactionById: async () => null,
  saveTransaction: async () => { throw new Error("Entre na sua conta para salvar a transação."); },
  addTransaction: async () => { throw new Error("Entre na sua conta para salvar a transação."); },
  deleteTransaction: async () => { throw new Error("Entre na sua conta para excluir a transação."); },
  updateTransaction: async () => { throw new Error("Entre na sua conta para salvar a transação."); },
});

export function TransactionsProvider({
  children,
  useCases,
}: {
  children: ReactNode;
  useCases: TransactionUseCases;
}) {
  const { user } = useAuth();
  const userId = user?.uid ?? null;
  const writes = useRef(new Map<string, Promise<void>>());
  const { invalidatePagination, ...paginationState } = useTransactionsPagination(userId, useCases.getPage, useCases.getCount);
  const {
    invalidateFinancialSummary,
    ...summaryState
  } = useFinancialSummary(userId, useCases.getFinancialSummary);

  const getTransactionById = useCallback((id: string): Promise<Transaction | null> => {
    if (!userId) return Promise.resolve(null);

    return useCases.getById.execute(userId, id);
  }, [userId, useCases]);

  function runWrite(key: string, write: (uid: string) => Promise<void>): Promise<void> {
    if (!userId) return Promise.reject(new Error("Entre na sua conta para alterar transações."));
    const operationKey = JSON.stringify([userId, key]);
    const pending = writes.current.get(operationKey);
    if (pending) return pending;
    const request = Promise.resolve().then(() => write(userId)).then(() => {
      // Refresh failures must never turn a confirmed write into a save error.
      void Promise.resolve().then(invalidatePagination).catch(() => {});
      void Promise.resolve().then(invalidateFinancialSummary).catch(() => {});
    }).finally(() => {
      if (writes.current.get(operationKey) === request) writes.current.delete(operationKey);
    });
    writes.current.set(operationKey, request);
    return request;
  }

  function addTransaction(transaction: TransactionInput) {
    return runWrite("create", (uid) => useCases.create.execute(uid, transaction));
  }

  function updateTransaction(id: string, transaction: TransactionInput) {
    return runWrite(`update:${id}`, (uid) => useCases.update.execute(uid, id, transaction));
  }

  function deleteTransaction(id: string) {
    return runWrite(`delete:${id}`, (uid) => useCases.delete.execute(uid, id));
  }

  function saveTransaction(transaction: TransactionInput, receipt?: ReceiptFile | null, id?: string) {
    return runWrite(id ? `update:${id}` : "create", (uid) =>
      useCases.saveWithReceipt.execute(uid, transaction, receipt, id));
  }

  return (
    <TransactionsContext.Provider
      value={{
        ...paginationState,
        ...summaryState,
        getTransactionById,
        saveTransaction,
        addTransaction,
        deleteTransaction,
        updateTransaction,
      }}
    >
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions() {
  return useContext(TransactionsContext);
}
