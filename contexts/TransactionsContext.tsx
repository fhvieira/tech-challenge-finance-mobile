import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Transaction, TransactionInput } from "../src/domain/entities/Transaction";
import type { CreateTransaction } from "../src/application/use-cases/CreateTransaction";
import type { DeleteTransaction } from "../src/application/use-cases/DeleteTransaction";
import type { GetTransactionById } from "../src/application/use-cases/GetTransactionById";
import type { GetFinancialSummary } from "../src/application/use-cases/GetFinancialSummary";
import type { FinancialSummary } from "../src/domain/entities/FinancialSummary";
import { useFinancialSummary } from "../hooks/use-financial-summary";
import type { ObserveTransactions } from "../src/application/use-cases/ObserveTransactions";
import type { UpdateTransaction } from "../src/application/use-cases/UpdateTransaction";
import { useAuth } from "./AuthContext";

type TransactionUseCases = {
  create: CreateTransaction;
  update: UpdateTransaction;
  delete: DeleteTransaction;
  observe: ObserveTransactions;
  getById: GetTransactionById;
  getFinancialSummary: GetFinancialSummary;
};

type TransactionsContextType = {
  financialSummary: FinancialSummary | null;
  isFinancialSummaryLoading: boolean;
  financialSummaryError: string | null;
  isFinancialSummaryStale: boolean;
  refreshFinancialSummary: () => Promise<void>;
  transactions: Transaction[];
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
  financialSummary: null,
  isFinancialSummaryLoading: false,
  financialSummaryError: null,
  isFinancialSummaryStale: false,
  refreshFinancialSummary: async () => {},
  transactions: [],
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
  const {
    invalidateFinancialSummary,
    ...summaryState
  } = useFinancialSummary(userId, useCases.getFinancialSummary);
  const [transactionState, setTransactionState] = useState<{
    userId: string | null;
    transactions: Transaction[];
  }>({ userId, transactions: [] });

  // Reset before children render for another UID, including logout.
  if (transactionState.userId !== userId) {
    setTransactionState({ userId, transactions: [] });
  }

  const transactions = transactionState.userId === userId
    ? transactionState.transactions
    : [];

  const getTransactionById = useCallback((id: string): Promise<Transaction | null> => {
    if (!userId) return Promise.resolve(null);

    return useCases.getById.execute(userId, id);
  }, [userId, useCases]);

  async function addTransaction(
    transaction: TransactionInput
  ) {
    if (!user) return;

    await useCases.create.execute(user.uid, transaction);
    void invalidateFinancialSummary();
  }

  async function deleteTransaction(id: string) {
    if (!user) return;

    await useCases.delete.execute(user.uid, id);
    void invalidateFinancialSummary();
  }

  async function updateTransaction(
    id: string,
    transaction: TransactionInput
  ) {
    if (!user) return;

    await useCases.update.execute(user.uid, id, transaction);
    void invalidateFinancialSummary();
  }

  useEffect(() => {
    if (!userId) return;

    let active = true;
    const unsubscribe = useCases.observe.execute(userId, (transactions) => {
      if (!active) return;

      setTransactionState((current) => current.userId === userId
        ? { userId, transactions }
        : current);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId, useCases]);

  return (
    <TransactionsContext.Provider
      value={{
        ...summaryState,
        transactions,
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
