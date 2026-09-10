import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { useTransactions } from "../contexts/TransactionsContext";

export default function TransactionsScreen() {
  const {
    transactions,
    deleteTransaction,
  } = useTransactions();

  const [categoryFilter, setCategoryFilter] = useState("");

  const filteredTransactions = transactions.filter((transaction) =>
    transaction.category
      .toLowerCase()
      .includes(categoryFilter.trim().toLowerCase())
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Voltar para o dashboard"
      >
        <Text>Voltar</Text>
      </Pressable>

      <Text style={styles.title}>Extrato</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Filtrar por categoria</Text>

        <TextInput
          style={styles.input}
          value={categoryFilter}
          onChangeText={setCategoryFilter}
          placeholder="Ex.: Alimentação"
          accessibilityLabel="Filtrar transações por categoria"
        />

        {filteredTransactions.length === 0 ? (
          <Text>Nenhuma transação encontrada.</Text>
        ) : (
          filteredTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionItem}>
              <View>
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
              </View>

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
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
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
});