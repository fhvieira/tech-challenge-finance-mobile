import { useMemo, useSyncExternalStore } from "react";
import type { GetFinancialSummary } from "../src/application/use-cases/GetFinancialSummary";
import type { FinancialSummary } from "../src/domain/entities/FinancialSummary";

type SummaryState = {
  financialSummary: FinancialSummary | null;
  isFinancialSummaryLoading: boolean;
  financialSummaryError: string | null;
  isFinancialSummaryStale: boolean;
};

// Ephemeral presentation state, owned by one authenticated UID. No persisted cache.
export function createFinancialSummaryStore(
  userId: string | null,
  getSummary: (userId: string) => Promise<FinancialSummary>
) {
  let state: SummaryState = {
    financialSummary: null,
    isFinancialSummaryLoading: Boolean(userId),
    financialSummaryError: null,
    isFinancialSummaryStale: false,
  };
  const listeners = new Set<() => void>();
  let inFlight: Promise<void> | null = null;
  let revision = 0;
  let generation = 0;

  function publish(next: SummaryState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function refreshFinancialSummary(): Promise<void> {
    if (!userId || listeners.size === 0) return Promise.resolve();
    if (inFlight) return inFlight;

    const requestGeneration = generation;
    const isCurrent = () => generation === requestGeneration && listeners.size > 0;
    async function load(uid: string) {
      if (!isCurrent()) return;

      let readRevision: number;
      do {
        readRevision = revision;
        try {
          const summary = await getSummary(uid);
          if (isCurrent() && readRevision === revision) {
            publish({
              financialSummary: summary,
              isFinancialSummaryLoading: true,
              financialSummaryError: null,
              isFinancialSummaryStale: false,
            });
          }
        } catch {
          if (isCurrent() && readRevision === revision) {
            publish({
              ...state,
              financialSummaryError: "Não foi possível atualizar os totais financeiros.",
              isFinancialSummaryStale: true,
            });
          }
        }
      } while (isCurrent() && readRevision !== revision);

      if (isCurrent()) {
        inFlight = null;
        publish({ ...state, isFinancialSummaryLoading: false });
      }
    }

    const request = Promise.resolve().then(() => load(userId)).finally(() => {
      if (inFlight === request) inFlight = null;
    });
    inFlight = request;
    publish({ ...state, isFinancialSummaryLoading: true });
    return request;
  }

  function invalidateFinancialSummary(): Promise<void> {
    revision += 1;
    publish({ ...state, isFinancialSummaryStale: true });
    return refreshFinancialSummary();
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) void refreshFinancialSummary();

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          generation += 1;
          inFlight = null;
        }
      };
    },
    refreshFinancialSummary,
    invalidateFinancialSummary,
  };
}

export function useFinancialSummary(userId: string | null, useCase: GetFinancialSummary) {
  const store = useMemo(
    () => createFinancialSummaryStore(userId, (uid) => useCase.execute(uid)),
    [userId, useCase]
  );
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return {
    ...state,
    refreshFinancialSummary: store.refreshFinancialSummary,
    invalidateFinancialSummary: store.invalidateFinancialSummary,
  };
}
