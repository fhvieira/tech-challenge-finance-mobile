import { Redirect, router } from "expo-router";
import { signOut } from "firebase/auth";
import { useEffect, useRef } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTransactions } from "../contexts/TransactionsContext";
import { auth } from "../firebaseConfig";

export default function HomeScreen() {
  
  const { user, loading } = useAuth();

  const { transactions } = useTransactions();

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const totalExpense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const balance = totalIncome - totalExpense;

  const chartAnimation = useRef(new Animated.Value(0)).current;

  const maxValue = Math.max(totalIncome, totalExpense, 1);

  const incomePercentage = (totalIncome / maxValue) * 100;
  const expensePercentage = (totalExpense / maxValue) * 100;

  useEffect(() => {
    chartAnimation.setValue(0);

    Animated.timing(chartAnimation, {
      toValue: 1,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [totalIncome, totalExpense]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Carregando...</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Dashboard Financeiro</Text>
        <Text style={styles.email}>{user.email}</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Saldo</Text>

          <Text style={styles.balance}>
            R$ {balance.toFixed(2)}
          </Text>

          <Text>
            Entradas: R$ {totalIncome.toFixed(2)}
          </Text>

          <Text>
            Saídas: R$ {totalExpense.toFixed(2)}
          </Text>
        </View>

        <View
          style={styles.chartCard}
          accessibilityLabel="Gráfico comparativo de entradas e saídas"
        >
          <Text style={styles.chartTitle}>
            Entradas x Saídas
          </Text>

          <Text style={styles.chartLabel}>
            Entradas
          </Text>

          <View style={styles.chartTrack}>
            <Animated.View
              style={[
                styles.incomeBar,
                {
                  width: chartAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", `${incomePercentage}%`],
                  }),
                },
              ]}
            />
          </View>

          <Text>
            R$ {totalIncome.toFixed(2)}
          </Text>

          <Text style={styles.chartLabel}>
            Saídas
          </Text>

          <View style={styles.chartTrack}>
            <Animated.View
              style={[
                styles.expenseBar,
                {
                  width: chartAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", `${expensePercentage}%`],
                  }),
                },
              ]}
            />
          </View>

          <Text>
            R$ {totalExpense.toFixed(2)}
          </Text>
        </View>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/transaction-form")}
          accessibilityRole="button"
          accessibilityLabel="Criar nova transação"
        >
          <Text style={styles.buttonText}>Nova transação</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/transactions")}
          accessibilityRole="button"
          accessibilityLabel="Ver extrato"
        >
          <Text style={styles.buttonText}>Ver extrato</Text>
        </Pressable>
        
        <Pressable
          style={styles.secondaryButton}
          accessibilityRole="button"
          accessibilityLabel="Sair da aplicação"
          onPress={() => signOut(auth)}
        >
          <Text style={styles.secondaryButtonText}>Sair</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
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

  email: {
    fontSize: 16,
    marginBottom: 24,
  },

  button: {
    backgroundColor: "#F28C6F",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },

  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
  },

  secondaryButton: {
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 8,
  },

  secondaryButtonText: {
    fontWeight: "600",
  },

  summaryCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginBottom: 20,
  },

  summaryLabel: {
    fontSize: 16,
    marginBottom: 8,
  },

  balance: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },

  chartCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginBottom: 20,
  },

  chartTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
  },

  chartLabel: {
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
  },

  chartTrack: {
    width: "100%",
    height: 18,
    backgroundColor: "#eee",
    borderRadius: 9,
    overflow: "hidden",
  },

  incomeBar: {
    height: "100%",
    backgroundColor: "#4CAF50",
    borderRadius: 9,
  },

  expenseBar: {
    height: "100%",
    backgroundColor: "#F28C6F",
    borderRadius: 9,
  },
});