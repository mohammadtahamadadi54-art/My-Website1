const Database = require("better-sqlite3"), cfg = require("./config");
const db = new Database(cfg.dbFile);
db.pragma("journal_mode = WAL"); db.pragma("foreign_keys = ON"); db.pragma("busy_timeout = 5000");

// مهاجرت‌های نسخه‌دار (user_version) — هر مهاجرت فقط یک‌بار و داخل تراکنش اجرا می‌شود
const MIGRATIONS = [
  d => d.exec(`
    CREATE TABLE IF NOT EXISTS orders(no TEXT PRIMARY KEY, items TEXT, usd REAL, irr INTEGER, method TEXT, name TEXT, email TEXT, phone TEXT,
      ref TEXT, track TEXT, status TEXT DEFAULT 'pending', created INTEGER);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, n TEXT, p REAL, s INTEGER)`),
  d => { if (!d.prepare("PRAGMA table_info(orders)").all().some(c => c.name === "lines")) d.exec("ALTER TABLE orders ADD COLUMN lines TEXT"); },
  d => d.exec(`
    CREATE TABLE sessions(id TEXT PRIMARY KEY, csrf TEXT NOT NULL, ip TEXT, ua TEXT, created INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT);
    CREATE INDEX idx_orders_status ON orders(status, created);
    CREATE INDEX idx_audit_ts ON audit_log(ts)`)
];
for (let v = db.pragma("user_version", { simple: true }); v < MIGRATIONS.length; v++)
  db.transaction(() => { MIGRATIONS[v](db); db.pragma(`user_version = ${v + 1}`); })();

const CATALOG = {
  1:{n:"GTA V",p:14.99,s:12},2:{n:"Cyberpunk 2077",p:29.99,s:8},3:{n:"Red Dead Redemption 2",p:39.99,s:5},
  4:{n:"Elden Ring",p:49.99,s:10},5:{n:"Minecraft",p:19.99,s:50},6:{n:"Forza Horizon 5",p:34.99,s:7},
  7:{n:"EA Sports FC",p:59.99,s:20},8:{n:"Resident Evil 4",p:39.99,s:6},9:{n:"God of War",p:29.99,s:9},
  10:{n:"The Witcher 3",p:24.99,s:15},11:{n:"Hogwarts Legacy",p:44.99,s:0},12:{n:"Call of Duty",p:59.99,s:30}
};
for (const [id, g] of Object.entries(CATALOG)) db.prepare("INSERT OR IGNORE INTO products(id,n,p,s) VALUES(?,?,?,?)").run(+id, g.n, g.p, g.s);

const P = id => db.prepare("SELECT * FROM products WHERE id=?").get(id);
const getOrder = no => db.prepare("SELECT * FROM orders WHERE no=?").get(String(no || ""));

// تغییر وضعیت + همگام‌سازی موجودی در یک تراکنش اتمیک (پرداخت→کم، برگشت از پرداخت→برگردان)
const setStatus = db.transaction((no, status, track) => {
  const o = getOrder(no); if (!o) return false;
  db.prepare("UPDATE orders SET status=?, track=COALESCE(?,track) WHERE no=?").run(status, track ?? null, no);
  const lines = o.lines ? JSON.parse(o.lines) : [];
  if (status === "paid" && o.status !== "paid") for (const l of lines) db.prepare("UPDATE products SET s=MAX(s-?,0) WHERE id=?").run(l.q, l.id);
  if (o.status === "paid" && status !== "paid") for (const l of lines) db.prepare("UPDATE products SET s=s+? WHERE id=?").run(l.q, l.id);
  return true;
});

const audit = (actor, action, target, detail, ip) =>
  db.prepare("INSERT INTO audit_log(ts,actor,action,target,detail,ip) VALUES(?,?,?,?,?,?)")
    .run(Date.now(), actor ?? null, action, target ?? null, detail ? JSON.stringify(detail) : null, ip ?? null);

function totals(lines) { // محاسبه به سنت؛ ۱۰٪ تخفیف از ۱۰۰ دلار به بالا + ۹٪ مالیات
  const sub = lines.reduce((a, l) => a + Math.round(P(l.id).p * 100) * l.q, 0);
  const disc = sub >= 10000 ? Math.round(sub * 0.1) : 0;
  const tax = Math.round((sub - disc) * 0.09);
  return (sub - disc + tax) / 100;
}
module.exports = { db, P, getOrder, setStatus, audit, totals };
