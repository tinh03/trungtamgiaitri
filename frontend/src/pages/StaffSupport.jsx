import { useEffect, useState } from "react";
import { Table, Button, Space, message } from "antd";
import { apiFetch } from "../lib/api";
import SupportChatDrawer from "../components/SupportChatDrawer";

export default function StaffSupport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatUid, setChatUid] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // Lấy 50 vé gần nhất (mọi trạng thái)
      const res = await apiFetch(`/ve/admin/list?page=1&page_size=50`);
      const items = Array.isArray(res?.items) ? res.items : [];

      // Gom theo khách (user_id)
      const map = new Map();
      items.forEach((r) => {
        const uid = r.khach_user_id ?? r.user_id ?? r?.user?.id;
        if (!uid) return;
        if (!map.has(uid)) {
          const name = r.khach_username ?? r.khach ?? r?.user?.username ?? "-";
          const lastName =
            r.ten_su_kien ||
            r.ten_tro_choi ||
            r?.su_kien?.ten ||
            r?.tro_choi?.ten ||
            "-";
          map.set(uid, {
            khach_user_id: uid,
            khach_username: name,
            last_name: lastName,
          });
        }
      });

      setRows([...map.values()]);
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách khách gần đây");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cols = [
    { title: "User ID", dataIndex: "khach_user_id", width: 120 },
    { title: "Username", dataIndex: "khach_username" },
    { title: "Gần nhất", dataIndex: "last_name" },
    {
      title: "Thao tác", width: 120,
      render: (_, r) => (
        <Button onClick={() => { setChatUid(r.khach_user_id); setChatOpen(true); }}>
          Chat
        </Button>
      )
    }
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
      <h2 style={{ margin: "16px 0 12px" }}>Hỗ trợ khách hàng (Staff)</h2>
      <Space style={{ marginBottom: 8 }}>
        <Button onClick={load}>Làm mới</Button>
      </Space>

      <Table
        rowKey="khach_user_id"
        loading={loading}
        dataSource={rows}
        columns={cols}
        pagination={false}
      />

      <SupportChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        isStaff
        targetUid={chatUid}
      />
    </div>
  );
}
