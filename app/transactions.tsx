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

  const PAGE_SIZE = 2;
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
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar para o dashboard"
          >
            <Text>Voltar</Text>
          </Pressable>

          <Text style={styles.title}>Extrato</Text>

          <Text>
            Exibindo {visibleTransactions.length} de {filteredTransactions.length}
          </Text>

          <View style={styles.card}>
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
        </View>
      }
      renderItem={({ item: transaction }) => (
        <View style={styles.transactionItem}>
          <Text style={styles.transactionCategory}>
            {transaction.category}
          </Text>

          <Text>{transaction.description}</Text>

          <Text>
            {transaction.type === "income" ? "Entrada" : "Despesa"} - R${" "}
            {transaction.amount.toFixed(2)}
          </Text>

          {transaction.date && (
            <Text>
              {transaction.date.toDate().toLocaleDateString("pt-BR")}
            </Text>
          )}

          <Pressable
            onPress={() => deleteTransaction(transaction.id)}
            accessibilityRole="button"
            accessibilityLabel={`Excluir transação ${transaction.category}`}
          >
            <Text>Excluir</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/transaction-form",
                params: { id: transaction.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Editar transação ${transaction.category}`}
          >
            <Text>Editar</Text>
          </Pressable>
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
    backgroundColor: "#ffffff",
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
    marginBottom: 16,
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

  transactionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },

  transactionCategory: {
    fontWeight: "600",
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
});