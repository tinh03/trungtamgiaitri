import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Typography,
  Space,
  Progress,
  Button,
  message,
  Table,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Popconfirm,
} from "antd";
import dayjs from "dayjs";
import { apiFetch } from "../lib/api";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function MyGamify() {
  // --- ME ---
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);
  const [challenges, setChallenges] = useState([]);

  // --- ADMIN area ---
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();

  const loadMe = async () => {
    setLoading(true);
    try {
      const [{ score: s = 0 } = { score: 0 }, { items = [] } = { items: [] }] =
        await Promise.all([
          apiFetch("/gamify/me/score").catch(() => ({ score: 0 })),
          apiFetch("/gamify/me/challenges").catch(() => ({ items: [] })),
        ]);
      setScore(Number(s) || 0);
      setChallenges(Array.isArray(items) ? items : []);
    } catch (e) {
      message.error(e?.message || "Không tải được dữ liệu gamification");
    } finally {
      setLoading(false);
    }
  };

  const detectAdmin = async () => {
    try {
      const me = await apiFetch("/auth/me");
      const role = String(me?.role || "").toUpperCase();
      setIsAdmin(role === "ADMIN" || role === "STAFF");
    } catch {
      setIsAdmin(false);
    }
  };

  const loadAdminList = async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const data = await apiFetch("/gamify/challenges");
      setRows(data?.items || []);
    } catch (e) {
      message.error(e?.message || "Không tải được danh sách thử thách");
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    detectAdmin();
    loadMe();
  }, []);

  useEffect(() => {
    loadAdminList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // --------- ADMIN handlers ----------
  const onCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const onEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({
      ten_thu_thach: r.ten_thu_thach,
      muc_tieu: r.muc_tieu,
      diem_thuong: r.diem_thuong,
      range: [dayjs(r.ngay_bat_dau), dayjs(r.ngay_ket_thuc)],
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/gamify/challenges/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      message.success("Đã xoá");
      await Promise.all([loadAdminList(), loadMe()]);
    } catch (e) {
      const detail = e?.data?.detail || e?.message || "Xoá thất bại";
      message.error(detail);
      throw new Error(detail); // để Popconfirm hiển thị lại nếu cần
    }
  };

  const onSubmit = async () => {
    try {
      const v = await form.validateFields();
      const [start, end] = v.range || [];
      const payload = {
        ten_thu_thach: v.ten_thu_thach,
        muc_tieu: Number(v.muc_tieu || 0),
        diem_thuong: Number(v.diem_thuong || 0),
        ngay_bat_dau: start ? start.format("YYYY-MM-DD HH:mm:ss") : undefined,
        ngay_ket_thuc: end ? end.format("YYYY-MM-DD HH:mm:ss") : undefined,
      };

      if (editing) {
        await apiFetch(`/gamify/challenges/${encodeURIComponent(editing.ma_thu_thach)}`, {
          method: "PUT",
          body: payload,
        });
        message.success("Đã cập nhật");
      } else {
        await apiFetch("/gamify/challenges", {
          method: "POST",
          body: payload,
        });
        message.success("Đã tạo");
      }

      setOpen(false);
      await Promise.all([loadAdminList(), loadMe()]);
    } catch (e) {
      if (e?.errorFields) return; // lỗi validate form
      const detail = e?.data?.detail || e?.message || "Lưu thất bại";
      message.error(detail);
    }
  };

  const adminColumns = useMemo(
    () => [
      { title: "Mã", dataIndex: "ma_thu_thach", width: 120 },
      { title: "Tên thử thách", dataIndex: "ten_thu_thach" },
      { title: "Mục tiêu", dataIndex: "muc_tieu", width: 100, align: "right" },
      {
        title: "Điểm thưởng",
        dataIndex: "diem_thuong",
        width: 120,
        align: "right",
        render: (v) => <Tag>{Number(v || 0).toLocaleString("vi-VN")}</Tag>,
      },
      { title: "Bắt đầu", dataIndex: "ngay_bat_dau", width: 160 },
      { title: "Kết thúc", dataIndex: "ngay_ket_thuc", width: 160 },
      {
        title: "Thao tác",
        key: "action",
        width: 220,
        render: (_, r) => (
          <Space>
            <Button size="small" onClick={() => onEdit(r)}>
              Sửa
            </Button>

            <Popconfirm
              title="Xoá thử thách?"
              description={`${r.ten_thu_thach} (#${r.ma_thu_thach})`}
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(r.ma_thu_thach)}
            >
              <Button size="small" danger>
                Xoá
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    []
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>
      {/* Điểm hiện tại */}
      <Card loading={loading} style={{ marginTop: 16 }}>
        <Space direction="vertical" size={4}>
          <Title level={3} style={{ margin: 0 }}>
            🎯 Điểm của tôi
          </Title>
          <Title level={2} style={{ margin: 0 }}>
            {Number(score || 0).toLocaleString("vi-VN")} điểm
          </Title>
          <Text type="secondary">Điểm thưởng được cộng khi hoàn thành thử thách tuần.</Text>
        </Space>
      </Card>

      {/* Thử thách tuần này */}
      <Card title="📅 Thử thách tuần này" style={{ marginTop: 16 }} loading={loading}>
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          {(!challenges || challenges.length === 0) && (
            <Text type="secondary">Hiện chưa có thử thách trong tuần.</Text>
          )}

          {(challenges || []).map((t) => {
            const goal = Number(t.muc_tieu || 0);
            const got = Number(t.da_dat || 0); // tương lai có thể tính từ lượt chơi
            const pct = goal > 0 ? Math.min(100, Math.round((got / goal) * 100)) : 0;
            const dStart = t.tuan_bat_dau ? String(t.tuan_bat_dau) : "";
            const dEnd = t.tuan_ket_thuc ? String(t.tuan_ket_thuc) : "";

            return (
              <Card
                key={t.ma_thu_thach}
                size="small"
                title={t.ten_thu_thach || "Thử thách"}
                extra={
                  <Button size="small" disabled>
                    Đang tham gia
                  </Button>
                }
              >
                <Space direction="vertical" style={{ width: "100%" }} size={6}>
                  <Text>
                    Mục tiêu: <b>{goal}</b> • Điểm thưởng:{" "}
                    <b>{Number(t.diem_thuong || 0).toLocaleString("vi-VN")}</b> •{" "}
                    {dStart && dEnd ? `${dStart} → ${dEnd}` : ""}
                  </Text>
                  <Progress percent={pct} />
                  <Text type="secondary">
                    {got}/{goal} lượt
                  </Text>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Card>

      {/* ADMIN – CRUD thử thách */}
      {isAdmin && (
        <Card
          title="🛠️ Quản trị – Thử thách tuần"
          style={{ marginTop: 16 }}
          extra={
            <Button type="primary" onClick={onCreate}>
              Thêm thử thách
            </Button>
          }
        >
          <Table
            rowKey={(r) => String(r.ma_thu_thach)}
            dataSource={rows}
            columns={adminColumns}
            loading={adminLoading}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      )}

      <Modal
        title={editing ? `Sửa thử thách (#${editing.ma_thu_thach})` : "Thêm thử thách"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        okText="Lưu"
        destroyOnClose
        maskClosable={false}
      >
        <Form form={form} layout="vertical">
          {/* BỎ trường nhập mã thử thách — ID tự tăng */}
          <Form.Item
            name="ten_thu_thach"
            label="Tên thử thách"
            rules={[{ required: true, message: "Nhập tên thử thách" }]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="muc_tieu" label="Mục tiêu" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="diem_thuong" label="Điểm thưởng" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="range"
            label="Thời gian áp dụng"
            rules={[{ required: true, message: "Chọn khoảng thời gian" }]}
          >
            <RangePicker showTime format="YYYY-MM-DD HH:mm:ss" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
