import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { auth } from "../firebaseConfig";

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleRegister() {
    if (password !== confirmPassword) {
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Criar conta</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Digite seu email"
          keyboardType="email-address"
          autoCapitalize="none"
          accessibilityLabel="Email"
        />

        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Digite sua senha"
          secureTextEntry
          accessibilityLabel="Senha"
        />

        <Text style={styles.label}>Confirmar senha</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Digite sua senha novamente"
          secureTextEntry
          accessibilityLabel="Confirmar senha"
        />

        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Criar conta"
          onPress={handleRegister}
        >
          <Text style={styles.buttonText}>Criar conta</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar para o login"
          onPress={() => router.back()}
        >
          <Text style={styles.back}>Voltar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#004D40",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#004D40",
    textAlign: "center",
    marginBottom: 28,
  },

  label: {
    fontSize: 16,
    marginBottom: 4,
  },

  input: {
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#F28C6F",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },

  back: {
    color: "#00796B",
    fontSize: 16,
    textDecorationLine: "underline",
    textAlign: "center",
  },
});