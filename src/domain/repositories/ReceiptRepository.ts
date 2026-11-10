export type ReceiptFile = { uri: string; name?: string; mimeType?: string };
export type UploadedReceipt = { path: string; url: string };

export interface ReceiptRepository {
  upload(userId: string, file: ReceiptFile): Promise<UploadedReceipt>;
  removeNewUpload(userId: string, receipt: UploadedReceipt): Promise<void>;
  /** In-memory bookkeeping only; releases permission to delete the new file. */
  releaseUpload(receipt: UploadedReceipt): void;
}

export class ReceiptUploadError extends Error {
  constructor(readonly originalError: unknown, readonly cleanupFailed = false) {
    super(cleanupFailed
      ? "Não foi possível enviar o comprovante nem remover o arquivo recém-enviado."
      : "Não foi possível enviar o comprovante. Tente novamente.");
  }
}
