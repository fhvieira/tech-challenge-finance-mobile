import { onAuthStateChanged, User } from "firebase/auth";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
    useSyncExternalStore,
} from "react";
import { Text, View } from "react-native";
import { auth, authPersistenceStatus } from "../firebaseConfig";

type AuthContextType = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const storageState = useSyncExternalStore(
    authPersistenceStatus.subscribe, authPersistenceStatus.getSnapshot, authPersistenceStatus.getSnapshot
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user: storageState.ready ? user : null, loading: loading || !storageState.ready }}>
      {storageState.error ? (
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="assertive">{storageState.error}</Text>
          <Text>Feche e reabra o aplicativo para tentar novamente. A sessão antiga não será recuperada.</Text>
        </View>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
