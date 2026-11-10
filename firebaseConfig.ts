// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
import { initializeNativeAuth } from "./src/infrastructure/auth/initializeNativeAuth";

function requiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Configuração Firebase ausente: ${name}. Preencha o .env e recarregue o aplicativo.`);
  }
  return value.trim();
}

// Static property access is required for Expo's EXPO_PUBLIC_* substitution.
const firebaseConfig = {
  apiKey: requiredEnv("EXPO_PUBLIC_FIREBASE_API_KEY", process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: requiredEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: requiredEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  storageBucket: requiredEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: requiredEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
  appId: requiredEnv("EXPO_PUBLIC_FIREBASE_APP_ID", process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const nativeAuth = Platform.OS === "web" ? null : initializeNativeAuth(app);
const webStorageState = { ready: true, error: null };
export const auth = nativeAuth?.auth ?? FirebaseAuth.getAuth(app);
export const authPersistenceStatus = nativeAuth?.storage ?? {
  getSnapshot: () => webStorageState,
  subscribe: (_listener: () => void) => () => {},
};
export const db = getFirestore(app);
export const storage = getStorage(app);
