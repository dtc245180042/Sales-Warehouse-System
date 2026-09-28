from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "mysql+pymysql://root:@localhost:3306/sales_warehouse_db"

try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base = declarative_base()

    connection = engine.connect()
    print("====================================")
    print(" KẾT NỐI DATABASE THÀNH CÔNG RỒI! ")
    print("====================================")
    connection.close()
except Exception as e:
    print("Kết nối thất bại, lỗi:", e)