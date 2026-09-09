import { Stack } from "expo-router";
import { AuthProvider } from "../contexts/AuthContext";
import { TransactionsProvider } from "../contexts/TransactionsContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <TransactionsProvider>
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </TransactionsProvider>
    </AuthProvider>
  );
}