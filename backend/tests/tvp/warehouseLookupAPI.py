MOCK_WAREHOUSES = [
    {"id": "KHO_HN_01", "name": "Kho Trung Tâm Hà Nội", "region": "MIEN_BAC", "status": "ACTIVE"},
    {"id": "KHO_DN_01", "name": "Kho Hải Châu Đà Nẵng", "region": "MIEN_TRUNG", "status": "ACTIVE"},
    {"id": "KHO_HCM_01", "name": "Kho Tân Bình HCM", "region": "MIEN_NAM", "status": "ACTIVE"}
]

def get_warehouse_lookup_api(keyword: str = "", region: str = "", status: str = "ACTIVE"):
    results = MOCK_WAREHOUSES
    if status:
        results = [w for w in results if w["status"] == status]
    if region:
        results = [w for w in results if w["region"] == region]
    if keyword.strip():
        kw = keyword.lower().strip()
        results = [w for w in results if kw in w["name"].lower() or kw in w["id"].lower()]
        
    return {"status": 200, "total": len(results), "data": results}

if __name__ == "__main__":
    print(get_warehouse_lookup_api(keyword="Hà Nội"))