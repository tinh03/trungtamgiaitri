import { useEffect, useMemo, useState } from "react";
import { Table, Tag, Space, Button, Input, Select, message } from "antd";
import { apiFetch } from "../lib/api";
import SupportChatDrawer from "../components/SupportChatDrawer";

const STATUS_OPTS = [
  { value: "PENDING", label: "PENDING" },
  { value: "BOOKED",  label: "BOOKED"  },
  { value: "PAID",    label: "PAID"    },
  { value: "CANCELLED", label: "CANCELLED" },
];

export default function StaffTickets() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUid, setChatUid] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
      });
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());

      // dùng endpoint đã mở quyền ADMIN+STAFF
      const res = await apiFetch(`/ve/admin/list?${qs.toString()}`);
      const items = Array.isArray(res?.items) ? res.items : (res || []);
      setRows(items);
      setTotal(Number(res?.total ?? items.length));
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách vé");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, pageSize, status]);

  const approve = async (r) => {
    try {
      await apiFetch(`/nhan-vien/ops/ve/${r.id}/approve`, { method: "POST" });
      message.success("Đã duyệt thanh toán");
      load();
    } catch (e) {
      message.error(e?.message || "Không duyệt được vé");
    }
  };

  const cancel = async (r) => {
    try {
      await apiFetch(`/nhan-vien/ops/ve/${r.id}/cancel`, { method: "POST" });
      message.success("Đã hủy vé");
      load();
    } catch (e) {
      message.error(e?.message || "Không hủy được vé");
    }
  };

  const cols = useMemo(() => [
    { title: "ID", dataIndex: "id", width: 90 },
    {
      title: "Khách",
      dataIndex: "khach_username",
      render: (v) => v || "(khách)",
    },
    {
      title: "Sự kiện / Trò chơi",
      render: (_, r) => r.ten_su_kien || r.ten_tro_choi || "-",
    },
    { title: "SL", dataIndex: "so_luong", width: 80 },
    {
      title: "Tổng tiền",
      dataIndex: "tong_tien",
      render: (n) => Number(n || 0).toLocaleString("vi-VN") + " đ",
    },
    {
      title: "Trạng thái",
      dataIndex: "trang_thai",
      width: 140,
      render: (s) => <Tag color={s==="PAID"?"green":s==="PENDING"?"orange":s==="BOOKED"?"blue":"red"}>{s}</Tag>
    },
    {
      title: "Thao tác",
      width: 260,
      render: (_, r) => {
        const s = r.trang_thai;
        const canApprove = s === "PENDING" || s === "BOOKED" || s === "UNPAID";
        const canCancel  = s === "PENDING" || s === "BOOKED" || s === "UNPAID";
        if (!canApprove && !canCancel) {
          // PAID / CANCELLED => không hiện nút nào
          return null;
        }
        return (
          <Space>
            {canApprove && (
              <Button type="primary" onClick={() => approve(r)}>Duyệt</Button>
            )}
            {canCancel && (
              <Button danger onClick={() => cancel(r)}>Hủy</Button>
            )}
            <Button onClick={() => { setChatUid(r.khach_user_id); setChatOpen(true); }}>
              Chat
            </Button>
          </Space>
        );
      },
    },
  ], []); // cột cố định

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
      <h2 style={{ margin: "16px 0 12px" }}>Duyệt thanh toán vé (Staff)</h2>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          placeholder="Tìm theo username / tên sự kiện"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => { setPage(1); load(); }}
          style={{ width: 320 }}
        />
        <Select
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={STATUS_OPTS}
          style={{ width: 160 }}
        />
        <Button onClick={() => { setPage(1); load(); }}>Làm mới</Button>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={cols}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          locale: { items_per_page: "/ trang" }
        }}
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
