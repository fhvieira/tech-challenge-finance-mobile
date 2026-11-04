import type { Transaction } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class GetTransactionById {
  constructor(private readonly repository: TransactionRepository) {}

  execute(userId: string, id: string): Promise<Transaction | null> {
    return this.repository.getById(userId, id);
  }
}
