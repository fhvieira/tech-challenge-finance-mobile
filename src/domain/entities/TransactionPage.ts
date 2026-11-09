import type { Transaction } from "./Transaction";

/** Opaque continuation token. Only its issuing layer may interpret it. */
export type TransactionCursor = string & {
  readonly __transactionCursor: unique symbol;
};

export type TransactionPage = {
  transactions: Transaction[];
  nextCursor: TransactionCursor | null;
  hasMore: boolean;
  /** Candidates remain after the per-action category search budget was reached. */
  searchLimitReached?: boolean;
};
