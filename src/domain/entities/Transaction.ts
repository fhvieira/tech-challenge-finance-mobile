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
