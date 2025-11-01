// Dùng đúng host/protocol của trang để tránh lệch localhost ↔ 127.0.0.1 (CORS)
const host = window.location.hostname || "localhost";
const proto = window.location.protocol || "http:";
export const API = import.meta.env.VITE_API || `${proto}//${host}:8000`;

/* ------------------------- Auth token helper ------------------------- */
// ✅ Xuất hàm getAuth ra ngoài để component khác (SupportChatDrawer, v.v.) import
export function getAuth() {
  try {
    const raw = localStorage.getItem("auth");
    if (!raw) return "";
    const obj = JSON.parse(raw);
    return obj?.access_token || obj?.token || "";
  } catch {
    return "";
  }
}

/* ------------------------- Core fetch wrapper ------------------------ */
/**
 * apiFetch(path, {
 *   method, headers, body,
 *   timeoutMs = 20000 // optional
 * })
 */
export async function apiFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  // Tạo URL và thêm cache-buster cho GET để chắc chắn không bị cache
  let url = path.startsWith("http") ? path : `${API}${path}`;
  if (method === "GET") {
    const u = new URL(url, window.location.origin);
    if (!u.searchParams.has("_t")) u.searchParams.set("_t", Date.now().toString());
    url = u.toString();
  }

  const headers = new Headers(options.headers || {});
  let body = options.body;
  const timeoutMs = Number(options.timeoutMs || 20000);

  // JSON encode nếu body là plain object
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  // Bearer token
  const token = getAuth();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Header chống cache
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-cache");

  // timeout via AbortController
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(new Error("Request timed out")), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      ...options,
      method,
      headers,
      body,
      signal: ac.signal,
    });
  } finally {
    clearTimeout(to);
  }

  // No Content
  if (res.status === 204) {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.response = { status: res.status, data: null };
      throw err;
    }
    return null;
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data = null;

  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      typeof data === "string"
        ? data
        : data?.detail
        ? (typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail))
        : `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    // thêm response để tương thích code bắt lỗi kiểu axios
    err.response = { status: res.status, data };
    throw err;
  }

  return data;
}

/* ========================== AUTH ==================================== */
export function apiLogin(username, password) {
  return apiFetch("/auth/login", { method: "POST", body: { username, password } });
}
export function apiRegister({ username, password, email, sdt }) {
  return apiFetch("/auth/register", { method: "POST", body: { username, password, email, sdt } });
}
export function apiMe() {
  return apiFetch("/auth/me");
}
export function apiForgotPasswordRequest({ username, email }) {
  return apiFetch("/auth/forgot-password", { method: "POST", body: { username, email } });
}
export function apiForgotPasswordConfirm({ username, code, new_password }) {
  return apiFetch("/auth/reset-password", { method: "POST", body: { username, code, new_password } });
}

/* ========================== KHU VỰC ================================== */
export function getKhuVucMenu() {
  return apiFetch("/khu-vuc/menu");
}
export function apiCreateKhuVuc(payload) {
  return apiFetch("/khu-vuc", { method: "POST", body: payload });
}
export function apiUpdateKhuVuc(id, payload) {
  return apiFetch(`/khu-vuc/${id}`, { method: "PUT", body: payload });
}
export function apiDeleteKhuVuc(id) {
  return apiFetch(`/khu-vuc/${id}`, { method: "DELETE" });
}

/* ========================== TRÒ CHƠI ================================= */
export function getTroChoiByKhu(khu_vuc_id) {
  return apiFetch(`/tro-choi/by-khu/${khu_vuc_id}`);
}
export function apiCreateGame(payload) {
  return apiFetch(`/tro-choi`, { method: "POST", body: payload });
}
export function apiUpdateGame(id, payload) {
  return apiFetch(`/tro-choi/${id}`, { method: "PUT", body: payload });
}
export function apiDeleteGame(id) {
  return apiFetch(`/tro-choi/${id}`, { method: "DELETE" });
}

/* ========================== VÉ (TICKETS) ============================= */
export function apiGetMyTickets() {
  return apiFetch(`/ve/me`);
}
export function apiBookTicket(payload) {
  return apiFetch(`/ve/book`, { method: "POST", body: payload });
}
export function apiBookGameTicket(payload) {
  return apiFetch(`/ve/book-game`, { method: "POST", body: payload });
}
export function apiCancelTicket(id) {
  return apiFetch(`/ve/cancel/${id}`, { method: "POST" });
}
export function apiMarkPaidTicket(id) {
  return apiFetch(`/ve/mark-paid/${id}`, { method: "POST" });
}
export function apiReviewTicket(id, approve) {
  return apiFetch(`/ve/review/${id}`, { method: "POST", body: { approve } });
}
export const apiAdminReviewTicket = apiReviewTicket;
export function apiAdminListTickets({ status, q = "", page = 1, page_size = 20 } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (q) qs.set("q", q);
  qs.set("page", page);
  qs.set("page_size", page_size);
  return apiFetch(`/ve/admin/list?${qs.toString()}`);
}

/* ========================== SỰ KIỆN ======================== */
export function apiGetEvents({ q = "", status = "", page = 1, page_size = 20 } = {}) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  qs.set("page", page);
  qs.set("page_size", page_size);
  return apiFetch(`/su-kien?${qs.toString()}`);
}
export function apiCreateEvent(payload) {
  return apiFetch(`/su-kien`, { method: "POST", body: payload });
}
export function apiUpdateEvent(id, payload) {
  return apiFetch(`/su-kien/${id}`, { method: "PUT", body: payload });
}
export function apiDeleteEvent(id) {
  return apiFetch(`/su-kien/${id}`, { method: "DELETE" });
}
export async function apiListOpenEvents() {
  const res = await apiGetEvents({ status: "OPEN", page_size: 100 });
  return Array.isArray(res) ? res : res?.items || [];
}

/* ========================== GỢI Ý ==================================== */
export function apiClickGame(tro_choi_id) {
  return apiFetch(`/goi-y/click`, { method: "POST", body: { tro_choi_id } });
}
export function apiGetSuggestionsGlobal() {
  return apiFetch(`/goi-y/global`);
}

/* ========================== KHUYẾN MÃI =============================== */
export function apiGetPromotions() {
  return apiFetch(`/khuyen-mai`);
}
export const apiGetPromos = apiGetPromotions;
export function apiCreatePromo(payload) {
  return apiFetch("/khuyen-mai", { method: "POST", body: payload });
}
export function apiUpdatePromo(id, payload) {
  return apiFetch(`/khuyen-mai/${id}`, { method: "PUT", body: payload });
}
export function apiDeletePromo(id) {
  return apiFetch(`/khuyen-mai/${id}`, { method: "DELETE" });
}
export function apiTogglePromo(id) {
  return apiFetch(`/khuyen-mai/${id}/toggle`, { method: "POST" });
}
export function apiPromoPreview(amount, su_kien_id) {
  const qs = new URLSearchParams();
  qs.set("amount", String(amount ?? 0));
  if (su_kien_id) qs.set("su_kien_id", String(su_kien_id));
  return apiFetch(`/ve/promo-preview?${qs.toString()}`);
}
export const apiPromoPreviewEvent = (amount, su_kien_id) => apiPromoPreview(amount, su_kien_id);
export const apiPromoPreviewGame = (amount) => apiPromoPreview(amount, undefined);
export function apiApplicablePromos(amount, su_kien_id) {
  const qs = new URLSearchParams();
  qs.set("amount", String(amount ?? 0));
  if (su_kien_id) qs.set("su_kien_id", String(su_kien_id));
  return apiFetch(`/ve/applicable-promos?${qs.toString()}`);
}

/* ========================== KHÁCH HÀNG =============================== */
export function apiGetCustomers({ q = "", page = 1, page_size = 20 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size });
  return apiFetch(`/khach-hang?${qs.toString()}`);
}
export function apiGetCustomer(id) {
  return apiFetch(`/khach-hang/${id}`);
}
export function apiCreateCustomer(payload) {
  return apiFetch(`/khach-hang`, { method: "POST", body: payload });
}
export function apiUpdateCustomer(id, payload) {
  return apiFetch(`/khach-hang/${id}`, { method: "PUT", body: payload });
}
export function apiDeleteCustomer(id) {
  return apiFetch(`/khach-hang/${id}`, { method: "DELETE" });
}

/* ========================== NHÂN VIÊN ================================ */
export function apiGetStaff({ q = "", page = 1, page_size = 20 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size });
  return apiFetch(`/nhan-vien?${qs.toString()}`);
}
export function apiGetOneStaff(id) {
  return apiFetch(`/nhan-vien/${id}`);
}
export function apiCreateStaff(payload) {
  return apiFetch(`/nhan-vien`, { method: "POST", body: payload });
}
export function apiUpdateStaff(id, payload) {
  return apiFetch(`/nhan-vien/${id}`, { method: "PUT", body: payload });
}
export function apiDeleteStaff(id) {
  return apiFetch(`/nhan-vien/${id}`, { method: "DELETE" });
}

/* ========================== ADMIN USERS ============================== */
export function apiAdminListUsers({ q = "", role, page = 1, page_size = 20 } = {}) {
  const qs = new URLSearchParams({ q, page, page_size });
  if (role) qs.set("role", role);
  return apiFetch(`/admin/users?${qs.toString()}`);
}
export function apiAdminSetRole(id, role) {
  return apiFetch(`/admin/users/${id}/role`, { method: "POST", body: { role } });
}
export function apiAdminResetPwd(id, new_password) {
  return apiFetch(`/admin/users/${id}/reset-password`, { method: "POST", body: { new_password } });
}
export function apiAdminEnsureProfile(id) {
  return apiFetch(`/admin/users/${id}/ensure-profile`, { method: "POST" });
}
export function apiAdminDeleteUser(id) {
  return apiFetch(`/admin/users/${id}`, { method: "DELETE" });
}

/* ========================== LEADERBOARD & GAMIFY ===================== */
export function apiGetLeaderboardWeekly(limit) {
  const qs = new URLSearchParams();
  if (limit) qs.set("limit", String(limit));
  return apiFetch(`/leaderboard/weekly${qs.toString() ? `?${qs.toString()}` : ""}`);
}
export function apiMyScore() {
  return apiFetch(`/gamify/me/score`);
}
export function apiMyChallenges() {
  return apiFetch(`/gamify/me/challenges`);
}

/* ---------- Admin thử thách (CRUD) ---------------------------------- */
export function apiListChallenges({ start, end } = {}) {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  return apiFetch(`/gamify/challenges${qs.toString() ? `?${qs.toString()}` : ""}`);
}
export function apiCreateChallenge(payload) {
  return apiFetch(`/gamify/challenges`, { method: "POST", body: payload });
}
export function apiUpdateChallenge(ma, payload) {
  return apiFetch(`/gamify/challenges/${encodeURIComponent(ma)}`, { method: "PUT", body: payload });
}
export function apiDeleteChallenge(ma) {
  return apiFetch(`/gamify/challenges/${encodeURIComponent(ma)}`, { method: "DELETE" });
}
