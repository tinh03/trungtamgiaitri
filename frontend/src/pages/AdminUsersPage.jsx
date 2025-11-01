import { useEffect, useState } from "react";
import {
  Table,
  Tag,
  Space,
  Select,
  Button,
  Input,
  message,
  Modal,
  Popconfirm,
} from "antd";
import {
  MessageOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  apiAdminListUsers,
  apiAdminSetRole,
  apiAdminResetPwd,
  apiAdminDeleteUser,
} from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import SupportChatDrawer from "../components/SupportChatDrawer"; // ✅ Drawer chat 1-1

const roleOptions = [
  { value: "ADMIN", label: "ADMIN" },
  { value: "STAFF", label: "STAFF" },
  { value: "CUSTOMER", label: "CUSTOMER" },
];

const TIER_LABEL = {
  STANDARD: "Thường",
  SILVER: "Bạc",
  GOLD: "Vàng",
  DIAMOND: "Kim cương",
};
const TIER_COLOR = {
  STANDARD: undefined,
  SILVER: "default",
  GOLD: "gold",
  DIAMOND: "cyan",
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState();

  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdId, setPwdId] = useState(null);
  const [pwd, setPwd] = useState("");

  // ✅ Drawer chat 1–1
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUid, setChatUid] = useState(null);

  // ===== Load danh sách người dùng =====
  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const data = await apiAdminListUsers({
        q,
        role: roleFilter,
        page: p,
        page_size: ps,
      });
      setRows(data.items || []);
      setTotal(data.total || 0);
      setPage(p);
      setPageSize(ps);
    } catch (e) {
      message.error(e.message || "Lỗi tải danh sách người dùng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roleFilter]);

  // ===== Các thao tác =====
  const changeRole = async (id, role) => {
    try {
      await apiAdminSetRole(id, role);
      message.success("✅ Đã đổi vai trò");
      load();
    } catch (e) {
      message.error(e.message);
    }
  };

  const openReset = (id) => {
    setPwdId(id);
    setPwd("");
    setPwdOpen(true);
  };

  const doReset = async () => {
    if (!pwd.trim()) return message.warning("Nhập mật khẩu mới");
    try {
      await apiAdminResetPwd(pwdId, pwd);
      setPwdOpen(false);
      message.success("✅ Đã đặt lại mật khẩu");
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleDelete = async (rec) => {
    try {
      if (rec.username === user?.username) {
        message.warning("Bạn không thể xoá chính mình.");
        return;
      }
      await apiAdminDeleteUser(rec.id);
      message.success("🗑️ Đã xoá tài khoản");
      load();
    } catch (e) {
      message.error(e.message || "Xoá tài khoản thất bại");
    }
  };

  const openChatWithUser = (uid) => {
    if (!uid) return message.error("Không xác định được người dùng để chat");
    setChatUid(uid);
    setChatOpen(true);
  };

  // ===== Cấu hình cột bảng =====
  const columns = [
    { title: "ID", dataIndex: "id", width: 70 },
    { title: "Username", dataIndex: "username" },
    {
      title: "Vai trò",
      dataIndex: "role",
      render: (r, rec) => (
        <Select
          value={r}
          options={roleOptions}
          style={{ width: 140 }}
          onChange={(val) => changeRole(rec.id, val)}
        />
      ),
    },
    {
      title: "Bậc",
      key: "tier",
      width: 130,
      render: (_, rec) => {
        const tier = String(rec?.hang_thanh_vien || "STANDARD").toUpperCase();
        return (
          <Tag color={TIER_COLOR[tier]}>
            {TIER_LABEL[tier] || "Thường"}
          </Tag>
        );
      },
    },
    {
      title: "Email",
      key: "email",
      render: (_, rec) => rec?.email || rec?.profile?.email || "—",
    },
    {
      title: "SĐT",
      key: "sdt",
      render: (_, rec) => rec?.sdt || rec?.profile?.sdt || "—",
    },
    {
      title: "Thao tác",
      width: 240,
      render: (_, rec) => (
        <Space>
          <Button size="small" onClick={() => openReset(rec.id)}>
            Reset mật khẩu
          </Button>

          {/* ✅ Nút CHAT riêng chỉ hiện với khách hàng */}
          {rec.role === "CUSTOMER" && (
            <Button
              icon={<MessageOutlined />}
              type="primary"
              size="small"
              onClick={() => openChatWithUser(rec.id)}
            >
              Chat
            </Button>
          )}

          <Popconfirm
            title={`Xoá tài khoản "${rec.username}"?`}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(rec)}
          >
            <Button danger size="small">
              Xoá
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ===== Render =====
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h2 style={{ margin: "16px 0" }}>Quản trị người dùng</h2>

      {/* Bộ lọc */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          allowClear
          placeholder="Tìm theo username / email / SĐT"
          onSearch={setQ}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 300 }}
        />
        <Select
          allowClear
          placeholder="Lọc theo vai trò"
          style={{ width: 200 }}
          options={roleOptions}
          value={roleFilter}
          onChange={setRoleFilter}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => load(1, pageSize)}
        >
          Làm mới
        </Button>
      </Space>

      {/* Bảng danh sách */}
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => load(p, ps),
        }}
        scroll={{ x: 850 }}
      />

      {/* Modal đặt lại mật khẩu */}
      <Modal
        open={pwdOpen}
        title="Đặt lại mật khẩu"
        onCancel={() => setPwdOpen(false)}
        onOk={doReset}
        okText="Cập nhật"
      >
        <Input.Password
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="Nhập mật khẩu mới"
        />
      </Modal>

     <SupportChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} isStaff={true} targetUid={chatUid} />
    </div>
  );
}
