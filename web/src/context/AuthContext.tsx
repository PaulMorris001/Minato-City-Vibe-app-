import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken } from "../lib/api";

export interface User {
  id: string;
  username: string;
  email: string;
  isVendor?: boolean;
  emailVerifiedAt?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Set after register when the account still needs email verification. */
  needsVerification: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  verifyEmail: (otp: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const USER_KEY = "cv_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });
  const [token, setTok] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);

  // Revalidate the stored token on load — clears a stale session.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api<{ user: User }>("/profile");
        if (!cancelled) persist(data.user, token);
      } catch {
        if (!cancelled) persist(null, null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(u: User | null, t: string | null) {
    setUser(u);
    setTok(t);
    setToken(t);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }

  async function login(email: string, password: string) {
    const data = await api<{ token: string; user: User }>("/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setNeedsVerification(false);
    persist(data.user, data.token);
  }

  async function register(username: string, email: string, password: string) {
    const data = await api<{ token: string; user: User; requiresEmailVerification: boolean }>(
      "/register",
      {
        method: "POST",
        body: { username, email, password, termsAccepted: true },
        auth: false,
      }
    );
    // The register token authenticates the OTP verification call.
    persist(data.user, data.token);
    setNeedsVerification(!!data.requiresEmailVerification);
  }

  async function verifyEmail(otp: string) {
    await api("/auth/verify-signup-email", { method: "POST", body: { otp } });
    setNeedsVerification(false);
    if (user) persist({ ...user, emailVerifiedAt: new Date().toISOString() }, token);
  }

  function logout() {
    setNeedsVerification(false);
    persist(null, null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, needsVerification, login, register, verifyEmail, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
