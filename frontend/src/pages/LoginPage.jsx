// src/pages/Login.jsx
import { useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Typography,
  message,
  Modal,
  Alert,
} from "antd";
import {
  apiLogin,
  apiForgotPasswordRequest,
  apiForgotPasswordConfirm,
} from "../lib/api";
import { useNavigate, Link } from "react-router-dom";

const { Title, Text } = Typography;

export default function Login() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [fpForm] = Form.useForm();
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setErrorMsg("");
    setLoading(true);
    try {
      // ✅ GỌI API ĐÚNG CHỮ KÝ: (username, password)
      const data = await apiLogin(values.username.trim(), values.password);

      localStorage.setItem("auth", JSON.stringify(data));
      window.dispatchEvent(new Event("auth:changed"));
      message.success("Đăng nhập thành công!");
      navigate("/");
    } catch (e) {
      // Lấy thông điệp rõ ràng từ backend
      const detail = e?.response?.data?.detail;
      let msg = "Sai tài khoản hoặc mật khẩu."; // fallback
      if (detail && typeof detail === "object" && detail.message) msg = detail.message;
      else if (typeof detail === "string") msg = detail;
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setStep(1);
    fpForm.resetFields();
    setFpOpen(true);
  };

  const handleRequestCode = async () => {
    const { username, email } = await fpForm.validateFields(["username", "email"]);
    try {
      await apiForgotPasswordRequest({ username: username?.trim(), email: email?.trim() });
      message.success("Đã gửi mã khôi phục về email đăng ký.");
      setStep(2);
    } catch (e) {
      message.error(e.message || "Không gửi được mã. Kiểm tra lại thông tin.");
    }
  };

  const handleConfirmReset = async () => {
    const { username, code, new_password } = await fpForm.validateFields(["username", "code", "new_password"]);
    try {
      await apiForgotPasswordConfirm({ username: username.trim(), code: code.trim(), new_password });
      message.success("Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.");
      setFpOpen(false);
    } catch (e) {
      message.error(e.message || "Mã không hợp lệ hoặc đã hết hạn.");
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 16 }}>
      <Card style={{ width: 420, maxWidth: "100%" }}>
        <Title level={3} style={{ textAlign: "center" }}>Đăng nhập</Title>

        {errorMsg && (
          <Alert
            type="error"
            message={errorMsg}
            showIcon
            style={{ marginBottom: 12, borderRadius: 8, background: "#fff5f5" }}
          />
        )}

        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="username" label="Tài khoản" rules={[{ required: true, message: "Nhập tài khoản" }]}>
            <Input placeholder="Tên tài khoản" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Nhập mật khẩu" }]}>
            <Input.Password placeholder="••••••" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block>
            Đăng nhập
          </Button>
        </Form>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
          <Button type="link" onClick={openForgot}>Quên mật khẩu?</Button>
          <Text>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></Text>
        </div>
      </Card>

      {/* Modal quên mật khẩu */}
      <Modal
        open={fpOpen}
        onCancel={() => setFpOpen(false)}
        title="Khôi phục mật khẩu"
        okText={step === 1 ? "Gửi mã" : "Xác nhận"}
        onOk={step === 1 ? handleRequestCode : handleConfirmReset}
      >
        <Form form={fpForm} layout="vertical">
          <Form.Item name="username" label="Tài khoản" rules={[{ required: true, message: "Nhập tài khoản" }]}>
            <Input placeholder="Tài khoản đã đăng ký" />
          </Form.Item>

          {step === 1 ? (
            <Form.Item
              name="email"
              label="Email đã đăng ký"
              rules={[{ required: true, type: "email", message: "Nhập email hợp lệ" }]}
            >
              <Input placeholder="email@example.com" />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="code" label="Mã xác nhận" rules={[{ required: true, message: "Nhập mã xác nhận" }]}>
                <Input placeholder="6 chữ số" />
              </Form.Item>
              <Form.Item
                name="new_password"
                label="Mật khẩu mới"
                rules={[{ required: true, min: 6, message: "Tối thiểu 6 ký tự" }]}
              >
                <Input.Password placeholder="••••••" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
