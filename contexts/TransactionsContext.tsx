import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
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
  addTransaction: async () => {},
  deleteTransaction: async () => {},
  updateTransaction: async () => {},
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
  const { invalidatePagination, ...paginationState } = useTransactionsPagination(userId, useCases.getPage, useCases.getCount);
  const {
    invalidateFinancialSummary,
    ...summaryState
  } = useFinancialSummary(userId, useCases.getFinancialSummary);

  const getTransactionById = useCallback((id: string): Promise<Transaction | null> => {
    if (!userId) return Promise.resolve(null);

    return useCases.getById.execute(userId, id);
  }, [userId, useCases]);

  async function addTransaction(
    transaction: TransactionInput
  ) {
    if (!user) return;

    await useCases.create.execute(user.uid, transaction);
    void invalidatePagination();
    void invalidateFinancialSummary();
  }

  async function deleteTransaction(id: string) {
    if (!user) return;

    await useCases.delete.execute(user.uid, id);
    void invalidatePagination();
    void invalidateFinancialSummary();
  }

  async function updateTransaction(
    id: string,
    transaction: TransactionInput
  ) {
    if (!user) return;

    await useCases.update.execute(user.uid, id, transaction);
    void invalidatePagination();
    void invalidateFinancialSummary();
  }

  return (
    <TransactionsContext.Provider
      value={{
        ...paginationState,
        ...summaryState,
        getTransactionById,
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
