import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthContext } from "./auth-context";
import { appHref } from "./routing";

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? "";
const authority = import.meta.env.VITE_ENTRA_AUTHORITY ?? "";
const apiScope = import.meta.env.VITE_ENTRA_API_SCOPE ?? "";
const configured = Boolean(clientId && authority && apiScope);
const redirectUri = new URL(appHref(), window.location.origin).toString();
const msal = configured
  ? new PublicClientApplication({
      auth: {
        clientId,
        authority,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
        knownAuthorities: [new URL(authority).hostname],
      },
      cache: {
        cacheLocation: "localStorage",
      },
    })
  : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [initializing, setInitializing] = useState(configured);

  useEffect(() => {
    if (!msal) return;
    void msal
      .initialize()
      .then(() => msal.handleRedirectPromise())
      .then((result) => {
        const nextAccount = result?.account ?? msal.getAllAccounts()[0] ?? null;
        if (nextAccount) msal.setActiveAccount(nextAccount);
        setAccount(nextAccount);
      })
      .finally(() => setInitializing(false));
  }, []);

  const signIn = useCallback(async () => {
    if (!msal) return;
    await msal.loginRedirect({
      scopes: [apiScope],
      prompt: "select_account",
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!msal) return;
    await msal.logoutRedirect({ account: account ?? undefined });
  }, [account]);

  const getAccessToken = useCallback(async () => {
    if (!msal || !account) throw new Error("Sign in to access your farm projects.");
    try {
      const result = await msal.acquireTokenSilent({
        account,
        scopes: [apiScope],
      });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await msal.acquireTokenRedirect({ account, scopes: [apiScope] });
      }
      throw error;
    }
  }, [account]);

  const value = useMemo(
    () => ({
      account,
      configured,
      initializing,
      signIn,
      signOut,
      getAccessToken,
    }),
    [account, getAccessToken, initializing, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
