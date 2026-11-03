import { Stack } from "expo-router";
import { AuthProvider } from "../contexts/AuthContext";
import { TransactionsProvider } from "../contexts/TransactionsContext";
import { db } from "../firebaseConfig";
import { FirebaseTransactionRepository } from "../src/infrastructure/repositories/FirebaseTransactionRepository";

const transactionRepository = new FirebaseTransactionRepository(db);

export default function RootLayout() {
  return (
    <AuthProvider>
      <TransactionsProvider repository={transactionRepository}>
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
