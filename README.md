# CleanCruisers & SofaShine — Booking Platform

A full-stack production-ready booking software for a professional cleaning services business.

---

## 🏗️ Architecture

```
Frontend (React + Vite + Tailwind)  ──→  Backend (Node.js + Express)  ──→  MongoDB
                                           ├── Razorpay (Payments)
                                           ├── Twilio (WhatsApp/SMS)
                                           └── JWT Auth
```

---

## 📁 Project Structure

```
Booking Software/
├── backend/
│   ├── src/
│   │   ├── config/database.js
│   │   ├── models/          # Booking, Staff, User
│   │   ├── controllers/     # auth, bookings, staff, payments
│   │   ├── routes/          # REST API routes
│   │   ├── middleware/       # auth, errorHandler, validate
│   │   ├── utils/           # notifications, slotManager, pricing
│   │   └── scripts/seed.js  # DB seeding
│   ├── server.js
│   ├── .env                 # ← fill in your credentials
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/      # Navbar, Footer, AdminLayout, etc.
    │   ├── context/         # AuthContext
    │   ├── pages/           # Home, Booking, Confirmation, Login
    │   │   └── admin/       # Dashboard, BookingManagement, StaffManagement
    │   └── utils/           # api.js, helpers.js
    ├── index.html
    └── package.json
```

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB (local or MongoDB Atlas)
- npm or yarn

---

### 1. Clone / Open the project

```bash
cd "C:/Booking Software"
```

---

### 2. Backend Setup

```bash
cd backend
npm install
```

**Configure environment variables:**
```bash
# Edit backend/.env with your credentials:
# - MONGODB_URI
# - JWT_SECRET
# - RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
# - TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
```

**Seed the database** (creates admin user + sample staff):
```bash
npm run seed
```

**Start the backend:**
```bash
npm run dev     # development (with nodemon)
npm start       # production
```
Backend runs at: `http://localhost:5000`

---

### 3. Frontend Setup

```bash
cd ../frontend
npm install
npm run dev
```
Frontend runs at: `http://localhost:5173`

---

### 4. Default Admin Credentials

```
Email:    admin@cleancruisers.com
Password: Admin@123456
```
Admin panel: `http://localhost:5173/admin/login`

---

## 🔑 API Reference

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/login` | Public | Admin login |
| GET | `/api/auth/me` | Private | Get current user |
| POST | `/api/bookings` | Public | Create booking |
| GET | `/api/bookings` | Admin | Get all bookings |
| GET | `/api/bookings/:id` | Public | Get booking by ID |
| PUT | `/api/bookings/:id` | Admin | Update booking |
| GET | `/api/bookings/analytics` | Admin | Revenue analytics |
| GET | `/api/staff` | Admin | Get all staff |
| POST | `/api/staff` | Admin | Add staff |
| PUT | `/api/staff/:id` | Admin | Update staff |
| DELETE | `/api/staff/:id` | Admin | Deactivate staff |
| GET | `/api/staff/available` | Admin | Get available staff |
| GET | `/api/slots` | Public | Get available time slots |
| GET | `/api/slots/services` | Public | Get all services |
| POST | `/api/payments/create-order` | Public | Create Razorpay order |
| POST | `/api/payments/verify` | Public | Verify payment |

---

## 💳 Razorpay Integration

1. Sign up at [razorpay.com](https://razorpay.com)
2. Go to Dashboard → Settings → API Keys
3. Copy Test Key ID and Secret into `backend/.env`
4. For production, replace test keys with live keys

---

## 📱 Twilio WhatsApp/SMS

1. Sign up at [twilio.com](https://twilio.com)
2. Get Account SID and Auth Token from console
3. Activate WhatsApp Sandbox (search for "WhatsApp" in console)
4. Join sandbox: send `join <your-code>` to the WhatsApp number
5. Add credentials to `backend/.env`

---

## 🌐 Production Deployment

### Backend (e.g., Railway / Render / EC2)

```bash
# Set NODE_ENV=production
# Set all env variables in your hosting dashboard
npm start
```

### Frontend (e.g., Vercel / Netlify)

```bash
npm run build
# Deploy the dist/ folder
# Set VITE_API_URL to your backend URL
```

### MongoDB

Use [MongoDB Atlas](https://cloud.mongodb.com) for production:
1. Create a free cluster
2. Add connection string to `MONGODB_URI`
3. Whitelist your server's IP

---

## 🔒 Security Notes

- Change `JWT_SECRET` to a strong random string in production
- Enable HTTPS in production
- Use strong passwords for admin accounts
- Set up MongoDB authentication
- Keep Razorpay live keys secret — never commit to git

---

## 📦 Services & Pricing

| Service | Base Price | Duration |
|---------|-----------|----------|
| Sofa Cleaning | ₹799 | 2 hours |
| Deep Cleaning | ₹1,499 | 4 hours |
| Car Cleaning | ₹599 | 2 hours |
| Carpet Cleaning | ₹999 | 3 hours |
| Bathroom Cleaning | ₹499 | 1 hour |
| Kitchen Cleaning | ₹699 | 2 hours |
| General Cleaning | ₹899 | 3 hours |

Prices can be modified in `backend/src/utils/pricing.js`
