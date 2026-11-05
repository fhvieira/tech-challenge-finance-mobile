import {
  addDoc,
  collection,
  count,
  deleteDoc,
  doc,
  getDoc,
  getAggregateFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  sum,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { DocumentData, Firestore } from "firebase/firestore";
import type { Transaction, TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";
import type { FinancialSummary } from "../../domain/entities/FinancialSummary";

export class FirebaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Firestore) {}

  async getFinancialSummary(userId: string): Promise<FinancialSummary> {
    // Keep the same document-existence constraint as the reactive list.
    const baseQuery = query(
      collection(this.db, "users", userId, "transactions"),
      orderBy("createdAt", "desc")
    );
    const [total, income, expense] = await Promise.all([
      getAggregateFromServer(baseQuery, { transactionCount: count() }),
      getAggregateFromServer(query(baseQuery, where("type", "==", "income")), {
        totalIncome: sum("amount"),
      }),
      getAggregateFromServer(query(baseQuery, where("type", "==", "expense")), {
        totalExpense: sum("amount"),
      }),
    ]);

    return {
      transactionCount: total.data().transactionCount,
      totalIncome: income.data().totalIncome,
      totalExpense: expense.data().totalExpense,
    };
  }

  async getById(userId: string, id: string): Promise<Transaction | null> {
    const snapshot = await getDoc(doc(this.db, "users", userId, "transactions", id));

    return snapshot.exists() ? toTransaction(snapshot.id, snapshot.data()) : null;
  }

  subscribe(
    userId: string,
    onTransactionsChange: (transactions: Transaction[]) => void
  ): () => void {
    const transactionsRef = collection(this.db, "users", userId, "transactions");
    const transactionsQuery = query(
      transactionsRef,
      orderBy("createdAt", "desc")
    );

    return onSnapshot(transactionsQuery, (snapshot) => {
      const transactions = snapshot.docs.map((doc) => toTransaction(doc.id, doc.data()));

      onTransactionsChange(transactions);
    });
  }

  async create(userId: string, transaction: TransactionInput): Promise<void> {
    await addDoc(collection(this.db, "users", userId, "transactions"), {
      ...transaction,
      date: Timestamp.fromDate(transaction.date),
      createdAt: serverTimestamp(),
    });
  }

  async update(
    userId: string,
    id: string,
    transaction: TransactionInput
  ): Promise<void> {
    await updateDoc(doc(this.db, "users", userId, "transactions", id), {
      ...transaction,
      date: Timestamp.fromDate(transaction.date),
      updatedAt: serverTimestamp(),
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(doc(this.db, "users", userId, "transactions", id));
  }
}

function toTransaction(id: string, transaction: DocumentData): Transaction {
  return {
    id,
    type: transaction.type,
    amount: transaction.amount,
    category: transaction.category,
    description: transaction.description,
    date: transaction.date.toDate(),
    receiptUrl: transaction.receiptUrl,
    // Server timestamps may be pending in local snapshots.
    createdAt: transaction.createdAt?.toDate(),
    updatedAt: transaction.updatedAt?.toDate(),
  };
}
