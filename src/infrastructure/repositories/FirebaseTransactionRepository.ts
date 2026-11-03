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
import type { Firestore } from "firebase/firestore";
import type { Transaction, TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class FirebaseTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Firestore) {}

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
      const transactions = snapshot.docs.map((doc): Transaction => {
        const transaction = doc.data();

        return {
          id: doc.id,
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
      });

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
