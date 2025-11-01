// src/App.jsx
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from "react-router-dom";
import { Layout, Menu, Space, Tag, Button } from "antd";
import { useMemo } from "react";

import HomePage from "./pages/HomePage.jsx";
import AreasPage from "./pages/AreasPage.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import PromotionPage from "./pages/PromotionPage.jsx";
import SuggestPage from "./pages/SuggestPage.jsx";
import MyTicketsPage from "./pages/MyTicketsPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import AdminUsersPage from "./pages/AdminUsersPage.jsx";
import AdminTicketsPage from "./pages/AdminTicketsPage.jsx";

// NEW
import LeaderboardPage from "./pages/LeaderboardPage.jsx";
import MyGamify from "./pages/MyGamify.jsx";

// STAFF
import StaffDashboardPage from "./pages/StaffDashboardPage.jsx";
import StaffTickets from "./pages/StaffTickets.jsx";
import StaffSupport from "./pages/StaffSupport.jsx";

// FAB chat chỉ cho CUSTOMER
import SupportFab from "./components/SupportFab.jsx";

import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import "./App.css";

const { Header, Content } = Layout;

/* ===== Helpers tier ===== */
const TIER_LABELS = { STANDARD: "Thường", SILVER: "Bạc", GOLD: "Vàng", DIAMOND: "Kim cương" };
const tierTagColor = (code) => {
  switch ((code || "").toUpperCase()) {
    case "DIAMOND": return "cyan";
    case "GOLD": return "gold";
    case "SILVER": return "#bfbfbf";
    default: return "blue";
  }
};
function normalizeTier(obj) {
  if (!obj) return null;
  let code = obj.tier_code || obj.tierCode || obj.tier || obj.hang_thanh_vien || obj.hangThanhVien;
  let label = obj.tier_label || obj.tierLabel || obj.tier_name || obj.tierName;
  if (code) code = String(code).toUpperCase();
  if (code && !label) label = TIER_LABELS[code];
  const points = obj.diem_tich_luy ?? obj.diem ?? obj.total_points ?? obj.totalPoints ?? null;
  if (!code && points != null) {
    if (points >= 1000) code = "DIAMOND";
    else if (points >= 500) code = "GOLD";
    else if (points >= 100) code = "SILVER";
    else code = "STANDARD";
    label = TIER_LABELS[code];
  }
  return code && label ? { code, label } : null;
}

/* ---------------- TopBar ---------------- */
function TopBar() {
  const { isLoggedIn, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const tier = useMemo(() => normalizeTier(user), [user]);

  return (
    <>
      {/* Ribbon */}
      <div
        style={{
          background: "linear-gradient(90deg, #ffb6d9 0%, #ff8ac8 50%, #ff9fcf 100%)",
          color: "#fff",
          fontSize: 14,
          lineHeight: "40px",
          padding: "0 24px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <Space size="large">
          <span>📞 0337033697</span>
          <span>✉️ trungtamgiaitri@gmail.com</span>
          <span>🕘 9:00 - 22:00</span>
          <span>💖 Đặt vé nhanh</span>
        </Space>

        <Space>
          {!isLoggedIn ? (
            <>
              <Button type="link" style={{ color: "#fff" }} onClick={() => navigate("/login")}>
                Đăng nhập
              </Button>
              <Button
                style={{ background: "#fff", color: "#e91e63", borderColor: "#fff", fontWeight: 600 }}
                onClick={() => navigate("/register")}
              >
                Đăng ký
              </Button>
            </>
          ) : (
            <>
              {isAdmin ? (
                <Tag color="magenta" style={{ marginRight: 0 }}>ADMIN</Tag>
              ) : tier ? (
                <Tag color={tierTagColor(tier.code)} style={{ marginRight: 0 }}>{tier.label}</Tag>
              ) : null}

              <Button ghost onClick={() => navigate("/")}>{user?.username}</Button>
              <Button
                style={{ background: "#fff", color: "#e91e63", borderColor: "#fff", fontWeight: 600 }}
                onClick={logout}
              >
                Đăng xuất
              </Button>
            </>
          )}
        </Space>
      </div>

      {/* Header */}
      <Header
        style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "linear-gradient(180deg, #ffc0da 0%, #ff91b9 50%, #f471a2 100%)",
          borderBottom: "1px solid rgba(255,255,255,.35)",
          boxShadow: "0 3px 10px rgba(0,0,0,.15)",
          display: "flex", alignItems: "center", gap: 16,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 700, marginRight: 16 }}>
          <Link to="/" style={{ color: "#fff" }}>💗 Trung Tâm Giải Trí</Link>
        </div>

        <NavMenu />
      </Header>
    </>
  );
}

/* ---------------- Menu tách riêng để dùng hook an toàn ---------------- */
function NavMenu() {
  const { user, isAdmin } = useAuth();
  const role = (user?.role || "").toUpperCase();
  const isStaff = role === "STAFF" || role === "ADMIN";

  const items = [
    { key: "home", label: <Link to="/">TRANG CHỦ</Link> },
    { key: "about", label: <Link to="/about">GIỚI THIỆU</Link> },
    {
      key: "areas",
      label: "KHU VỰC",
      children: [
        { key: "areas-1", label: <Link to="/areas?floor=1">Khu trò chơi thể thao</Link> },
        { key: "areas-2", label: <Link to="/areas?floor=2">Khu trò chơi điện tử</Link> },
        { key: "areas-3", label: <Link to="/areas?floor=3">Khu VR</Link> },
        { key: "areas-all", label: <Link to="/areas">Tất cả khu</Link> },
      ],
    },
    { key: "events", label: <Link to="/events">SỰ KIỆN</Link> },
    { key: "promos", label: <Link to="/promotions">KHUYẾN MÃI</Link> },
    { key: "suggest", label: <Link to="/suggest">GỢI Ý</Link> },
    { key: "tickets", label: <Link to="/tickets">VÉ CỦA TÔI</Link> },
    { key: "leaderboard", label: <Link to="/leaderboard">BẢNG XẾP HẠNG</Link> },
    { key: "mygamify", label: <Link to="/me/gamify">THỬ THÁCH TUẦN</Link> },
  ];

  if (isAdmin) {
    items.push({ key: "admin", label: <Link to="/admin">BẢNG ĐIỀU KHIỂN</Link> });
  }
  if (isStaff && !isAdmin) {
    items.push({
      key: "staff",
      label: "BẢNG NHÂN VIÊN",
      children: [
        { key: "staff-index", label: <Link to="/staff">Tổng quan</Link> },
        { key: "staff-tickets", label: <Link to="/staff/tickets">Duyệt vé</Link> },
        { key: "staff-support", label: <Link to="/staff/support">Chat CSKH</Link> },
      ],
    });
  }
  if (isAdmin) {
    items.push({
      key: "staff-admin",
      label: "NHÂN VIÊN",
      children: [
        { key: "staff-index-a", label: <Link to="/staff">Tổng quan</Link> },
        { key: "staff-tickets-a", label: <Link to="/staff/tickets">Duyệt vé</Link> },
        { key: "staff-support-a", label: <Link to="/staff/support">Chat CSKH</Link> },
      ],
    });
  }

  return (
    <Menu
      theme="dark"
      mode="horizontal"
      selectable={false}
      style={{ flex: 1, background: "transparent" }}
      items={items}
    />
  );
}

/* -------- Route guard -------- */
function Private({ children }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

/* -------- AppShell -------- */
function AppShell() {
  const { isAdmin, isLoggedIn, user } = useAuth();
  const role = (user?.role || "").toUpperCase();
  const isStaff = role === "STAFF" || role === "ADMIN";
  const isCustomer = role === "CUSTOMER";

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <TopBar />
      <Content style={{ background: "transparent" }}>
        <Routes>
          {/* PUBLIC */}
          <Route path="/" element={<HomePage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/promotions" element={<PromotionPage />} />
          <Route path="/suggest" element={<SuggestPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* REQUIRE LOGIN */}
          <Route path="/tickets" element={<Private><MyTicketsPage /></Private>} />
          <Route path="/me/gamify" element={<Private><MyGamify /></Private>} />

          {/* ADMIN */}
          {isAdmin ? (
            <>
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/tickets" element={<AdminTicketsPage />} />
            </>
          ) : (
            <Route path="/admin/*" element={<Navigate to="/login" replace />} />
          )}

          {/* STAFF (ADMIN cũng truy cập được) */}
          {isStaff ? (
            <>
              <Route path="/staff" element={<StaffDashboardPage />} />
              <Route path="/staff/tickets" element={<StaffTickets />} />
              <Route path="/staff/support" element={<StaffSupport />} />
            </>
          ) : (
            <Route path="/staff/*" element={<Navigate to="/login" replace />} />
          )}

          {/* FALLBACK */}
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Content>

      {/* FAB chat chỉ cho KH */}
      {isLoggedIn && isCustomer && <SupportFab />}
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
