import type { TransactionCursor, TransactionPage } from "../../domain/entities/TransactionPage";
import type { TransactionRepository } from "../../domain/repositories/TransactionRepository";
import type { TransactionSearchFilters } from "../../domain/entities/TransactionFilters";

type SearchOptions = { candidateBatchSize?: number; maxCandidateReads?: number };
const SEARCH_CURSOR_PREFIX = "category:";

export class GetTransactionsPage {
  private readonly candidateBatchSize: number;
  private readonly maxCandidateReads: number;

  constructor(private readonly repository: TransactionRepository, options: SearchOptions = {}) {
    this.candidateBatchSize = options.candidateBatchSize ?? 10;
    this.maxCandidateReads = options.maxCandidateReads ?? 100;
    if (!Number.isSafeInteger(this.candidateBatchSize) || this.candidateBatchSize < 1 ||
      !Number.isSafeInteger(this.maxCandidateReads) || this.maxCandidateReads < 2) {
      throw new Error("Configuração de lotes e limite de leituras inválida.");
    }
  }

  async execute(userId: string, pageSize = 10, cursor?: TransactionCursor | null, filters?: TransactionSearchFilters,
    canContinue: () => boolean = () => true): Promise<TransactionPage> {
    const { category, ...remoteFilters } = filters ?? {};
    const search = category?.trim().toLowerCase() ?? "";
    if (!search) {
      if (cursor?.startsWith(SEARCH_CURSOR_PREFIX)) throw new Error("Cursor de pesquisa incompatível com os filtros.");
      return this.repository.getPage(userId, pageSize, cursor, filters === undefined ? undefined : remoteFilters);
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Tamanho de página inválido.");
    // Scope envelope only: pagination still uses the repository's original
    // timestamp-precise cursor, never an entity Date or a second offset scheme.
    const scope = JSON.stringify([
      userId, search,
      remoteFilters.minAmount === undefined ? null : String(remoteFilters.minAmount),
      remoteFilters.maxAmount === undefined ? null : String(remoteFilters.maxAmount),
      remoteFilters.startDate?.getTime() ?? null, remoteFilters.endDate?.getTime() ?? null,
    ]);
    let candidateCursor: TransactionCursor | null = null;
    if (cursor != null) {
      try {
        if (!cursor.startsWith(SEARCH_CURSOR_PREFIX)) throw new Error();
        const token = JSON.parse(decodeURIComponent(cursor.slice(SEARCH_CURSOR_PREFIX.length)));
        if (token.version !== 1 || token.scope !== scope || typeof token.cursor !== "string" || !token.cursor) throw new Error();
        candidateCursor = token.cursor as TransactionCursor;
      } catch {
        throw new Error("Cursor de pesquisa inválido para o usuário ou filtros.");
      }
    }

    const transactions: TransactionPage["transactions"] = [];
    const seen = new Set<string>();
    let remainingReads = this.maxCandidateReads;
    let hasMore = true;
    while (transactions.length < pageSize && hasMore && remainingReads >= 2) {
      if (!canContinue()) throw new Error("Pesquisa cancelada.");
      const size = Math.min(this.candidateBatchSize, pageSize - transactions.length, remainingReads - 1);
      // Reserve the full query limit, including getPage's lookahead document.
      // This bounds document reads per action, not index-entry billing.
      remainingReads -= size + 1;
      const candidates = await this.repository.getPage(userId, size, candidateCursor, remoteFilters);
      if (!canContinue()) throw new Error("Pesquisa cancelada.");
      if (candidates.transactions.length > size ||
        (candidates.hasMore && (!candidates.nextCursor || candidates.nextCursor === candidateCursor))) {
        throw new Error("Página de candidatos ou avanço de cursor inválido.");
      }
      for (const transaction of candidates.transactions) {
        if (!seen.has(transaction.id) && transaction.category.toLowerCase().includes(search)) {
          seen.add(transaction.id);
          transactions.push(transaction);
        }
      }
      // Advance past every examined candidate, including non-matches. A failed
      // action publishes no partial cursor/items; retries replay only this action.
      hasMore = candidates.hasMore;
      candidateCursor = candidates.nextCursor;
    }
    return {
      transactions,
      hasMore,
      searchLimitReached: hasMore && transactions.length < pageSize,
      nextCursor: hasMore ? (SEARCH_CURSOR_PREFIX + encodeURIComponent(JSON.stringify({
        version: 1, scope, cursor: candidateCursor,
      }))) as TransactionCursor : null,
    };
  }
}
