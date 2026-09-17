import type { AccountInfo } from "@azure/msal-browser";
import { createContext, useContext } from "react";

export interface AuthContextValue {
  account: AccountInfo | null;
  configured: boolean;
  initializing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
