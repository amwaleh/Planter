import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthContext } from "./auth-context";
import {
  apiConfigured,
  getCurrentUser,
  loginUser,
  registerUser,
  type UserAccount,
} from "./api";

const TOKEN_STORAGE_KEY = "planter.accessToken";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [accessToken, setAccessToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "",
  );
  const [initializing, setInitializing] = useState(Boolean(accessToken));

  useEffect(() => {
    if (!accessToken) {
      setInitializing(false);
      return;
    }
    void getCurrentUser(accessToken)
      .then(setAccount)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setAccessToken("");
      })
      .finally(() => setInitializing(false));
  }, [accessToken]);

  const storeSession = useCallback(async (email: string, password: string) => {
    const token = await loginUser(email, password);
    const user = await getCurrentUser(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setAccessToken(token);
    setAccount(user);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => storeSession(email, password),
    [storeSession],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      await registerUser(email, password);
      await storeSession(email, password);
    },
    [storeSession],
  );

  const signOut = useCallback(async () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAccessToken("");
    setAccount(null);
  }, []);

  const getAccessToken = useCallback(async () => {
    if (!accessToken || !account) {
      throw new Error("Sign in to access your farm projects.");
    }
    return accessToken;
  }, [accessToken, account]);

  const value = useMemo(
    () => ({
      account,
      configured: apiConfigured,
      initializing,
      signIn,
      signUp,
      signOut,
      getAccessToken,
    }),
    [account, getAccessToken, initializing, signIn, signOut, signUp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
