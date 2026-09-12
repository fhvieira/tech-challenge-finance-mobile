import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Timestamp } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { formatDate } from "../constants/formatters";
import { formValidationStyles } from "../constants/formValidationStyles";
import { getPressedFeedbackStyle } from "../constants/pressableFeedback";
import { useAuth } from "../contexts/AuthContext";
import { storage } from "../firebaseConfig";

import { useTransactions } from "../contexts/TransactionsContext";

type TransactionFormErrors = {
  amount?: string;
  category?: string;
};

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
  const [errors, setErrors] = useState<TransactionFormErrors>({});

  const isEditing = Boolean(id);

  useEffect(() => {
    if (!id) return;

    const transaction = transactions.find(
      (item) => item.id === id
    );

    if (!transaction) return;

    const frame = requestAnimationFrame(() => {
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setCategory(transaction.category);
      setDescription(transaction.description);

      if (transaction.date) {
        setDate(transaction.date.toDate());
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [id, transactions]);

  function handleAmountChange(value: string) {
    setAmount(value);
    setErrors((current) => ({ ...current, amount: undefined }));
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setErrors((current) => ({ ...current, category: undefined }));
  }

  async function handleSubmit() {
    const nextErrors: TransactionFormErrors = {};

    if (!amount.trim()) {
      nextErrors.amount = "Informe o valor da transação.";
    }

    if (!category.trim()) {
      nextErrors.category = "Informe a categoria.";
    }

    const numericAmount = Number(amount.replace(",", "."));

    if (
      amount.trim() &&
      (Number.isNaN(numericAmount) || numericAmount <= 0)
    ) {
      nextErrors.amount = "Informe um valor válido maior que zero.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
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
      <Stack.Screen
        options={{
          title: isEditing ? "Editar transação" : "Nova transação",
          headerBackTitle: isEditing ? "Transações" : "Início",
        }}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={Keyboard.dismiss}
        onTouchStart={Keyboard.dismiss}
      >
        <Text style={styles.title}>
          {isEditing ? "Editar transação" : "Nova transação"}
        </Text>

        <View style={styles.formCard}>
          <View style={styles.typeSelector}>
            <Pressable
              style={({ pressed }) => [
                styles.typeButton,
                type === "income" && styles.incomeSelected,
                getPressedFeedbackStyle(pressed),
              ]}
              onPress={() => setType("income")}
              accessibilityRole="button"
              accessibilityLabel="Selecionar entrada"
              accessibilityState={{ selected: type === "income" }}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  type === "income" && styles.selectedButtonText,
                ]}
              >
                Entrada
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.typeButton,
                type === "expense" && styles.expenseSelected,
                getPressedFeedbackStyle(pressed),
              ]}
              onPress={() => setType("expense")}
              accessibilityRole="button"
              accessibilityLabel="Selecionar despesa"
              accessibilityState={{ selected: type === "expense" }}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  type === "expense" && styles.selectedButtonText,
                ]}
              >
                Despesa
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>Valor</Text>
          <TextInput
            style={[
              styles.input,
              errors.amount && formValidationStyles.errorInput,
            ]}
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="Digite o valor"
            placeholderTextColor="#777"
            keyboardType="decimal-pad"
            accessibilityLabel="Valor da transação"
            accessibilityHint={errors.amount}
          />
          {errors.amount && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.amount}
            </Text>
          )}

          <Text style={styles.label}>Categoria</Text>
          <TextInput
            style={[
              styles.input,
              errors.category && formValidationStyles.errorInput,
            ]}
            value={category}
            onChangeText={handleCategoryChange}
            placeholder="Digite a categoria"
            placeholderTextColor="#777"
            accessibilityLabel="Categoria da transação"
            accessibilityHint={errors.category}
          />
          {errors.category && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.category}
            </Text>
          )}

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Digite uma descrição"
            placeholderTextColor="#777"
            accessibilityLabel="Descrição da transação"
          />

          <Pressable
            style={({ pressed }) => [
              styles.receiptButton,
              getPressedFeedbackStyle(pressed),
            ]}
            onPress={pickReceipt}
            accessibilityRole="button"
            accessibilityLabel="Selecionar comprovante"
          >
            <Text style={styles.receiptButtonText}>
              Selecionar comprovante
            </Text>
          </Pressable>

          {receipt && (
            <Text>Arquivo selecionado: {receipt.name}</Text>
          )}

          <Text style={styles.label}>Data</Text>

          <Pressable
            style={({ pressed }) => [
              styles.input,
              getPressedFeedbackStyle(pressed),
            ]}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Selecionar data da transação"
          >
            <Text>{formatDate(date)}</Text>
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
            style={({ pressed }) => [
              styles.button,
              getPressedFeedbackStyle(pressed),
            ]}
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
        </View>
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
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 24,
  },

  backText: {
    marginBottom: 20,
  },

  label: {
    marginBottom: 6,
    fontSize: 16,
    fontWeight: "600",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },

  button: {
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#F28C6F",
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },

  formCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
  },

  receiptButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#004D40",
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },

  receiptButtonText: {
    color: "#004D40",
    fontWeight: "600",
  },

  typeSelector: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },

  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },

  incomeSelected: {
    backgroundColor: "#2E7D32",
    borderColor: "#2E7D32",
  },

  expenseSelected: {
    backgroundColor: "#F28C6F",
    borderColor: "#F28C6F",
  },

  typeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  selectedButtonText: {
    color: "#ffffff",
  },
});
