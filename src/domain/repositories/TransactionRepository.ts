import type { Transaction, TransactionInput } from "../entities/Transaction";

export interface TransactionRepository {
  getById(userId: string, id: string): Promise<Transaction | null>;
  subscribe(
    userId: string,
    onTransactionsChange: (transactions: Transaction[]) => void
  ): () => void;
  create(userId: string, transaction: TransactionInput): Promise<void>;
  update(userId: string, id: string, transaction: TransactionInput): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
