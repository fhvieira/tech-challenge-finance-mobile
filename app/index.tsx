import DateTimePicker from "@react-native-community/datetimepicker";
import { Redirect } from "expo-router";
import { signOut } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTransactions } from "../contexts/TransactionsContext";
import { auth } from "../firebaseConfig";

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const { transactions, addTransaction } = useTransactions();

  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

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

  async function createTestTransaction() {
    if (!user) return;

    await addTransaction({
      type,
      amount: Number(amount),
      category,
      description,
      date: Timestamp.fromDate(date),
    });
  }

  async function handleAddTransaction() {
    if (!amount.trim()) {
      alert("Informe o valor da transação.");
      return;
    }

    if (!category.trim()) {
      alert("Informe a categoria.");
      return;
    }

    const numericAmount = Number(amount.replace(",", "."));

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      alert("Informe um valor válido.");
      return;
    }

    await addTransaction({
      type,
      amount: numericAmount,
      category: category.trim(),
      description: description.trim(),
      date: Timestamp.fromDate(date),
    });

    setAmount("");
    setCategory("");
    setDescription("");
    setDate(new Date());
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard Financeiro</Text>

      <Text style={styles.email}>{user.email}</Text>

      <Pressable
        style={styles.button} 
        accessibilityRole="button"
        accessibilityLabel="Sair da aplicação"
        onPress={() => signOut(auth)}
      >
        <Text style={styles.buttonText}>Sair</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Nova transação</Text>

        <View style={styles.typeContainer}>
          <Pressable
            style={[
              styles.typeButton,
              type === "income" && styles.typeButtonSelected,
            ]}
            onPress={() => setType("income")}
            accessibilityRole="button"
            accessibilityLabel="Selecionar entrada"
            accessibilityState={{ selected: type === "income" }}
          >
            <Text>Entrada</Text>
          </Pressable>

          <Pressable
            style={[
              styles.typeButton,
              type === "expense" && styles.typeButtonSelected,
            ]}
            onPress={() => setType("expense")}
            accessibilityRole="button"
            accessibilityLabel="Selecionar despesa"
            accessibilityState={{ selected: type === "expense" }}
          >
            <Text>Despesa</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Valor</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          placeholder="0,00"
          keyboardType="decimal-pad"
          accessibilityLabel="Valor da transação"
        />

        <Text style={styles.label}>Categoria</Text>
        <TextInput
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder="Ex.: Alimentação"
          accessibilityLabel="Categoria da transação"
        />

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder="Descrição opcional"
          accessibilityLabel="Descrição da transação"
        />

        <Text style={styles.label}>Data</Text>

        <Pressable
          style={styles.input}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Selecionar data da transação"
        >
          <Text>{date.toLocaleDateString("pt-BR")}</Text>
        </Pressable>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            onChange={(_, selectedDate) => {
              setShowDatePicker(false);

              if (selectedDate) {
                setDate(selectedDate);
              }
            }}
          />
        )}

        <Pressable
          style={styles.button}
          onPress={handleAddTransaction}
          accessibilityRole="button"
          accessibilityLabel="Concluir transação"
        >
          <Text style={styles.buttonText}>Concluir transação</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
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

  typeContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },

  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },

  typeButtonSelected: {
    borderWidth: 2,
  },
});