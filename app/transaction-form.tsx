import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { storage } from "../firebaseConfig";

import { useTransactions } from "../contexts/TransactionsContext";

export default function TransactionFormScreen() {
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [receipt, setReceipt] =
  useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const {
    transactions,
    addTransaction,
    updateTransaction,
  } = useTransactions();

  const [type, setType] =
    useState<"income" | "expense">("expense");

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isEditing = Boolean(id);

  useEffect(() => {
    if (!id) return;

    const transaction = transactions.find(
      (item) => item.id === id
    );

    if (!transaction) return;

    setType(transaction.type);
    setAmount(transaction.amount.toString());
    setCategory(transaction.category);
    setDescription(transaction.description);

    if (transaction.date) {
      setDate(transaction.date.toDate());
    }
  }, [id, transactions]);

  async function handleSubmit() {
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

    const existingTransaction = id
      ? transactions.find((item) => item.id === id)
      : undefined;

    const receiptUrl = receipt
      ? await uploadReceipt()
      : existingTransaction?.receiptUrl ?? null;

    const transactionData = {
      type,
      amount: numericAmount,
      category: category.trim(),
      description: description.trim(),
      date: Timestamp.fromDate(date),
      receiptUrl,
    };

    if (isEditing && id) {
      await updateTransaction(id, transactionData);
    } else {
      await addTransaction(transactionData);
    }

    router.back();
  }

  async function pickReceipt() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    setReceipt(result.assets[0]);
  }

  async function uploadReceipt() {
    if (!receipt || !user) {
      return null;
    }

    const response = await fetch(receipt.uri);
    const blob = await response.blob();

    const fileRef = ref(
      storage,
      `users/${user.uid}/receipts/${Date.now()}-${receipt.name}`
    );

    await uploadBytes(fileRef, blob);

    return await getDownloadURL(fileRef);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={styles.backText}>Voltar</Text>
        </Pressable>

        <Text style={styles.title}>
          {isEditing ? "Editar transação" : "Nova transação"}
        </Text>

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

        <Pressable
          onPress={pickReceipt}
          accessibilityRole="button"
          accessibilityLabel="Selecionar comprovante"
        >
          <Text>Selecionar comprovante</Text>
        </Pressable>

        {receipt && (
          <Text>Arquivo selecionado: {receipt.name}</Text>
        )}

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
          onPress={handleSubmit}
          accessibilityRole="button"
          accessibilityLabel={
            isEditing
              ? "Salvar alterações da transação"
              : "Concluir transação"
          }
        >
          <Text style={styles.buttonText}>
            {isEditing ? "Salvar alterações" : "Concluir transação"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 24,
  },

  backText: {
    marginBottom: 20,
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
    paddingVertical: 12,
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

  button: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#ff6b5f",
  },

  buttonText: {
    fontWeight: "600",
  },
});