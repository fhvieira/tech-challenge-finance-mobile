import { Redirect, router } from "expo-router";
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTransactions } from "../contexts/TransactionsContext";
import { auth } from "../firebaseConfig";

export default function HomeScreen() {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isChartExpanded, setIsChartExpanded] = useState(true);
  const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);

  const { user, loading } = useAuth();
  const { transactions } = useTransactions();

  const totalIncome = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const totalExpense = transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const balance = totalIncome - totalExpense;

  const [summarySectionAnimation] = useState(() => new Animated.Value(1));
  const [chartAnimation] = useState(() => new Animated.Value(0));
  const [chartSectionAnimation] = useState(() => new Animated.Value(1));
  const [analysisSectionAnimation] = useState(() => new Animated.Value(1));

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
  }, [chartAnimation, totalIncome, totalExpense]);

  function toggleSection(
    isExpanded: boolean,
    setIsExpanded: (isExpanded: boolean) => void,
    animationValue: Animated.Value,
  ) {
    Animated.timing(animationValue, {
      toValue: isExpanded ? 0 : 1,
      duration: 300,
      useNativeDriver: false,
    }).start();

    setIsExpanded(!isExpanded);
  }

  function getSectionContentStyle(
    animationValue: Animated.Value,
    expandedHeight: number,
  ) {
    return {
      opacity: animationValue,
      maxHeight: animationValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, expandedHeight],
      }),
      overflow: "hidden" as const,
    };
  }

  function toggleSummary() {
    toggleSection(
      isSummaryExpanded,
      setIsSummaryExpanded,
      summarySectionAnimation,
    );
  }

  function toggleChart() {
    toggleSection(
      isChartExpanded,
      setIsChartExpanded,
      chartSectionAnimation,
    );
  }

  function toggleAnalysis() {
    toggleSection(
      isAnalysisExpanded,
      setIsAnalysisExpanded,
      analysisSectionAnimation,
    );
  }

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
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir menu"
          >
            <Text style={styles.headerIcon}>☰</Text>
          </Pressable>

          <View style={styles.profile}>
            <Text style={styles.profileText}>
              {user.email?.charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Pressable
            onPress={toggleSummary}
            accessibilityRole="button"
            accessibilityLabel={
              isSummaryExpanded
                ? "Recolher resumo financeiro"
                : "Expandir resumo financeiro"
            }
          >
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.greeting}>Olá! :)</Text>
              <Text style={styles.accountLabel}>Conta Corrente</Text>
            </View>

            <Text style={styles.expandIcon}>
              {isSummaryExpanded ? "▼" : "▶"}
            </Text>
          </View>
          </Pressable>

          <Animated.View
            style={getSectionContentStyle(summarySectionAnimation, 160)}
          >
            <Text style={styles.summaryLabel}>Saldo</Text>

            <Text style={styles.balance}>
              R$ {balance.toFixed(2)}
            </Text>

            <View style={styles.totalsRow}>
              <Text>Entradas: R$ {totalIncome.toFixed(2)}</Text>
              <Text>Saídas: R$ {totalExpense.toFixed(2)}</Text>
            </View>
          </Animated.View>
        </View>

        <View
          style={styles.chartCard}
          accessibilityLabel="Gráfico comparativo de entradas e saídas"
        >
          <Pressable
            onPress={toggleChart}
            accessibilityRole="button"
            accessibilityLabel={
              isChartExpanded
                ? "Recolher gráfico de entradas e saídas"
                : "Expandir gráfico de entradas e saídas"
            }
          >
            <Text style={styles.chartTitle}>
              {isChartExpanded ? "▼" : "▶"} Entradas x Saídas
            </Text>
          </Pressable>

          <Animated.View
            style={getSectionContentStyle(chartSectionAnimation, 220)}
          >
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
          </Animated.View>
        </View>

        <View style={styles.analysisCard}>
          <Pressable
            onPress={toggleAnalysis}
            accessibilityRole="button"
            accessibilityLabel={
              isAnalysisExpanded
                ? "Recolher análise financeira"
                : "Expandir análise financeira"
            }
          >
            <Text style={styles.analysisTitle}>
              {isAnalysisExpanded ? "▼" : "▶"} Análise financeira
            </Text>
          </Pressable>

          <Animated.View
            style={getSectionContentStyle(analysisSectionAnimation, 80)}
          >
            <Text>
              {balance > 0
                ? `Suas entradas superam as saídas em R$ ${balance.toFixed(2)}.`
                : balance < 0
                  ? `Suas saídas superam as entradas em R$ ${Math.abs(balance).toFixed(2)}.`
                  : "Suas entradas e saídas estão equilibradas."}
            </Text>
          </Animated.View>
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
    padding: 20,
    backgroundColor: "#E4EDEB",
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
    width: "100%",
    backgroundColor: "#F28C6F",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },

  secondaryButton: {
    width: "100%",
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#004D40",
    borderRadius: 12,
    marginBottom: 20,
  },

  secondaryButtonText: {
    color: "#004D40",
    fontSize: 16,
    fontWeight: "600",
  },
  
  summaryCard: {
    width: "100%",
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    marginBottom: 20,
  },

  summaryLabel: {
    fontSize: 16,
    marginBottom: 8,
  },

  balance: {
    fontSize: 32,
    fontWeight: "700",
    color: "#004D40",
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
    marginBottom: 8,
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

  analysisCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginBottom: 20,
  },

  analysisTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },

  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "#004D40",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },

  headerIcon: {
    fontSize: 30,
    fontWeight: "600",
    color: "#ffffff",
  },

  profile: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#004D40",
    alignItems: "center",
    justifyContent: "center",
  },

  profileText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },

  greeting: {
    fontSize: 22,
    fontWeight: "700",
    color: "#004D40",
    marginBottom: 4,
  },

  accountLabel: {
    fontSize: 14,
  },

  expandIcon: {
    fontSize: 18,
  },

  totalsRow: {
    gap: 4,
  },
});
