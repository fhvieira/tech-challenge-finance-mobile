import { Stack } from "expo-router";
import { AuthProvider } from "../contexts/AuthContext";
import { TransactionsProvider } from "../contexts/TransactionsContext";
import { db } from "../firebaseConfig";
import { CreateTransaction } from "../src/application/use-cases/CreateTransaction";
import { DeleteTransaction } from "../src/application/use-cases/DeleteTransaction";
import { GetTransactionById } from "../src/application/use-cases/GetTransactionById";
import { GetFinancialSummary } from "../src/application/use-cases/GetFinancialSummary";
import { ObserveTransactions } from "../src/application/use-cases/ObserveTransactions";
import { UpdateTransaction } from "../src/application/use-cases/UpdateTransaction";
import { FirebaseTransactionRepository } from "../src/infrastructure/repositories/FirebaseTransactionRepository";

const transactionRepository = new FirebaseTransactionRepository(db);
const transactionUseCases = {
  create: new CreateTransaction(transactionRepository),
  update: new UpdateTransaction(transactionRepository),
  delete: new DeleteTransaction(transactionRepository),
  observe: new ObserveTransactions(transactionRepository),
  getById: new GetTransactionById(transactionRepository),
  getFinancialSummary: new GetFinancialSummary(transactionRepository),
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <TransactionsProvider useCases={transactionUseCases}>
        <Stack
          screenOptions={{
            headerBackTitle: "Voltar",
            headerTransparent: false,
          }}
        >
          <Stack.Screen
            name="login"
            options={{
              headerShown: false,
              title: "Entrar",
            }}
          />
          <Stack.Screen
            name="register"
            options={{
              headerShown: false,
              title: "Criar conta",
            }}
          />
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
              title: "Início",
            }}
          />
          <Stack.Screen
            name="transaction-form"
            options={{
              title: "Nova transação",
              headerBackTitle: "Início",
            }}
          />
          <Stack.Screen
            name="transactions"
            options={{
              title: "Transações",
              headerBackTitle: "Início",
            }}
          />
        </Stack>
      </TransactionsProvider>
    </AuthProvider>
  );
}
