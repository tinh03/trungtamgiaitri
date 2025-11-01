import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { apiMe } from "../lib/api";

const AuthContext = createContext(null);

/** Đọc auth từ localStorage */
function readStoredAuth() {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const access_token = obj.access_token ?? obj.token ?? "";
    const role = obj.role ?? "CUSTOMER";
    const username = obj.username ?? "";
    if (!access_token) return null;
    return { access_token, role, username, token: access_token };
  } catch {
    localStorage.removeItem("auth");
    return null;
  }
}

export function AuthProvider({ children }) {
  // khởi tạo từ storage để F5 không mất phiên
  const [user, setUser] = useState(() => readStoredAuth());
  const [loading, setLoading] = useState(true);

  /** Đồng bộ user từ token -> gọi /auth/me */
  const hydrate = useCallback(async () => {
    setLoading(true);
    const stored = readStoredAuth();
    if (!stored) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiMe(); // { user_id, username, role }
      const next = {
        access_token: stored.access_token,
        token: stored.access_token,
        username: me.username ?? stored.username ?? "",
        role: me.role ?? stored.role ?? "CUSTOMER",
      };
      setUser(next);
      localStorage.setItem("auth", JSON.stringify(next));
    } catch {
      // token hết hạn/hỏng
      localStorage.removeItem("auth");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // chạy khi app mount
    hydrate();

    // lắng nghe thay đổi từ tab khác
    const onStorage = (e) => {
      if (e.key === "auth") hydrate();
    };
    window.addEventListener("storage", onStorage);

    // lắng nghe custom event trong cùng tab
    const onAuthChanged = () => hydrate();
    window.addEventListener("auth:changed", onAuthChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("auth:changed", onAuthChanged);
    };
  }, [hydrate]);

  // Đăng nhập: lưu token + role + username -> bắn event để UI cập nhật ngay
  const login = useCallback((payload) => {
    const access_token = payload?.access_token ?? payload?.token ?? "";
    const role = payload?.role ?? "CUSTOMER";
    const username = payload?.username ?? "";
    const data = { access_token, token: access_token, role, username };
    localStorage.setItem("auth", JSON.stringify(data));
    setUser(data);
    window.dispatchEvent(new Event("auth:changed"));
  }, []);

  // Đăng xuất
  const logout = useCallback(() => {
    localStorage.removeItem("auth");
    setUser(null);
    window.dispatchEvent(new Event("auth:changed"));
  }, []);

  const value = useMemo(() => {
    const isLoggedIn = !!user?.access_token;
    const role = user?.role ?? "CUSTOMER";
    const isAdmin = role === "ADMIN";
    const hasRole = (...roles) => roles.includes(role);
    const authHeader = isLoggedIn
      ? { Authorization: `Bearer ${user.access_token}` }
      : {};
    return {
      user,            // { access_token, token, role, username }
      role,            // "ADMIN" | "STAFF" | "CUSTOMER"
      isLoggedIn,
      isAdmin,
      hasRole,
      authHeader,
      loading,
      login,
      logout,
    };
  }, [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
