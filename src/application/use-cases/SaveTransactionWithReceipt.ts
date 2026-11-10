import { assertValidTransactionAmount } from "../../domain/entities/Transaction";
import type { TransactionInput } from "../../domain/entities/Transaction";
import { TransactionWriteRejected } from "../../domain/errors/TransactionWriteRejected";
import type { ReceiptFile, ReceiptRepository } from "../../domain/repositories/ReceiptRepository";
import type { CreateTransaction } from "./CreateTransaction";
import type { UpdateTransaction } from "./UpdateTransaction";

export class TransactionSaveError extends Error {
  constructor(readonly originalError: unknown, readonly cleanupFailed: boolean, readonly outcomeUnknown: boolean, hasNewUpload: boolean) {
    super(outcomeUnknown
      ? `Não foi possível confirmar a gravação. Confira o extrato antes de tentar novamente.${hasNewUpload ? " O comprovante foi preservado." : ""}`
      : cleanupFailed
        ? "Não foi possível salvar a transação. Também não foi possível remover o comprovante recém-enviado."
        : "Não foi possível salvar a transação. Seus dados foram mantidos. Tente novamente.");
  }
}

export class SaveTransactionWithReceipt {
  constructor(
    private readonly create: CreateTransaction,
    private readonly update: UpdateTransaction,
    private readonly receipts: ReceiptRepository,
  ) {}

  async execute(userId: string, transaction: TransactionInput, file?: ReceiptFile | null, id?: string): Promise<void> {
    if (!userId) throw new Error("Entre na sua conta para salvar a transação.");
    assertValidTransactionAmount(transaction.amount);
    // Existing receipt URLs are never candidates for deletion.
    const uploaded = file ? await this.receipts.upload(userId, file) : null;
    const input = uploaded ? { ...transaction, receiptUrl: uploaded.url } : transaction;
    try {
      if (id) await this.update.execute(userId, id, input);
      else await this.create.execute(userId, input);
    } catch (error) {
      let cleanupFailed = false;
      const rejected = error instanceof TransactionWriteRejected;
      // Uncertain outcomes deliberately retain the new upload. No read-back
      // race or client-only compensation can make both Firebase services atomic.
      if (uploaded && rejected) {
        try { await this.receipts.removeNewUpload(userId, uploaded); }
        catch { cleanupFailed = true; }
      }
      throw new TransactionSaveError(error, cleanupFailed, !rejected, Boolean(uploaded));
    } finally {
      if (uploaded) this.receipts.releaseUpload(uploaded);
    }
  }
}
