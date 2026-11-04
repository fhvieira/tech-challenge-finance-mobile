import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import type { DocumentData, Firestore } from "firebase/firestore";
import type { Transaction, TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class FirebaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Firestore) {}

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
