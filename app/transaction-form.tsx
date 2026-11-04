import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import type { Transaction } from "../src/domain/entities/Transaction";

import { useTransactions } from "../contexts/TransactionsContext";

type TransactionFormErrors = {
  amount?: string;
  category?: string;
};

export default function TransactionFormScreen() {
  const { user, loading } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <TransactionEditor
      key={JSON.stringify([user?.uid ?? null, id ?? null])}
      id={id}
      userId={user?.uid ?? null}
      authLoading={loading}
    />
  );
}

type TransactionLoadState =
  | { status: "loading" }
  | { status: "ready"; transaction: Transaction | null }
  | { status: "not-found" }
  | { status: "error" };

function TransactionEditor({ id, userId, authLoading }: {
  id?: string;
  userId: string | null;
  authLoading: boolean;
}) {
  const { getTransactionById } = useTransactions();
  const [loadState, setLoadState] = useState<TransactionLoadState>(
    id ? { status: "loading" } : { status: "ready", transaction: null }
  );
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!id || !userId) return;

    let active = true;

    async function loadTransaction(transactionId: string) {
      try {
        const transaction = await getTransactionById(transactionId);
        if (!active) return;

        setLoadState(transaction
          ? { status: "ready", transaction }
          : { status: "not-found" });
      } catch {
        if (active) setLoadState({ status: "error" });
      }
    }

    void loadTransaction(id);
    return () => { active = false; };
  }, [id, userId, getTransactionById, requestVersion]);

  if (authLoading || (userId && loadState.status === "loading")) {
    return <TransactionFormStatus id={id} loading message="Carregando transação..." />;
  }

  if (!userId) {
    return <TransactionFormStatus id={id} message="Entre na sua conta para continuar." />;
  }

  if (loadState.status === "not-found") {
    return <TransactionFormStatus id={id} message="Transação não encontrada." />;
  }

  if (loadState.status === "error") {
    return <TransactionFormStatus
      id={id}
      message="Não foi possível carregar a transação. Tente novamente."
      onRetry={() => {
        setLoadState({ status: "loading" });
        setRequestVersion((current) => current + 1);
      }}
    />;
  }

  if (loadState.status !== "ready") return null;

  return <TransactionForm id={id} transaction={loadState.transaction} />;
}

function TransactionFormStatus({ id, loading = false, message, onRetry }: {
  id?: string;
  loading?: boolean;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{
        title: id ? "Editar transação" : "Nova transação",
        headerBackTitle: id ? "Transações" : "Início",
      }} />
      <View style={styles.formCard}>
        {loading && <ActivityIndicator accessibilityLabel="Carregando transação" />}
        <Text accessibilityLiveRegion="polite">{message}</Text>
        {onRetry && (
          <Pressable style={styles.receiptButton} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.receiptButtonText}>Tentar novamente</Text>
          </Pressable>
        )}
        {!loading && (
          <Pressable style={styles.receiptButton} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.receiptButtonText}>Voltar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function TransactionForm({ id, transaction }: {
  id?: string;
  transaction: Transaction | null;
}) {
  const { user } = useAuth();

  const [receipt, setReceipt] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const {
    addTransaction,
    updateTransaction,
  } = useTransactions();

  const [type, setType] =
    useState<"income" | "expense">(transaction?.type ?? "expense");

  const [amount, setAmount] = useState(transaction?.amount.toString() ?? "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [date, setDate] = useState(transaction?.date ?? new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<TransactionFormErrors>({});

  const isEditing = Boolean(id);

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

    const receiptUrl = receipt
      ? await uploadReceipt()
      : transaction?.receiptUrl ?? null;

    const transactionData = {
      type,
      amount: numericAmount,
      category: category.trim(),
      description: description.trim(),
      date,
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
