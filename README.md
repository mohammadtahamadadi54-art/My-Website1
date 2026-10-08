# Game Store Madadi

## راه‌اندازی
1. `cp .env.example .env` و مقدارها را پر کنید (ADMIN_PASS حداقل ۱۰ کاراکتر)
2. `npm install && npm start` → http://localhost:3000 — پنل ادمین: `/admin`
3. تست: `npm test` — سلامت سرور: `/healthz`
4. داکر: `docker build -t gsm . && docker run -p 3000:3000 -v gsm-data:/data --env-file .env gsm`

## ساختار
- `server.js` راه‌اندازی، `src/config.js` تنظیمات و اعتبارسنجی env
- `src/db.js` اتصال، مهاجرت‌های نسخه‌دار، تراکنش‌ها، audit
- `src/security.js` هدرهای امنیتی، rate-limit، قفل ورود، هش رمز (scrypt)
- `src/sessions.js` نشست سمت سرور · `src/admin.service.js` منطق ادمین · `src/admin.routes.js` مسیرها
- `src/shop.routes.js` پرداخت ریالی (زرین‌پال) و دلاری (NOWPayments)
