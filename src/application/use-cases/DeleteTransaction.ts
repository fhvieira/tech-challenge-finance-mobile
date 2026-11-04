import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class DeleteTransaction {
  constructor(private readonly repository: TransactionRepository) {}

  execute(userId: string, id: string): Promise<void> {
    return this.repository.delete(userId, id);
  }
}
