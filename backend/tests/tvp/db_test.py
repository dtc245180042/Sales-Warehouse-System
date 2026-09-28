from sqlalchemy import create_engine
import pymysql

# Chuỗi kết nối đến MySQL của XAMPP
DATABASE_URL = "mysql+pymysql://root:@localhost:3306/sales_warehouse_db"

try:
    engine = create_engine(DATABASE_URL)
    connection = engine.connect()
    print("====================================")
    print(" KẾT NỐI DATABASE THÀNH CÔNG RỒI! ")
    print("====================================")
    connection.close()
except Exception as e:
    print("Kết nối thất bại, lỗi:", e)