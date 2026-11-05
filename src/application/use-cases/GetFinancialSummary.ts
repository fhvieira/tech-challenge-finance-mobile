import type { FinancialSummary } from "../../domain/entities/FinancialSummary";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";

export class GetFinancialSummary {
  constructor(private readonly repository: TransactionRepository) {}

  execute(userId: string): Promise<FinancialSummary> {
    return this.repository.getFinancialSummary(userId);
  }
}
