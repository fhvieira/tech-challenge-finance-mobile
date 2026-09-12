import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatCurrency, formatDate } from "../constants/formatters";
import { getPressedFeedbackStyle } from "../constants/pressableFeedback";
import { useTransactions } from "../contexts/TransactionsContext";

const PAGE_SIZE = 10;
const LOAD_MORE_DELAY_MS = 300;

export default function TransactionsScreen() {
  const {
    transactions,
    deleteTransaction,
  } = useTransactions();

  const [categoryFilter, setCategoryFilter] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState("");
  const [maxAmountFilter, setMaxAmountFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<Date | null>(null);
  const [endDateFilter, setEndDateFilter] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const transactionsListRef = useRef<FlatList<(typeof transactions)[number]>>(null);
  const loadMoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesCategory = transaction.category
      .toLowerCase()
      .includes(categoryFilter.trim().toLowerCase());

    const minAmount = Number(minAmountFilter.replace(",", "."));
    const maxAmount = Number(maxAmountFilter.replace(",", "."));

    const matchesMinAmount =
      !minAmountFilter || transaction.amount >= minAmount;

    const matchesMaxAmount =
      !maxAmountFilter || transaction.amount <= maxAmount;

    const transactionDate = transaction.date?.toDate();

    const matchesStartDate =
      !startDateFilter ||
      (transactionDate && transactionDate >= startDateFilter);

    const matchesEndDate =
      !endDateFilter ||
      (transactionDate && transactionDate <= endDateFilter);

    return (
      matchesCategory &&
      matchesMinAmount &&
      matchesMaxAmount &&
      matchesStartDate &&
      matchesEndDate
    );
  });

  const visibleTransactions = filteredTransactions.slice(
    0,
    visibleCount
  );

  const hasActiveFilters =
    !!categoryFilter.trim() ||
    !!minAmountFilter ||
    !!maxAmountFilter ||
    !!startDateFilter ||
    !!endDateFilter;

  const counterText = `${visibleTransactions.length} de ${filteredTransactions.length} transações${hasActiveFilters ? " filtradas" : ""}`;

  function resetPagination() {
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current);
      loadMoreTimeoutRef.current = null;
    }

    setIsLoadingMore(false);
    setVisibleCount(PAGE_SIZE);
  }

  useEffect(() => () => {
    if (loadMoreTimeoutRef.current) {
      clearTimeout(loadMoreTimeoutRef.current);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || visibleCount >= filteredTransactions.length) {
      return;
    }

    setIsLoadingMore(true);

    loadMoreTimeoutRef.current = setTimeout(() => {
      setVisibleCount((current) =>
        Math.min(current + PAGE_SIZE, filteredTransactions.length)
      );
      setIsLoadingMore(false);
      loadMoreTimeoutRef.current = null;
    }, LOAD_MORE_DELAY_MS);
  }, [filteredTransactions.length, isLoadingMore, visibleCount]);

  function clearFilters() {
    resetPagination();
    setCategoryFilter("");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setStartDateFilter(null);
    setEndDateFilter(null);
  }

  function updateCategoryFilter(value: string) {
    resetPagination();
    setCategoryFilter(value);
  }

  function updateMinAmountFilter(value: string) {
    resetPagination();
    setMinAmountFilter(value);
  }

  function updateMaxAmountFilter(value: string) {
    resetPagination();
    setMaxAmountFilter(value);
  }

  function updateStartDateFilter(value: Date) {
    resetPagination();
    setStartDateFilter(value);
  }

  function updateEndDateFilter(value: Date) {
    resetPagination();
    setEndDateFilter(value);
  }

  function scrollToFilters() {
    transactionsListRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });
  }

  function confirmDeleteTransaction(transactionId: string) {
    Alert.alert(
      "Excluir transação?",
      "Esta ação não poderá ser desfeita.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Excluir",
          style: "destructive",
          onPress: () => deleteTransaction(transactionId),
        },
      ],
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
            style={({ pressed }) => getPressedFeedbackStyle(pressed)}
            onPress={scrollToFilters}
            accessibilityRole="button"
            accessibilityLabel="Ir para os filtros"
          >
            <View style={styles.filterHeader}>
              <Text style={styles.sectionTitle}>
                Filtros
              </Text>

              <Text style={styles.filterCount}>
                {filteredTransactions.length}
              </Text>
            </View>
          </Pressable>

        </View>
      </View>

      <FlatList
        ref={transactionsListRef}
        data={visibleTransactions}
        keyExtractor={(item) => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
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

            <Pressable
              style={({ pressed }) => [
                styles.clearButton,
                getPressedFeedbackStyle(pressed),
              ]}
              onPress={clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Limpar filtros do extrato"
            >
              <Text style={styles.clearButtonText}>
                Limpar filtros
              </Text>
            </Pressable>
          </View>
        }
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
                  {formatDate(transaction.date.toDate())}
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
                onPress={() => confirmDeleteTransaction(transaction.id)}
                accessibilityRole="button"
                accessibilityLabel={`Excluir transação ${transaction.category}`}
              >
                <Text style={styles.deleteButtonText}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListFooterComponent={
          isLoadingMore ? (
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
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhuma transação encontrada.</Text>
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
