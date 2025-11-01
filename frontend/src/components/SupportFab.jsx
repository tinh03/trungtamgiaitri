import { useState } from "react";
import { FloatButton } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import SupportChatDrawer from "./SupportChatDrawer";
import { useAuth } from "../auth/AuthContext";

export default function SupportFab() {
  const { user } = useAuth();
  const isCustomer = user?.role === "CUSTOMER";
  const [open, setOpen] = useState(false);

  if (!isCustomer) return null;

  return (
    <>
      <FloatButton
        icon={<MessageOutlined />}
        tooltip="Hỗ trợ khách hàng"
        onClick={() => setOpen(true)}
      />
      <SupportChatDrawer
        open={open}
        onClose={() => setOpen(false)}
        isStaff={false}
      />
    </>
  );
}
