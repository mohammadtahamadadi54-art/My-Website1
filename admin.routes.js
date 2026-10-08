const crypto = require("crypto"), { Router } = require("express"), cfg = require("./config");
const sec = require("./security"), sessions = require("./sessions"), svc = require("./admin.service");
const { ah, HttpError } = require("./http"), { audit } = require("./db");
const verify = sec.makeVerifier(cfg.admin.user, cfg.admin.pass), lock = sec.lockout(), r = Router();
const who = cfg.admin.user;

r.post("/login", sec.limiter({ windowMs: 15 * 60e3, max: 20 }), ah(async (req, res) => {
  const b = req.body || {}, u = typeof b.username === "string" ? b.username : "", p = typeof b.password === "string" ? b.password : "";
  const key = req.ip + "|" + u.toLowerCase().slice(0, 50);
  if (lock.blocked(key)) throw new HttpError(429, "به‌دلیل تلاش‌های ناموفق، ۱۰ دقیقه ورود قفل است.");
  if (p.length > 200 || !verify(u, p)) {
    lock.fail(key); audit(null, "login.fail", u.slice(0, 50), null, req.ip);
    await new Promise(ok => setTimeout(ok, 500)); // کند کردن حمله‌ٔ حدس رمز
    throw new HttpError(401, "نام کاربری یا رمز عبور اشتباه است.");
  }
  lock.ok(key);
  const s = sessions.create(req.ip, req.get("user-agent")); sessions.setCookie(res, s.token);
  audit(who, "login.ok", null, null, req.ip);
  res.json({ ok: true, csrf: s.csrf });
}));

// همهٔ مسیرهای بعدی: نشست معتبر + برای تغییرها توکن CSRF
r.use((req, res, next) => {
  const token = sec.cookie(req, "adm"), s = sessions.find(token);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  if (!["GET", "HEAD"].includes(req.method)) {
    const c = String(req.get("x-csrf-token") || "");
    if (c.length !== s.csrf.length || !crypto.timingSafeEqual(Buffer.from(c), Buffer.from(s.csrf))) return res.status(403).json({ error: "توکن امنیتی نامعتبر است." });
  }
  req.admin = { token, session: s }; next();
});

r.get("/me", (req, res) => res.json({ ok: true, user: who, csrf: req.admin.session.csrf }));
r.post("/logout", (req, res) => { sessions.destroy(req.admin.token); sessions.clearCookie(res); audit(who, "logout", null, null, req.ip); res.json({ ok: true }); });
r.get("/stats", (_, res) => res.json(svc.stats()));
r.get("/orders", (req, res) => res.json(svc.listOrders(req.query)));
r.patch("/orders/:no", (req, res) => { svc.setOrderStatus(req.params.no, req.body?.status, who, req.ip); res.json({ ok: true }); });
r.get("/products", (_, res) => res.json(svc.products()));
r.put("/products/:id", (req, res) => { svc.updateProduct(req.params.id, req.body, who, req.ip); res.json({ ok: true }); });
r.get("/audit", (req, res) => res.json(svc.auditLog(req.query.limit)));
module.exports = r;
