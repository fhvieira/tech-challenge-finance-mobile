import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatCurrency, formatDate } from "../constants/formatters";
import { getPressedFeedbackStyle } from "../constants/pressableFeedback";
import { useTransactions } from "../contexts/TransactionsContext";
import type { Transaction } from "../src/domain/entities/Transaction";

export default function TransactionsScreen() {
  const {
    paginatedTransactions,
    isInitialPageLoading,
    isNextPageLoading,
    paginationError,
    hasMore,
    searchLimitReached,
    loadFirstPage,
    loadNextPage,
    resetPagination,
    transactionsCount,
    isTransactionsCountLoading,
    transactionsCountError,
    refreshTransactionsCount,
    deleteTransaction,
  } = useTransactions();

  const deleteLocks = useRef(new Set<string>());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const filterLayoutChanged = useRef(false);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState("");
  const [maxAmountFilter, setMaxAmountFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<Date | null>(null);
  const [endDateFilter, setEndDateFilter] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const transactionsListRef = useRef<FlatList<Transaction>>(null);
  const pageRequestRef = useRef<{ load: typeof loadNextPage; request: Promise<void> } | null>(null);

  const hasActiveFilters =
    !!categoryFilter.trim() ||
    !!minAmountFilter ||
    !!maxAmountFilter ||
    !!startDateFilter ||
    !!endDateFilter;

  const filterSummary = [
    categoryFilter.trim() && `Categoria: ${categoryFilter.trim()}`,
    minAmountFilter && `Mín.: ${formatFilterAmount(minAmountFilter)}`,
    maxAmountFilter && `Máx.: ${formatFilterAmount(maxAmountFilter)}`,
    startDateFilter && `Desde: ${formatDate(startDateFilter)}`,
    endDateFilter && `Até: ${formatDate(endDateFilter)}`,
  ].filter(Boolean).join(" · ") || "Nenhum filtro ativo.";

  const hasCategorySearch = !!categoryFilter.trim();
  const remoteFilters = useMemo(() => ({
    category: categoryFilter,
    minAmount: minAmountFilter ? Number(minAmountFilter.replace(",", ".")) : undefined,
    maxAmount: maxAmountFilter ? Number(maxAmountFilter.replace(",", ".")) : undefined,
    startDate: startDateFilter ?? undefined,
    endDate: endDateFilter ?? undefined,
  }), [categoryFilter, minAmountFilter, maxAmountFilter, startDateFilter, endDateFilter]);

  const counterText = transactionsCount !== null
    ? `${paginatedTransactions.length} de ${transactionsCount} transações${hasActiveFilters ? " filtradas" : ""}`
    : hasCategorySearch
      ? `${paginatedTransactions.length} transações encontradas — pesquisa em andamento`
      : `${paginatedTransactions.length} transações carregadas${isTransactionsCountLoading ? " (contando...)" : ""}`;

  useFocusEffect(useCallback(() => {
    void loadFirstPage(remoteFilters);

    return () => {
      pageRequestRef.current = null;
      resetPagination();
    };
  }, [remoteFilters, loadFirstPage, resetPagination]));

  function resetFilteredPagination() {
    // Hide the previous query's rows immediately, before the new focus effect.
    pageRequestRef.current = null;
    resetPagination();
  }

  const handleLoadMore = useCallback(() => {
    if (filterLayoutChanged.current || isInitialPageLoading || isNextPageLoading || paginationError || !hasMore || searchLimitReached ||
      pageRequestRef.current?.load === loadNextPage) return;

    const pending = { load: loadNextPage, request: loadNextPage() };
    pageRequestRef.current = pending;
    void pending.request.finally(() => {
      if (pageRequestRef.current === pending) pageRequestRef.current = null;
    });
  }, [isInitialPageLoading, isNextPageLoading, paginationError, hasMore, searchLimitReached, loadNextPage]);

  function clearFilters() {
    Keyboard.dismiss();
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
    resetFilteredPagination();
    setCategoryFilter("");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setStartDateFilter(null);
    setEndDateFilter(null);
  }

  function updateCategoryFilter(value: string) {
    resetFilteredPagination();
    setCategoryFilter(value);
  }

  function updateMinAmountFilter(value: string) {
    resetFilteredPagination();
    setMinAmountFilter(value);
  }

  function updateMaxAmountFilter(value: string) {
    resetFilteredPagination();
    setMaxAmountFilter(value);
  }

  function updateStartDateFilter(value: Date) {
    resetFilteredPagination();
    setStartDateFilter(value);
  }

  function updateEndDateFilter(value: Date) {
    resetFilteredPagination();
    setEndDateFilter(value);
  }

  function toggleFilters() {
    Keyboard.dismiss();
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
    // Changing header height can trigger FlatList.onEndReached by layout alone.
    // Resume automatic paging only after the next user scroll gesture.
    filterLayoutChanged.current = true;
    setIsFiltersExpanded((current) => !current);
    if (!isFiltersExpanded) {
      transactionsListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }

  function confirmDeleteTransaction(transactionId: string) {
    if (deleteLocks.current.has(transactionId) || deleteLocks.current.has(`writing:${transactionId}`)) return;
    deleteLocks.current.add(transactionId);
    const unlock = () => { deleteLocks.current.delete(transactionId); };
    Alert.alert(
      "Excluir transação?",
      "Esta ação não poderá ser desfeita.",
      [
        {
          text: "Cancelar",
          style: "cancel",
          onPress: unlock,
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            if (deletingIds.has(transactionId)) return;
            // This second lock also guards a repeated confirmation callback
            // before React has rendered the disabled button.
            const writing = `writing:${transactionId}`;
            if (deleteLocks.current.has(writing)) return;
            deleteLocks.current.add(writing);
            setDeletingIds((current) => new Set(current).add(transactionId));
            try { await deleteTransaction(transactionId); }
            catch {
              Alert.alert("Não foi possível excluir", "A exclusão não foi confirmada. Verifique sua conexão e tente novamente.");
            } finally {
              deleteLocks.current.delete(writing);
              unlock();
              setDeletingIds((current) => { const next = new Set(current); next.delete(transactionId); return next; });
            }
          },
        },
      ],
      { cancelable: true, onDismiss: unlock },
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.fixedTopSection}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Extrato</Text>

          <Text
            style={styles.counterText}
            accessibilityLabel={counterText}
          >
            {counterText}
          </Text>
        </View>

        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [styles.filterToggle, getPressedFeedbackStyle(pressed)]}
            onPress={toggleFilters}
            accessibilityRole="button"
            accessibilityLabel={isFiltersExpanded ? "Recolher filtros" : "Expandir filtros"}
            accessibilityHint="Mostra ou oculta os campos sem remover os filtros aplicados."
            accessibilityState={{ expanded: isFiltersExpanded }}
          >
            <View style={styles.filterHeader}>
              <Text style={styles.sectionTitle}>
                Filtros
              </Text>

              <Text style={styles.filterCount}>
                {isFiltersExpanded ? "Recolher ▴" : "Expandir ▾"}
              </Text>
            </View>
          </Pressable>
          <Text
            style={styles.filterSummary}
            numberOfLines={2}
            accessibilityLabel={`Resumo dos filtros: ${filterSummary}`}
          >
            {filterSummary}
          </Text>
          {hasActiveFilters && (
            <Pressable
              style={({ pressed }) => [styles.clearButton, getPressedFeedbackStyle(pressed)]}
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Limpar filtros do extrato"
            >
              <Text style={styles.clearButtonText}>Limpar filtros</Text>
            </Pressable>
          )}
          {!hasCategorySearch && transactionsCountError && (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.emptyText}>{transactionsCountError}</Text>
              <Pressable
                style={({ pressed }) => [styles.clearButton, getPressedFeedbackStyle(pressed)]}
                onPress={() => void refreshTransactionsCount()}
                accessibilityRole="button"
                accessibilityLabel="Tentar atualizar contagem novamente"
              >
                <Text style={styles.clearButtonText}>Atualizar contagem</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <FlatList
        ref={transactionsListRef}
        data={paginatedTransactions}
        keyExtractor={(item) => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          filterLayoutChanged.current = false;
        }}
        onTouchStart={Keyboard.dismiss}
        ListHeaderComponent={isFiltersExpanded ? (
          <View style={[styles.card, styles.filtersCard]}>
            <Text style={styles.label}>Filtrar por categoria</Text>
            <TextInput
              style={styles.input}
              value={categoryFilter}
              onChangeText={updateCategoryFilter}
              placeholder="Digite a categoria"
              placeholderTextColor="#777"
              accessibilityLabel="Filtrar transações por categoria"
            />

            <Text style={styles.label}>Valor mínimo</Text>
            <TextInput
              style={styles.input}
              value={minAmountFilter}
              onChangeText={updateMinAmountFilter}
              keyboardType="decimal-pad"
              placeholder="Digite o valor mínimo"
              placeholderTextColor="#777"
              accessibilityLabel="Filtrar por valor mínimo"
            />

            <Text style={styles.label}>Valor máximo</Text>
            <TextInput
              style={styles.input}
              value={maxAmountFilter}
              onChangeText={updateMaxAmountFilter}
              keyboardType="decimal-pad"
              placeholder="Digite o valor máximo"
              placeholderTextColor="#777"
              accessibilityLabel="Filtrar por valor máximo"
            />

            <Text style={styles.label}>Data inicial</Text>
            <Pressable
              style={({ pressed }) => [
                styles.input,
                getPressedFeedbackStyle(pressed),
              ]}
              onPress={() => setShowStartDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Selecionar data inicial"
            >
              <Text>
                {startDateFilter
                  ? formatDate(startDateFilter)
                  : "Selecionar data"}
              </Text>
            </Pressable>

            {showStartDatePicker && (
              <DateTimePicker
                value={startDateFilter ?? new Date()}
                mode="date"
                onChange={(_, selectedDate) => {
                  setShowStartDatePicker(false);

                  if (selectedDate) {
                    selectedDate.setHours(0, 0, 0, 0);
                    updateStartDateFilter(selectedDate);
                  }
                }}
              />
            )}

            <Text style={styles.label}>Data final</Text>
            <Pressable
              style={({ pressed }) => [
                styles.input,
                getPressedFeedbackStyle(pressed),
              ]}
              onPress={() => setShowEndDatePicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Selecionar data final"
            >
              <Text>
                {endDateFilter
                  ? formatDate(endDateFilter)
                  : "Selecionar data"}
              </Text>
            </Pressable>

            {showEndDatePicker && (
              <DateTimePicker
                value={endDateFilter ?? new Date()}
                mode="date"
                onChange={(_, selectedDate) => {
                  setShowEndDatePicker(false);

                  if (selectedDate) {
                    selectedDate.setHours(23, 59, 59, 999);
                    updateEndDateFilter(selectedDate);
                  }
                }}
              />
            )}

          </View>
        ) : undefined}
        renderItem={({ item: transaction }) => (
          <View style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.transactionCategory}>
                  {transaction.category}
                </Text>

                {!!transaction.description && (
                  <Text style={styles.transactionDescription}>
                    {transaction.description}
                  </Text>
                )}
              </View>

              <Text
                style={[
                  styles.transactionAmount,
                  transaction.type === "income"
                    ? styles.incomeText
                    : styles.expenseText,
                ]}
              >
                {transaction.type === "income" ? "+" : "-"}
                {formatCurrency(transaction.amount)}
              </Text>
            </View>

            <View style={styles.transactionMeta}>
              <Text style={styles.transactionType}>
                {transaction.type === "income" ? "Entrada" : "Despesa"}
              </Text>

              {transaction.date && (
                <Text style={styles.transactionDate}>
                  {formatDate(transaction.date)}
                </Text>
              )}
            </View>

            <View style={styles.transactionActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.editButton,
                  getPressedFeedbackStyle(pressed),
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/transaction-form",
                    params: { id: transaction.id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Editar transação ${transaction.category}`}
              >
                <Text style={styles.editButtonText}>Editar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  getPressedFeedbackStyle(pressed),
                ]}
                disabled={deletingIds.has(transaction.id)}
                accessibilityState={{ disabled: deletingIds.has(transaction.id), busy: deletingIds.has(transaction.id) }}
                onPress={() => confirmDeleteTransaction(transaction.id)}
                accessibilityRole="button"
                accessibilityLabel={`Excluir transação ${transaction.category}`}
              >
                <Text style={styles.deleteButtonText}>{deletingIds.has(transaction.id) ? "Excluindo..." : "Excluir"}</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          isNextPageLoading ? (
            <View
              style={styles.loadingFooter}
              accessible
              accessibilityLabel="Carregando mais transações"
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator size="small" color="#004D40" />
              <Text style={styles.loadingFooterText}>
                Carregando mais transações...
              </Text>
            </View>
          ) : paginationError ? (
            <View style={styles.card} accessibilityLiveRegion="polite">
              <Text style={styles.emptyText}>{paginationError}</Text>
              <Pressable
                style={({ pressed }) => [styles.clearButton, getPressedFeedbackStyle(pressed)]}
                onPress={() => void loadNextPage()}
                accessibilityRole="button"
                accessibilityLabel="Tentar carregar transações novamente"
              >
                <Text style={styles.clearButtonText}>Tentar novamente</Text>
              </Pressable>
            </View>
          ) : searchLimitReached ? (
            <View style={styles.card} accessibilityLiveRegion="polite">
              <Text style={styles.emptyText}>Há mais transações para pesquisar.</Text>
              <Pressable
                style={({ pressed }) => [styles.clearButton, getPressedFeedbackStyle(pressed)]}
                onPress={() => void loadNextPage()}
                accessibilityRole="button"
                accessibilityLabel="Continuar pesquisa de transações"
              >
                <Text style={styles.clearButtonText}>Continuar pesquisa</Text>
              </Pressable>
            </View>
          ) : !isInitialPageLoading && !hasMore && paginatedTransactions.length > 0 ? (
            <Text style={styles.emptyText}>Fim do histórico.</Text>
          ) : undefined
        }
        ListEmptyComponent={
          isInitialPageLoading ? (
            <View style={styles.loadingFooter} accessibilityLabel="Carregando transações" accessible>
              <ActivityIndicator size="small" color="#004D40" />
              <Text style={styles.loadingFooterText}>Carregando transações...</Text>
            </View>
          ) : paginationError || transactionsCountError || hasMore || transactionsCount === null ? undefined : (
            <Text style={styles.emptyText}>Nenhuma transação encontrada.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#E4EDEB",
  },

  fixedTopSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
    backgroundColor: "#E4EDEB",
  },

  headerRow: {
    marginBottom: 12,
  },

  listContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#1f2d2b",
    marginBottom: 4,
  },

  counterText: {
    color: "#004D40",
    fontWeight: "600",
  },

  card: {
    width: "100%",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#004D40",
  },

  filtersCard: {
    marginTop: 12,
  },

  label: {
    fontSize: 14,
    marginBottom: 6,
    fontWeight: "600",
    color: "#1f2d2b",
  },

  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  transactionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },

  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  transactionCategory: {
    fontSize: 18,
    fontWeight: "700",
    color: "#004D40",
  },

  transactionDescription: {
    marginTop: 4,
    color: "#555",
  },

  transactionAmount: {
    fontSize: 17,
    fontWeight: "700",
  },

  incomeText: {
    color: "#2E7D32",
  },

  expenseText: {
    color: "#D7654B",
  },

  transactionMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },

  transactionType: {
    fontWeight: "500",
  },

  transactionDate: {
    color: "#666",
  },

  transactionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },

  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#004D40",
  },

  editButtonText: {
    color: "#004D40",
    fontWeight: "600",
  },

  deleteButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#D7654B",
  },

  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },

  transactionItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  clearButton: {
    minHeight: 44,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#004D40",
    borderRadius: 12,
    marginTop: 2,
  },

  clearButtonText: {
    color: "#004D40",
    fontWeight: "600",
  },

  filterToggle: {
    minHeight: 44,
    justifyContent: "center",
  },

  filterSummary: {
    color: "#004D40",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },

  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  filterCount: {
    backgroundColor: "#E4EDEB",
    color: "#004D40",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontWeight: "600",
  },

  loadingFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },

  loadingFooterText: {
    color: "#004D40",
    fontWeight: "600",
  },

  emptyText: {
    marginTop: 16,
    color: "#555",
  },
});

function formatFilterAmount(value: string): string {
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) ? formatCurrency(amount) : value;
}
