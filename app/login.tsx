import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { formValidationStyles } from "../constants/formValidationStyles";
import { getPressedFeedbackStyle } from "../constants/pressableFeedback";
import { auth } from "../firebaseConfig";

type LoginErrors = {
  email?: string;
  password?: string;
};

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState("");

  function handleEmailChange(value: string) {
    setEmail(value);
    setErrors((current) => ({ ...current, email: undefined }));
    setFormError("");
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    setErrors((current) => ({ ...current, password: undefined }));
    setFormError("");
  }

  async function handleLogin() {
    const nextErrors: LoginErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Informe seu email.";
    }

    if (!password.trim()) {
      nextErrors.password = "Informe sua senha.";
    }

    setErrors(nextErrors);
    setFormError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (error) {
      console.log(error);
      setFormError("Não foi possível entrar. Confira seu email e senha.");
    }
  }

  function handleForgotPassword() {
    setFormError("A recuperação de senha ainda não está disponível.");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={Keyboard.dismiss}
        onTouchStart={Keyboard.dismiss}
      >
        <View style={styles.loginCard}>
          <Text style={styles.title}>Login</Text>

          <Text style={styles.label}>Email</Text>

          <TextInput
            value={email}
            onChangeText={handleEmailChange}
            placeholder="Digite seu e-mail"
            placeholderTextColor="#777"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
            accessibilityHint={errors.email}
            style={[
              styles.input,
              errors.email && formValidationStyles.errorInput,
            ]}
          />
          {errors.email && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.email}
            </Text>
          )}

          <Text style={styles.label}>Senha</Text>

          <TextInput
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Digite sua senha"
            placeholderTextColor="#777"
            secureTextEntry
            accessibilityLabel="Senha"
            accessibilityHint={errors.password}
            style={[
              styles.input,
              errors.password && formValidationStyles.errorInput,
            ]}
          />
          {errors.password && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.password}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => getPressedFeedbackStyle(pressed)}
            accessibilityRole="button"
            accessibilityLabel="Esqueci a senha"
            onPress={handleForgotPassword}
          >
            <Text style={styles.forgotPassword}>
              Esqueci a senha!
            </Text>
          </Pressable>

          {formError && (
            <Text
              style={formValidationStyles.formErrorText}
              accessibilityLiveRegion="polite"
            >
              {formError}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              getPressedFeedbackStyle(pressed),
            ]}
            accessibilityRole="button"
            accessibilityLabel="Entrar na aplicação"
            onPress={handleLogin}
          >
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => getPressedFeedbackStyle(pressed)}
            accessibilityRole="button"
            accessibilityLabel="Criar uma nova conta"
            onPress={() => router.push("/register")}
          >
            <Text style={styles.createAccount}>
              Criar conta
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
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#004D40",
  },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 16,
    fontSize: 16,
  },

  button: {
    backgroundColor: "#F28C6F",
    paddingVertical: 16,
    borderRadius: 12,
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

  loginCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: "#004D40",
    marginBottom: 28,
  },

  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
});
