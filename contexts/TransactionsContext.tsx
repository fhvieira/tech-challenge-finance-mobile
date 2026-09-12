import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { db } from "../firebaseConfig";
import { useAuth } from "./AuthContext";

type TransactionInput = {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: Timestamp;
  receiptUrl?: string | null;
};

type Transaction = TransactionInput & {
  id: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

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
}: {
  children: ReactNode;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { user } = useAuth();

  async function addTransaction(
    transaction: TransactionInput
  ) {
    if (!user) return;

    await addDoc(
      collection(
        db,
        "users",
        user.uid,
        "transactions"
      ),
      {
        ...transaction,
        createdAt: serverTimestamp(),
      }
    );
  }

  async function deleteTransaction(id: string) {
    if (!user) return;

    await deleteDoc(
      doc(
        db,
        "users",
        user.uid,
        "transactions",
        id
      )
    );
  }

  async function updateTransaction(
    id: string,
    transaction: TransactionInput
  ) {
    if (!user) return;

    await updateDoc(
      doc(
        db,
        "users",
        user.uid,
        "transactions",
        id
      ),
      {
        ...transaction,
        updatedAt: serverTimestamp(),
      }
    );
  }

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const transactionsRef = collection(
      db,
      "users",
      user.uid,
      "transactions"
    );

    const transactionsQuery = query(
      transactionsRef,
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      transactionsQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Transaction[];

        setTransactions(data);
      }
    );

    return unsubscribe;
  }, [user]);

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