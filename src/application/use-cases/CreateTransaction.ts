import { assertValidTransactionAmount } from "../../domain/entities/Transaction";
import type { TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class CreateTransaction {
  constructor(private readonly repository: TransactionRepository) {}

  async execute(userId: string, transaction: TransactionInput): Promise<void> {
    assertValidTransactionAmount(transaction.amount);
    return this.repository.create(userId, transaction);
  }
}
