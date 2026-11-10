export type TransactionInput = {
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: Date;
  receiptUrl?: string | null;
};

export type Transaction = TransactionInput & {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export function assertValidTransactionAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Informe um valor válido maior que zero.");
  }
}
