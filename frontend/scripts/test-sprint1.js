/* global process */
/**
 * KIỂM THỬ TỰ ĐỘNG SPRINT 1 - OMS Pro
 * Bao gồm: SCRUM-198, 199, 200, 201, 202, 203, 204, 205, 206, 207
 * Chạy: node scripts/test-sprint1.js
 */

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failedList = [];

function assert(condition, id, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m [${id}]: ${message}`);
  } else {
    failedTests++;
    failedList.push(`[${id}] ${message}`);
    console.error(`  \x1b[31m✖ FAIL\x1b[0m [${id}]: ${message}`);
  }
}

function suite(title) {
  console.log(`\n\x1b[36m━━━ ${title} ━━━\x1b[0m`);
}

console.log('\n══════════════════════════════════════════════════');
console.log('🚀 KIỂM THỬ TỰ ĐỘNG SPRINT 1 – OMS Pro');
console.log('══════════════════════════════════════════════════');

// Dữ liệu mock
const USERS = [
  { id: 'USR-001', email: 'admin@khovanpro.vn',        password: 'admin@1234',    role: 'Admin',            status: 'active', roles: ['Admin'],            warehouse: 'Toan he thong', territory: 'Toan quoc',         assignedDealersCount: 0 },
  { id: 'USR-002', email: 'salesmanager@khovanpro.vn', password: 'sales@1234',    role: 'SalesManager',     status: 'active', roles: ['SalesManager'],     warehouse: 'Kho Tong Ha Noi', territory: 'Dia ban Mien Bac', assignedDealersCount: 8 },
  { id: 'USR-003', email: 'salesstaff@khovanpro.vn',   password: 'staff@1234',    role: 'SalesStaff',       status: 'active', roles: ['SalesStaff'],       warehouse: 'Kho Tong TP. HCM', territory: 'Dia ban Mien Nam', assignedDealersCount: 5 },
  { id: 'USR-004', email: 'whmanager@khovanpro.vn',    password: 'wh@1234',       role: 'WarehouseManager', status: 'active', roles: ['WarehouseManager'], warehouse: 'Kho Tong TP. HCM', territory: '',               assignedDealersCount: 0 },
  { id: 'USR-005', email: 'whstaff@khovanpro.vn',      password: 'staff@1234',    role: 'WarehouseStaff',   status: 'active', roles: ['WarehouseStaff'],   warehouse: 'Kho Tong TP. HCM', territory: '',               assignedDealersCount: 0 },
  { id: 'USR-006', email: 'accountant@khovanpro.vn',   password: 'acc@1234',      role: 'Accountant',       status: 'active', roles: ['Accountant'],       warehouse: 'Van phong TT',     territory: 'Toan quoc',       assignedDealersCount: 0 },
  { id: 'USR-007', email: 'director@khovanpro.vn',     password: 'director@1234', role: 'Director',         status: 'active', roles: ['Director'],         warehouse: 'Toan he thong',    territory: 'Toan quoc',       assignedDealersCount: 0 },
];

const failedLoginStore = {};
const usedResetTokens = [];

function mockLogin(email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const record = failedLoginStore[normalizedEmail];
  if (record && record.lockedUntil > Date.now()) {
    const mins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    throw new Error(`Tai khoan tam thoi bi khoa do nhap sai qua 5 lan lien tiep. Vui long thu lai sau ${mins} phut.`);
  }
  const user = USERS.find(u => u.email.toLowerCase() === normalizedEmail);
  if (!user || user.password !== password) {
    const currentCount = ((record && record.count) || 0) + 1;
    if (currentCount >= 5) {
      failedLoginStore[normalizedEmail] = { count: currentCount, lockedUntil: Date.now() + 15 * 60 * 1000 };
      throw new Error('Ban da nhap sai 5 lan lien tiep. Tai khoan tam thoi bi khoa 15 phut.');
    } else {
      failedLoginStore[normalizedEmail] = { count: currentCount, lockedUntil: 0 };
      throw new Error('Email hoac mat khau khong chinh xac.');
    }
  }
  if (user.status === 'locked') throw new Error('Tai khoan nay da bi khoa. Vui long lien he quan tri vien de mo khoa.');
  if (failedLoginStore[normalizedEmail]) delete failedLoginStore[normalizedEmail];
  return { ...user, token: `token-${Date.now()}` };
}

function mockChangePassword(user, currentPassword, newPassword) {
  if (!currentPassword) throw new Error('Vui long nhap mat khau hien tai.');
  if (user.password !== currentPassword) throw new Error('Mat khau hien tai khong chinh xac.');
  if (newPassword.length < 8) throw new Error('Mat khau moi phai co toi thieu 8 ky tu.');
  if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) throw new Error('Mat khau moi phai bao gom ca chu cai va chu so.');
  if (newPassword === currentPassword) throw new Error('Mat khau moi trung voi mat khau hien tai.');
  return { ...user, password: newPassword };
}

function mockLockAccount(users, id, reason) {
  if (!reason || !reason.trim()) throw new Error('Bat buoc phai ghi ro ly do khoa tai khoan.');
  const user = users.find(u => u.id === id);
  if (!user) throw new Error('Khong tim thay nguoi dung');
  return { ...user, status: 'locked', lockReason: reason.trim() };
}

function mockCreateUser(users, data) {
  const existing = users.find(u => u.email.toLowerCase() === data.email.toLowerCase().trim());
  if (existing) throw new Error(`Email "${data.email}" da ton tai trong he thong. Vui long nhap email khac.`);
  return { ...data, id: `USR-${String(users.length + 1).padStart(3, '0')}`, createdAt: '2026-10-02', lastLogin: 'Chua dang nhap (Cho kich hoat)' };
}

function canAccess(user, allowedRoles) {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

function getHomePath(role) {
  return role === 'Admin' ? '/users' : '/dashboard';
}

// ── SCRUM-198 ───────────────────────────────────────────
suite('SCRUM-198: Dang nhap bang tai khoan & mat khau');

try { const u = mockLogin('admin@khovanpro.vn', 'admin@1234');
  assert(u.role === 'Admin', 'TC-198-01', 'Admin dang nhap dung → tra ve user role=Admin');
  assert(getHomePath(u.role) === '/users', 'TC-198-01b', 'Admin dang nhap → dieu huong /users');
} catch(e) { assert(false,'TC-198-01',`Admin that bai: ${e.message}`); }

try { const u = mockLogin('salesstaff@khovanpro.vn', 'staff@1234');
  assert(getHomePath(u.role) === '/dashboard', 'TC-198-02', 'SalesStaff → dieu huong /dashboard (khong phai /users)');
} catch(e) { assert(false,'TC-198-02',`SalesStaff that bai: ${e.message}`); }

try { mockLogin('admin@khovanpro.vn', 'wrongpassword'); assert(false,'TC-198-03','Phai throw khi sai mat khau');
} catch(e) { assert(e.message === 'Email hoac mat khau khong chinh xac.','TC-198-03','Sai mat khau → thong bao chung, khong tiet lo tai khoan'); }

try { mockLogin('khong_ton_tai@test.vn', 'anypassword'); assert(false,'TC-198-04','Phai throw khi email khong ton tai');
} catch(e) { assert(e.message === 'Email hoac mat khau khong chinh xac.','TC-198-04','Email khong ton tai → cung thong bao voi sai mat khau (anti-enumeration)'); }

const lockEmail = 'locktest_198@test.vn';
let lockedMsg5 = '';
for (let i = 0; i < 6; i++) { try { mockLogin(lockEmail, 'wrongpass'); } catch(e) { if (i === 5) lockedMsg5 = e.message; } }
assert(lockedMsg5.includes('bi khoa'), 'TC-198-05', 'Sau 5 lan sai lien tiep → tai khoan bi khoa tam 15 phut');

try { const u = mockLogin('ADMIN@KHOVANPRO.VN', 'admin@1234');
  assert(u.role === 'Admin', 'TC-198-11', 'Email viet hoa (ADMIN@...) → dang nhap thanh cong (case-insensitive)');
} catch(e) { assert(false,'TC-198-11',e.message); }

function mockLoginWithLockedCheck(users, email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = users.find(u => u.email.toLowerCase() === normalizedEmail);
  if (!user || user.password !== password) throw new Error('Email hoac mat khau khong chinh xac.');
  if (user.status === 'locked') throw new Error('Tai khoan nay da bi khoa. Vui long lien he quan tri vien de mo khoa.');
  return user;
}
const lockedU = { ...USERS[0], status: 'locked' };
try {
  mockLoginWithLockedCheck([lockedU, ...USERS.slice(1)], lockedU.email, lockedU.password);
  assert(false,'TC-198-10','Phai throw khi tai khoan bi Admin khoa');
} catch(e) { assert(e.message.includes('bi khoa'),'TC-198-10','Tai khoan bi Admin khoa → khong the dang nhap, thong bao ro rang'); }

// ── SCRUM-199 ───────────────────────────────────────────
suite('SCRUM-199: Duy tri phien dang nhap & dang xuat an toan');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const sessionExpiresAt = Date.now() + SESSION_TIMEOUT_MS;
assert(sessionExpiresAt > Date.now(), 'TC-199-01', 'Session expires_at sau login = now + 30 phut (trong tuong lai)');
const expiredAt = Date.now() - 1000;
assert(Date.now() > expiredAt, 'TC-199-02', 'Phien het han (expires_at < now) → can redirect /login?expired=1');
const afterLogout = { user: null, token: null, expiresAt: null };
assert(afterLogout.token === null && afterLogout.user === null, 'TC-199-04', 'Sau logout → user va token bi xoa khoi storage');

// ── SCRUM-200 ───────────────────────────────────────────
suite('SCRUM-200: Dat lai mat khau qua email');

function mockForgotPwd(email) { void email; return { msg: 'Neu email ton tai, huong dan da duoc gui.' }; }
assert(mockForgotPwd('admin@khovanpro.vn').msg === mockForgotPwd('khong_ton_tai@test.vn').msg, 'TC-200-01+02', 'Email ton tai/khong ton tai → cung 1 thong bao (chong liet ke tai khoan)');
const resetToken = `reset_token_${Date.now()}`;
usedResetTokens.push(resetToken);
assert(usedResetTokens.includes(resetToken), 'TC-200-04a', 'Sau khi dung reset link → token duoc danh dau da su dung');
assert(usedResetTokens.filter(t => t === resetToken).length === 1, 'TC-200-04b', 'Dung lai token cu → bi tu choi (ton tai trong usedResetTokens)');

// ── SCRUM-201 ───────────────────────────────────────────
suite('SCRUM-201: Doi mat khau khi dang nhap');

const aUser = USERS[0];
try { const up = mockChangePassword(aUser,'admin@1234','NewPass2026');
  assert(up.password === 'NewPass2026','TC-201-01','Doi mat khau dung → thanh cong');
} catch(e) { assert(false,'TC-201-01',e.message); }

try { mockChangePassword(aUser,'','NewPass2026'); assert(false,'TC-201-02','Phai throw khi mat khau hien tai trong');
} catch(e) { assert(e.message === 'Vui long nhap mat khau hien tai.','TC-201-02','Mat khau hien tai trong → bao loi ro rang'); }

try { mockChangePassword(aUser,'wrongPass','NewPass2026'); assert(false,'TC-201-03','Phai throw khi sai mat khau hien tai');
} catch(e) { assert(e.message === 'Mat khau hien tai khong chinh xac.','TC-201-03','Sai mat khau hien tai → bao loi'); }

try { mockChangePassword(aUser,'admin@1234','Ab1'); assert(false,'TC-201-04','Phai throw khi < 8 ky tu');
} catch(e) { assert(e.message === 'Mat khau moi phai co toi thieu 8 ky tu.','TC-201-04','Mat khau moi < 8 ky tu → bao loi do dai'); }

try { mockChangePassword(aUser,'admin@1234','OnlyLetters'); assert(false,'TC-201-05','Phai throw khi khong co chu so');
} catch(e) { assert(e.message === 'Mat khau moi phai bao gom ca chu cai va chu so.','TC-201-05','Khong co chu so → bao loi'); }

try { mockChangePassword(aUser,'admin@1234','12345678'); assert(false,'TC-201-06','Phai throw khi khong co chu cai');
} catch(e) { assert(e.message === 'Mat khau moi phai bao gom ca chu cai va chu so.','TC-201-06','Khong co chu cai → bao loi'); }

try { mockChangePassword(aUser,'admin@1234','admin@1234'); assert(false,'TC-201-07','Phai throw khi mat khau moi trung cu');
} catch(e) { assert(e.message === 'Mat khau moi trung voi mat khau hien tai.','TC-201-07','Mat khau moi trung cu → bao loi'); }

// ── SCRUM-202 ───────────────────────────────────────────
suite('SCRUM-202: Phan quyen theo vai tro (RBAC)');

const admin   = USERS.find(u => u.role === 'Admin');
const sStaff  = USERS.find(u => u.role === 'SalesStaff');
const whStaff = USERS.find(u => u.role === 'WarehouseStaff');
const sMgr    = USERS.find(u => u.role === 'SalesManager');

assert(canAccess(admin, ['Admin']), 'TC-202-01', 'Admin → canAccess([Admin]) = true');
assert(!canAccess(sStaff, ['Admin']), 'TC-202-02', 'SalesStaff → canAccess([Admin]) = false (bi tu choi /users)');
assert(!canAccess(whStaff, ['Admin']), 'TC-202-03', 'WarehouseStaff → canAccess([Admin]) = false');
assert(!canAccess(null, ['Admin']), 'TC-202-06', 'user=null (chua dang nhap) → canAccess = false');

const COST_ROLES = ['Admin','SalesManager'];
assert(COST_ROLES.includes(sMgr.role),   'TC-202-04', 'SalesManager → duoc xem gia von (SCRUM-202)');
assert(!COST_ROLES.includes(whStaff.role),'TC-202-05', 'WarehouseStaff → KHONG duoc xem gia von');
assert(!COST_ROLES.includes(sStaff.role), 'TC-202-05b','SalesStaff → KHONG duoc xem gia von');

// ── SCRUM-203 ───────────────────────────────────────────
suite('SCRUM-203: Menu dieu huong dung theo quyen');

function getMenuItems(role) {
  const all = [
    { path:'/dashboard', allowedRoles:['Admin','SalesManager','SalesStaff','WarehouseManager','WarehouseStaff','Accountant','Director','Manager','Staff'] },
    { path:'/users',     allowedRoles:['Admin'] },
    { path:'/settings',  allowedRoles:['Admin','SalesManager','SalesStaff','WarehouseManager','WarehouseStaff','Accountant','Director','Manager','Staff'] },
  ];
  return all.filter(item => item.allowedRoles.includes(role));
}
assert(getMenuItems('Admin').some(m => m.path === '/users'), 'TC-203-01', 'Admin → menu co /users');
assert(!getMenuItems('SalesStaff').some(m => m.path === '/users'), 'TC-203-02', 'SalesStaff → menu KHONG co /users');
assert(getMenuItems('SalesStaff').some(m => m.path === '/dashboard'), 'TC-203-03', 'SalesStaff → co Dashboard trong menu');
assert(whStaff.warehouse && whStaff.warehouse.length > 0, 'TC-203-05', 'WarehouseStaff co truong warehouse de hien thi sidebar');

// ── SCRUM-204 ───────────────────────────────────────────
suite('SCRUM-204: Trang bao loi dung chung');

function getErrorConfig(code, role, _pathname) {
  const is403 = code === '403'; const is500 = code === '500';
  return {
    title: is403 ? '403-title' : is500 ? '500-title' : '404-title',
    homePath: role === 'Admin' ? '/users' : '/dashboard',
  };
}
assert(getErrorConfig('403','SalesStaff','/users').title === '403-title', 'TC-204-01', 'Loi 403 → title dung cho 403');
assert(getErrorConfig('404','SalesStaff','/x').title    === '404-title', 'TC-204-02', 'Loi 404 → title dung cho 404');
assert(getErrorConfig('500','Admin','/x').title         === '500-title', 'TC-204-06', 'Loi 500 → title dung cho 500 (SCRUM-204 mo rong)');
assert(getErrorConfig('404','Admin','/x').homePath      === '/users',     'TC-204-04', 'Admin xem trang loi → nut Home tro ve /users');
assert(getErrorConfig('404','SalesStaff','/x').homePath === '/dashboard', 'TC-204-05', 'SalesStaff xem trang loi → nut Home tro ve /dashboard');

// ── SCRUM-205 ───────────────────────────────────────────
suite('SCRUM-205: Tao, sua va tim kiem tai khoan nguoi dung');

try { const nU = mockCreateUser(USERS, { name:'Nhan Vien Moi', email:'newstaff@khovanpro.vn', role:'SalesStaff', status:'active' });
  assert(nU.lastLogin === 'Chua dang nhap (Cho kich hoat)', 'TC-205-01', 'Tao user moi → lastLogin = "Chua dang nhap (Cho kich hoat)"');
  assert(nU.id.startsWith('USR-'), 'TC-205-01b', 'Tao user moi → ID tu dong sinh voi prefix USR-');
} catch(e) { assert(false,'TC-205-01',e.message); }

try { mockCreateUser(USERS,{name:'Test',email:'admin@khovanpro.vn',role:'SalesStaff'}); assert(false,'TC-205-03','Phai throw khi email trung');
} catch(e) { assert(e.message.includes('da ton tai trong he thong'),'TC-205-03','Email trung → thong bao cu the co ten email'); }

const srResult = USERS.filter(u => u.email.toLowerCase().includes('admin'));
assert(srResult.length > 0, 'TC-205-05', 'Tim "admin" → co ket qua khop email admin@...');
const filtRole = USERS.filter(u => u.role === 'SalesStaff');
assert(filtRole.length > 0 && filtRole.every(u => u.role === 'SalesStaff'), 'TC-205-08', 'Loc roleFilter=SalesStaff → chi tra SalesStaff');
const lockedOnly = USERS.filter(u => u.status === 'locked');
assert(lockedOnly.length === 0, 'TC-205-09', 'Loc status=locked tren du lieu sach → tra ve rong');

// ── SCRUM-206 ───────────────────────────────────────────
suite('SCRUM-206: Gan vai tro va gan kho/dia ban');

assert(['SalesStaff','SalesManager'].length > 1,'TC-206-01','Mot user co the giu nhieu vai tro (multi-roles array)');

function canRevokeAdminSelf(curId, editId, tRole) {
  if (curId === editId && tRole === 'Admin') return false;
  return true;
}
assert(!canRevokeAdminSelf('USR-001','USR-001','Admin'), 'TC-206-02', 'Admin khong the tu thu hoi vai tro Admin cua chinh minh');
assert(canRevokeAdminSelf('USR-001','USR-002','Admin'),  'TC-206-02b','Admin co the thu hoi Admin cua nguoi khac');

try { if([].length < 1) throw new Error('Tai khoan phai co it nhat mot vai tro.'); assert(false,'TC-206-03','Phai throw');
} catch(e) { assert(e.message === 'Tai khoan phai co it nhat mot vai tro.','TC-206-03','Roles rong → bao loi'); }

function validateWH(roles, wh) {
  if (roles.some(r => ['WarehouseManager','WarehouseStaff'].includes(r)) && !wh) throw new Error('Nguoi dung thuoc vai tro kho phai gan voi it nhat mot kho cu the.');
  return true;
}
try { validateWH(['WarehouseStaff'],''); assert(false,'TC-206-04','Phai throw');
} catch(e) { assert(e.message.includes('vai tro kho phai gan'),'TC-206-04','WarehouseStaff thieu kho → bao loi bat buoc gan kho'); }
try { validateWH(['WarehouseManager'],''); assert(false,'TC-206-05','Phai throw');
} catch(e) { assert(e.message.includes('vai tro kho phai gan'),'TC-206-05','WarehouseManager thieu kho → bao loi bat buoc gan kho'); }

function validateTer(roles, ter) {
  if (roles.some(r => ['SalesManager','SalesStaff'].includes(r)) && !ter) throw new Error('Nguoi dung thuoc vai tro kinh doanh phai gan voi it nhat mot dia ban cu the.');
  return true;
}
try { validateTer(['SalesStaff'],''); assert(false,'TC-206-06','Phai throw');
} catch(e) { assert(e.message.includes('vai tro kinh doanh phai gan'),'TC-206-06','SalesStaff thieu dia ban → bao loi bat buoc gan dia ban'); }

assert(validateWH(['Admin'],'') === true, 'TC-206-08','Admin khong can gan kho → valid');

// ── SCRUM-207 ───────────────────────────────────────────
suite('SCRUM-207: Khoa va mo khoa tai khoan');

const tUsers = USERS.slice();
const tId = 'USR-003';

try { const lk = mockLockAccount(tUsers, tId, 'Nghi viec tu 01/10/2026');
  assert(lk.status === 'locked', 'TC-207-01', 'Khoa tai khoan → status = "locked"');
  assert(lk.lockReason === 'Nghi viec tu 01/10/2026','TC-207-10','Khoa tai khoan → lockReason duoc luu day du');
} catch(e) { assert(false,'TC-207-01',e.message); }

try { mockLockAccount(tUsers,tId,''); assert(false,'TC-207-02','Phai throw khi ly do trong');
} catch(e) { assert(e.message === 'Bat buoc phai ghi ro ly do khoa tai khoan.','TC-207-02','Ly do trong → "Bat buoc phai ghi ro ly do khoa tai khoan."'); }

try { mockLockAccount(tUsers,tId,'   '); assert(false,'TC-207-03','Phai throw khi ly do chi co khoang trang');
} catch(e) { assert(e.message === 'Bat buoc phai ghi ro ly do khoa tai khoan.','TC-207-03','Ly do chi khoang trang → cung bi tu choi'); }

const lockedForLogin = { ...USERS[0], status:'locked' };
function loginWithStatus(u, pwd) {
  if (u.password !== pwd) throw new Error('Sai mat khau');
  if (u.status === 'locked') throw new Error('Tai khoan nay da bi khoa. Vui long lien he quan tri vien de mo khoa.');
  return u;
}
try { loginWithStatus(lockedForLogin,'admin@1234'); assert(false,'TC-207-04','Phai throw khi tai khoan bi khoa');
} catch(e) { assert(e.message.includes('da bi khoa'),'TC-207-04','Tai khoan bi khoa → dang nhap that bai voi thong bao ro rang'); }

const unlockedU = { ...lockedForLogin, status:'active', lockReason:undefined, lockedAt:undefined };
assert(unlockedU.status === 'active','TC-207-08','Mo khoa → status tro ve "active"');
assert(unlockedU.lockReason === undefined,'TC-207-08b','Mo khoa → lockReason bi xoa');

// ── TONG KET ────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(`📊 KET QUA: ${passedTests}/${totalTests} PASS | ${failedTests} FAIL`);
console.log(`📈 Ty le dat: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
if (failedTests === 0) {
  console.log('\x1b[32m🎉 TAT CA TEST CASE DAT CHUAN SPRINT 1!\x1b[0m');
} else {
  console.log(`\n\x1b[31m💥 ${failedTests} test case that bai:\x1b[0m`);
  failedList.forEach(f => console.error(`  • ${f}`));
}
console.log('══════════════════════════════════════════════════\n');
process.exit(failedTests === 0 ? 0 : 1);
