import type { TransactionFilters } from "../../domain/entities/TransactionFilters";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class GetTransactionsCount {
  constructor(private readonly repository: TransactionRepository) {}

  execute(userId: string, filters?: TransactionFilters): Promise<number> {
    return this.repository.getCount(userId, filters);
  }
}
