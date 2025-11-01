# app/test_connection.py
# Test trực tiếp bằng .env để không phụ thuộc import
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()
url = os.getenv("DATABASE_URL")
if not url:
    raise RuntimeError("Missing DATABASE_URL in .env")

engine = create_engine(url, pool_pre_ping=True)

try:
    with engine.connect() as conn:
        n = conn.execute(text("SELECT COUNT(*) FROM tro_choi")).scalar()
        print(f"✅ Kết nối thành công! Số trò chơi trong DB: {n}")
except Exception as e:
    print("❌ Kết nối thất bại:", e)
