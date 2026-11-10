/** Only emitted for an explicitly rejected write, never a connection failure. */
export class TransactionWriteRejected extends Error {
  constructor(readonly originalError: unknown) {
    super("A gravação da transação foi recusada.");
  }
}
