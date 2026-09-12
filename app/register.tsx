import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
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

type RegisterErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<RegisterErrors>({});
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

  function handleConfirmPasswordChange(value: string) {
    setConfirmPassword(value);
    setErrors((current) => ({ ...current, confirmPassword: undefined }));
    setFormError("");
  }

  async function handleRegister() {
    const nextErrors: RegisterErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Informe seu email.";
    }

    if (!password.trim()) {
      nextErrors.password = "Informe sua senha.";
    }

    if (!confirmPassword.trim()) {
      nextErrors.confirmPassword = "Confirme sua senha.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "As senhas não conferem.";
    }

    setErrors(nextErrors);
    setFormError("");

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.replace("/");
    } catch (error) {
      console.log(error);
      setFormError("Não foi possível criar sua conta. Confira os dados e tente novamente.");
    }
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
        <View style={styles.card}>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.description}>
            Preencha os campos abaixo para criar sua conta.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[
              styles.input,
              errors.email && formValidationStyles.errorInput,
            ]}
            value={email}
            onChangeText={handleEmailChange}
            placeholder="Digite seu e-mail"
            placeholderTextColor="#777"
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel="Email"
            accessibilityHint={errors.email}
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
            style={[
              styles.input,
              errors.password && formValidationStyles.errorInput,
            ]}
            value={password}
            onChangeText={handlePasswordChange}
            placeholder="Digite sua senha"
            placeholderTextColor="#777"
            secureTextEntry
            accessibilityLabel="Senha"
            accessibilityHint={errors.password}
          />
          {errors.password && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.password}
            </Text>
          )}

          <Text style={styles.label}>Confirmar senha</Text>
          <TextInput
            style={[
              styles.input,
              errors.confirmPassword && formValidationStyles.errorInput,
            ]}
            value={confirmPassword}
            onChangeText={handleConfirmPasswordChange}
            placeholder="Confirme sua senha"
            placeholderTextColor="#777"
            secureTextEntry
            accessibilityLabel="Confirmar senha"
            accessibilityHint={errors.confirmPassword}
          />
          {errors.confirmPassword && (
            <Text
              style={formValidationStyles.errorText}
              accessibilityLiveRegion="polite"
            >
              {errors.confirmPassword}
            </Text>
          )}

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
            accessibilityLabel="Criar conta"
            onPress={handleRegister}
          >
            <Text style={styles.buttonText}>Criar conta</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => getPressedFeedbackStyle(pressed)}
            accessibilityRole="button"
            accessibilityLabel="Voltar para o login"
            onPress={() => router.back()}
          >
            <Text style={styles.back}>Voltar</Text>
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

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#004D40",
    textAlign: "center",
    marginBottom: 8,
  },

  description: {
    color: "#555",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
  },

  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
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
