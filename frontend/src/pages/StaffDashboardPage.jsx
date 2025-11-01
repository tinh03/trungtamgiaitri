import { Card, Space, Button, Typography } from "antd";
import { Link } from "react-router-dom";

const { Title, Text } = Typography;

export default function StaffDashboardPage() {
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      <Title level={3} style={{ marginBottom: 16 }}>Bảng điều khiển Nhân viên</Title>

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card>
          <Space direction="vertical">
            <Text>Phê duyệt / hủy vé khách hàng (GAME & EVENT).</Text>
            <Space>
              <Button type="primary">
                <Link to="/staff/tickets">Mở trang Duyệt vé</Link>
              </Button>
            </Space>
          </Space>
        </Card>

        <Card>
          <Space direction="vertical">
            <Text>Trò chuyện hỗ trợ khách hàng theo từng tài khoản.</Text>
            <Space>
              <Button type="primary">
                <Link to="/staff/support">Mở trang Chat CSKH</Link>
              </Button>
            </Space>
          </Space>
        </Card>
      </Space>
    </div>
  );
}
