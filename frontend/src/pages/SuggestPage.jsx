// src/pages/SuggestPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  Row,
  Col,
  Card,
  Tag,
  Typography,
  Button,
  Space,
  Empty,
  Spin,
  Tooltip,
  message,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { apiGetSuggestionsGlobal } from "../lib/api";

const { Title, Text } = Typography;

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
    </div>
  );
}

export default function SuggestPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGetSuggestionsGlobal();
      // data: [{id, ten, the_loai, so_luot_choi, so_click, score, anh_cover}]
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e?.message || "Không tải được gợi ý");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ maxWidth: 1160, margin: "24px auto", padding: "0 16px" }}>
      <Space
        align="center"
        style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }}
      >
        <Title level={2} style={{ margin: 0 }}>
          Gợi ý trò chơi
        </Title>

        <Tooltip title="Làm mới danh sách">
          <Button icon={<ReloadOutlined />} onClick={load}>
            Làm mới
          </Button>
        </Tooltip>
      </Space>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
          <Spin tip="Đang tải gợi ý..." />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <Empty description="Chưa có gợi ý" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((g) => (
            <Col key={g.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                style={{ height: "100%" }}
                bodyStyle={{ display: "flex", flexDirection: "column", gap: 8 }}
                cover={
                  g.anh_cover ? (
                    <img
                      src={g.anh_cover}
                      alt={g.ten}
                      style={{ height: 160, objectFit: "cover" }}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  ) : null
                }
              >
                <Title level={5} style={{ marginBottom: 4 }}>
                  {g.ten || "Không tên"}
                </Title>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Tag color="blue">{g.the_loai || "Khác"}</Tag>
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <InfoRow label="Lượt chơi" value={g.so_luot_choi ?? 0} />
                  <InfoRow label="Lượt truy cập" value={g.so_click ?? 0} />
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
