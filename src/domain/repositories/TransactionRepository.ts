import type { Transaction, TransactionInput } from "../entities/Transaction";
import type { FinancialSummary } from "../entities/FinancialSummary";
import type { TransactionCursor, TransactionPage } from "../entities/TransactionPage";
import type { TransactionFilters } from "../entities/TransactionFilters";

export interface TransactionRepository {
  /** Defaults to 10 records; cursors belong to the UID, filters and ordering. */
  getPage(userId: string, pageSize?: number, cursor?: TransactionCursor | null, filters?: TransactionFilters): Promise<TransactionPage>;
  getCount(userId: string, filters?: TransactionFilters): Promise<number>;
  getFinancialSummary(userId: string): Promise<FinancialSummary>;
  getById(userId: string, id: string): Promise<Transaction | null>;
  create(userId: string, transaction: TransactionInput): Promise<void>;
  update(userId: string, id: string, transaction: TransactionInput): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
}
