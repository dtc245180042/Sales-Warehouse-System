ROLE_PERMISSIONS = {
    "ADMIN": ["*"],
    "MANAGER": ["READ", "WRITE", "APPROVE", "MANAGE_WAREHOUSE"],
    "WAREHOUSE": ["READ_STOCK", "UPDATE_STOCK", "CREATE_EXPORT"],
    "SALES": ["CREATE_ORDER", "READ_ORDER", "READ_STOCK"],
    "ACCOUNTANT": ["READ_FINANCE", "EXPORT_REPORT"],
    "CUSTOMER": ["CREATE_ORDER", "READ_OWN_ORDER"],
    "GUEST": ["READ_CATALOG"]
}

def has_permission(role: str, permission: str) -> bool:
    perms = ROLE_PERMISSIONS.get(role, [])
    return "*" in perms or permission in perms

if __name__ == "__main__":
    print("ADMIN delete:", has_permission("ADMIN", "DELETE_USER"))
    print("SALES delete:", has_permission("SALES", "DELETE_USER"))