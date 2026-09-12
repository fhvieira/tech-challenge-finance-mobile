import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTransactions } from "../contexts/TransactionsContext";

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
  const [filtersExpanded, setFiltersExpanded] = useState(false);

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

  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleTransactions = filteredTransactions.slice(
    0,
    visibleCount
  );

  function clearFilters() {
    setCategoryFilter("");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setStartDateFilter(null);
    setEndDateFilter(null);
  }

  return (
    <FlatList
      data={visibleTransactions}
      keyExtractor={(item) => item.id}
      onEndReached={() => {
        if (visibleCount < filteredTransactions.length) {
          setVisibleCount((current) => current + PAGE_SIZE);
        }
      }}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>Extrato</Text>

          <Text>
            Exibindo {visibleTransactions.length} de {filteredTransactions.length}
          </Text>

          <View style={styles.card}>
            <Pressable
              onPress={() => setFiltersExpanded((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={
                filtersExpanded ? "Recolher filtros" : "Expandir filtros"
              }
            >
              <View style={styles.filterHeader}>
                <Text style={styles.sectionTitle}>
                  {filtersExpanded ? "▼" : "▶"} Filtros
                </Text>

                <Text style={styles.filterCount}>
                  {filteredTransactions.length}
                </Text>
              </View>
            </Pressable>

            {filtersExpanded && (
              <View>
                <Text style={styles.label}>Filtrar por categoria</Text>
                <TextInput
                  style={styles.input}
                  value={categoryFilter}
                  onChangeText={setCategoryFilter}
                  placeholder="Ex.: Alimentação"
                  accessibilityLabel="Filtrar transações por categoria"
                />

                <Text style={styles.label}>Valor mínimo</Text>
                <TextInput
                  style={styles.input}
                  value={minAmountFilter}
                  onChangeText={setMinAmountFilter}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  accessibilityLabel="Filtrar por valor mínimo"
                />

                <Text style={styles.label}>Valor máximo</Text>
                <TextInput
                  style={styles.input}
                  value={maxAmountFilter}
                  onChangeText={setMaxAmountFilter}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  accessibilityLabel="Filtrar por valor máximo"
                />

                <Text style={styles.label}>Data inicial</Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setShowStartDatePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar data inicial"
                >
                  <Text>
                    {startDateFilter
                      ? startDateFilter.toLocaleDateString("pt-BR")
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
                        setStartDateFilter(selectedDate);
                      }
                    }}
                  />
                )}

                <Text style={styles.label}>Data final</Text>
                <Pressable
                  style={styles.input}
                  onPress={() => setShowEndDatePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Selecionar data final"
                >
                  <Text>
                    {endDateFilter
                      ? endDateFilter.toLocaleDateString("pt-BR")
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
                        setEndDateFilter(selectedDate);
                      }
                    }}
                  />
                )}

                <Pressable
                  style={styles.clearButton}
                  onPress={clearFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar filtros do extrato"
                >
                  <Text style={styles.clearButtonText}>
                    Limpar filtros
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
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
              {transaction.type === "income" ? "+" : "-"} R${" "}
              {transaction.amount.toFixed(2)}
            </Text>
          </View>

          <View style={styles.transactionMeta}>
            <Text style={styles.transactionType}>
              {transaction.type === "income" ? "Entrada" : "Despesa"}
            </Text>

            {transaction.date && (
              <Text style={styles.transactionDate}>
                {transaction.date.toDate().toLocaleDateString("pt-BR")}
              </Text>
            )}
          </View>

          <View style={styles.transactionActions}>
            <Pressable
              style={styles.editButton}
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
              style={styles.deleteButton}
              onPress={() => deleteTransaction(transaction.id)}
              accessibilityRole="button"
              accessibilityLabel={`Excluir transação ${transaction.category}`}
            >
              <Text style={styles.deleteButtonText}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <Text>Nenhuma transação encontrada.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#E4EDEB",
  },

  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 12,
  },

  card: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginTop: 20,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },

  label: {
    marginBottom: 6,
    fontWeight: "500",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
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
    borderRadius: 8,
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
    borderRadius: 8,
    backgroundColor: "#F28C6F",
  },

  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },

  transactionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  clearButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 8,
    marginBottom: 20,
  },

  clearButtonText: {
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
});