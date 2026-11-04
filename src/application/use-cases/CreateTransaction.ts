import type { TransactionInput } from "../../domain/entities/Transaction";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class CreateTransaction {
  constructor(private readonly repository: TransactionRepository) {}

  execute(userId: string, transaction: TransactionInput): Promise<void> {
    return this.repository.create(userId, transaction);
  }
}
