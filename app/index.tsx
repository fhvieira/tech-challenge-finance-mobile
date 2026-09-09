import { Redirect } from "expo-router";
import { signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useTransactions } from "../contexts/TransactionsContext";
import { auth, db } from "../firebaseConfig";

export default function HomeScreen() {
  const { user, loading } = useAuth();
  const { transactions } = useTransactions();

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

    await addDoc(
      collection(db, "users", user.uid, "transactions"),
      {
        type: "expense",
        amount: 120.5,
        category: "Alimentação",
        description: "Transação de teste",
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      }
    );
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

      <Pressable
        style={styles.button}
        onPress={createTestTransaction}
      >
        <Text style={styles.buttonText}>
          Criar transação teste
        </Text>
      </Pressable>
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
});