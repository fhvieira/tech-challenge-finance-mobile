import type { Transaction, TransactionInput } from "../entities/Transaction";
import type { FinancialSummary } from "../entities/FinancialSummary";

export interface TransactionRepository {
  getFinancialSummary(userId: string): Promise<FinancialSummary>;
  getById(userId: string, id: string): Promise<Transaction | null>;
  subscribe(
    userId: string,
    onTransactionsChange: (transactions: Transaction[]) => void
  ): () => void;
  create(userId: string, transaction: TransactionInput): Promise<void>;
  update(userId: string, id: string, transaction: TransactionInput): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
