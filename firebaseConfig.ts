// Import the functions you need from the SDKs you need
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseError, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Auth, Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDyKTeaXpNsIN9fhoFg3EZRLv6N3Nr2h-0",
  authDomain: "tech-challenge-finance-mobile.firebaseapp.com",
  projectId: "tech-challenge-finance-mobile",
  storageBucket: "tech-challenge-finance-mobile.firebasestorage.app",
  messagingSenderId: "1018875833545",
  appId: "1:1018875833545:web:590b7c3638d3b4501af118"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
function initializeFirebaseAuth(): Auth {
  if (Platform.OS === "web") {
    return FirebaseAuth.getAuth(app);
  }

  // Firebase 12.18.0's public types omit this React Native export.
  const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  };

  try {
    return FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Fast Refresh can re-evaluate this module after Auth is initialized.
    if (error instanceof FirebaseError && error.code === "auth/already-initialized") {
      return FirebaseAuth.getAuth(app);
    }

    throw error;
  }
}

export const auth = initializeFirebaseAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
