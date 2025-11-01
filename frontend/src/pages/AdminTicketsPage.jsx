// src/pages/AdminTicketsPage.jsx
import { useEffect, useState } from "react";
import { Table, Tag, Space, Select, Button, Input, message } from "antd";
import { apiAdminListTickets, apiAdminReviewTicket, apiFetch } from "../lib/api";

const statusOptions = [
  { value: "PENDING", label: "PENDING" },
  { value: "BOOKED",  label: "BOOKED"  },
  { value: "PAID",    label: "PAID"    },
  { value: "CANCELLED", label: "CANCELLED" },
];

function StatusTag({ s }) {
  const color =
    s === "PAID" ? "green" :
    s === "PENDING" ? "gold" :
    s === "BOOKED" ? "blue" :
    s === "CANCELLED" ? "red" : "default";
  return <Tag color={color}>{s}</Tag>;
}

export default function AdminTicketsPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("PENDING");

  const load = async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const data = await apiAdminListTickets({ status, q, page: p, page_size: ps });
      setRows(data.items || []);
      setTotal(data.total || 0);
      setPage(p);
      setPageSize(ps);
    } catch (e) {
      message.error(e.message || "Lỗi tải vé");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, pageSize); /* eslint-disable-line */ }, [q, status]);

  // ---- Actions ----
  const doApprove = async (rec) => {
    try {
      if (rec.trang_thai === "PENDING") {
        await apiAdminReviewTicket(rec.id, true);
      } else {
        await apiFetch(`/nhan-vien/ops/ve/${rec.id}/approve`, { method: "POST" });
      }
      message.success("Đã duyệt thanh toán");
      load();
    } catch (e) {
      message.error(e.message || "Thao tác duyệt thất bại");
    }
  };

  const doReturn = async (rec) => {
    try {
      if (rec.trang_thai === "PENDING") {
        // Trả về BOOKED (giữ nguyên hành vi cũ)
        await apiAdminReviewTicket(rec.id, false);
        message.success("Đã trả về BOOKED");
      } else if (rec.trang_thai === "BOOKED" || rec.trang_thai === "UNPAID") {
        // Với BOOKED/UNPAID: hủy vé qua ops
        await apiFetch(`/nhan-vien/ops/ve/${rec.id}/cancel`, { method: "POST" });
        message.success("Đã hủy vé");
      } else {
        message.info("Trạng thái hiện tại không thể trả về.");
        return;
      }
      load();
    } catch (e) {
      message.error(e.message || "Thao tác trả về thất bại");
    }
  };

  const columns = [
    { title: "ID", dataIndex: "id", width: 80 },
    { title: "Khách", dataIndex: "khach" },
    {
      title: "Sự kiện / Trò chơi",
      render: (_, r) => r?.su_kien?.ten || r?.tro_choi?.ten || "—",
    },
    { title: "SL", dataIndex: "so_luong", width: 80 },
    {
      title: "Tổng tiền",
      dataIndex: "tong_tien",
      render: (val) => (Number(val || 0)).toLocaleString("vi-VN") + " đ",
      width: 140,
    },
    {
      title: "Trạng thái",
      dataIndex: "trang_thai",
      render: (s) => <StatusTag s={s} />,
      width: 140,
    },
    {
      title: "Thao tác",
      width: 240,
      render: (_, rec) => {
        const s = rec.trang_thai;
        const canApprove = s === "PENDING" || s === "BOOKED" || s === "UNPAID";
        const canReturn  = s === "PENDING" || s === "BOOKED" || s === "UNPAID";
        return (
          <Space>
            <Button
              type="primary"
              size="small"
              disabled={!canApprove}
              onClick={() => doApprove(rec)}
            >
              Duyệt
            </Button>
            <Button
              size="small"
              danger
              disabled={!canReturn}
              onClick={() => doReturn(rec)}
            >
              Trả về
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h2 style={{ margin: "16px 0" }}>Duyệt thanh toán vé</h2>

      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search
          allowClear
          placeholder="Tìm theo username / tên sự kiện"
          onSearch={setQ}
          style={{ width: 320 }}
        />
        <Select
          value={status}
          onChange={setStatus}
          style={{ width: 180 }}
          options={statusOptions}
        />
        <Button onClick={() => load(1, pageSize)}>Làm mới</Button>
      </Space>

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
      />
    </div>
  );
}
