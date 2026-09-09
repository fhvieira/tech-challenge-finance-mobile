import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth } from "../firebaseConfig";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (error) {
      console.log(error);
    }
  }

  return (
    <View style={styles.container}>
      <Text
        style={{
          fontSize: 28,
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        Login
      </Text>

      <Text>Email</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Digite seu email"
        keyboardType="email-address"
        autoCapitalize="none"
        accessibilityLabel="Email"
        style={styles.input}
      />

      <Text>Senha</Text>

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Digite sua senha"
        secureTextEntry
        accessibilityLabel="Senha"
        style={styles.input}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Esqueci a senha"
        onPress={() => {}}
      >
        <Text style={styles.forgotPassword}>
          Esqueci a senha!
        </Text>
      </Pressable>

      <Pressable
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Entrar na aplicação"
        onPress={handleLogin}
      >
        <Text style={styles.buttonText}>Entrar</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Criar uma nova conta"
        onPress={() => router.push("/register")}
      >
        <Text style={styles.createAccount}>
          Criar conta
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#ffffff",
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
  },

  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },

  forgotPassword: {
    color: "#2E7D6B",
    textDecorationLine: "underline",
    marginBottom: 20,
    alignSelf: "flex-start",
  },

  createAccount: {
    color: "#F28C6F",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 16,
  },
});