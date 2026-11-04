import type { Transaction } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class ObserveTransactions {
  constructor(private readonly repository: TransactionRepository) {}

  execute(
    userId: string,
    onTransactionsChange: (transactions: Transaction[]) => void
  ): () => void {
    return this.repository.subscribe(userId, onTransactionsChange);
  }
}
