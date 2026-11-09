import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { FirebaseError } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Persistence } from "firebase/auth";
import { createSecureAuthStorage } from "./SecureAuthStorage";

type Entry = {
  storage: ReturnType<typeof createSecureAuthStorage>;
  persistence: Persistence;
  initialized: boolean;
};

// Fast Refresh re-evaluates modules while Firebase keeps its Auth instance.
// Keep the associated adapter/status and persistence constructor as well.
// This map contains no serialized users/tokens and disappears on a full reload.
const scope = globalThis as typeof globalThis & {
  __financeSecureAuth?: WeakMap<FirebaseApp, Entry>;
};
const instances = scope.__financeSecureAuth ??= new WeakMap<FirebaseApp, Entry>();

export function initializeNativeAuth(app: FirebaseApp) {
  let entry = instances.get(app);
  if (!entry) {
    const storage = createSecureAuthStorage(SecureStore, AsyncStorage, {
      apiKey: app.options.apiKey!, appName: app.name,
    });
    // Firebase 12.18.0 exports this at runtime for React Native, but omits it
    // from the public default-platform types. Keep the structural storage API.
    const { getReactNativePersistence } = FirebaseAuth as typeof FirebaseAuth & {
      getReactNativePersistence(adapter: Pick<typeof storage, "getItem" | "setItem" | "removeItem">): Persistence;
    };
    entry = { storage, persistence: getReactNativePersistence(storage), initialized: false };
    instances.set(app, entry);
  }
  try {
    const auth = FirebaseAuth.initializeAuth(app, { persistence: entry.persistence });
    entry.initialized = true;
    return { auth, storage: entry.storage };
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "auth/already-initialized") {
      // An Auth created by the previous AsyncStorage implementation must not
      // masquerade as the secure one on the first Fast Refresh after this update.
      if (!entry.initialized) entry.storage.requireRestart();
      return { auth: FirebaseAuth.getAuth(app), storage: entry.storage };
    }
    throw error;
  }
}
