import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Transaction, TransactionInput } from "../src/domain/entities/Transaction";
import type { TransactionRepository } from "../src/domain/repositories/TransactionRepository";
import { useAuth } from "./AuthContext";

type TransactionsContextType = {
  transactions: Transaction[];
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
  transactions: [],
  addTransaction: async () => {},
  deleteTransaction: async () => {},
  updateTransaction: async () => {},
});

export function TransactionsProvider({
  children,
  repository,
}: {
  children: ReactNode;
  repository: TransactionRepository;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { user } = useAuth();

  async function addTransaction(
    transaction: TransactionInput
  ) {
    if (!user) return;

    await repository.create(user.uid, transaction);
  }

  async function deleteTransaction(id: string) {
    if (!user) return;

    await repository.delete(user.uid, id);
  }

  async function updateTransaction(
    id: string,
    transaction: TransactionInput
  ) {
    if (!user) return;

    await repository.update(user.uid, id, transaction);
  }

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    return repository.subscribe(user.uid, setTransactions);
  }, [user, repository]);

  return (
    <TransactionsContext.Provider
      value={{
        transactions,
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
