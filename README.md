# Classroom Management App — Hosting Guide

A full-stack classroom management web app:
- **Backend**: FastAPI + MongoDB (Python)
- **Frontend**: Expo (React Native Web — runs on web, iOS, Android)
- **Auth**: JWT (Bearer tokens, 7-day expiry, bcrypt hashing)
- **Roles**: Admin (manage classrooms) + Teacher (book classrooms)

## Demo credentials
- Admin (auto-seeded): `admin@school.com` / `admin123`
- Teachers: register via the in-app "Create an account" link

## Project structure
```
app/
├── backend/
│   ├── server.py            # FastAPI app (all routes + auth + booking logic)
│   ├── requirements.txt
│   └── .env                 # MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_*
└── frontend/
    ├── app.json
    ├── package.json
    ├── .env                 # EXPO_PUBLIC_BACKEND_URL
    ├── app/
    │   ├── _layout.tsx      # Auth provider + route guard
    │   ├── index.tsx        # redirect target
    │   ├── login.tsx
    │   ├── register.tsx
    │   ├── dashboard.tsx    # main screen (classroom list, booking, admin tools)
    │   └── bookings.tsx     # booking history / upcoming
    └── src/
        ├── api.ts           # axios client + types
        ├── AuthContext.tsx
        ├── theme.ts
        └── utils.ts
```

---

## 1. Run locally

### Prerequisites
- Python 3.10+
- Node 18+ and Yarn
- MongoDB running on localhost:27017 (or change `MONGO_URL`)

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # (Windows: venv\Scripts\activate)
pip install -r requirements.txt
# Optional: edit .env to change admin email / JWT secret
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
The API is now at `http://localhost:8001/api`.

Test it:
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.com","password":"admin123"}'
```

### Frontend
Edit `frontend/.env` so the app knows where the backend lives:
```
EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
```
Then:
```bash
cd frontend
yarn install
yarn web        # opens at http://localhost:8081 (or another free port)
```
For phone testing, run `yarn start` and scan the QR with the Expo Go app.

---

## 2. Deploy to a real host

### 2.1 Backend (FastAPI)
Pick any platform that runs Python + MongoDB:
- **Railway / Render / Fly.io / DigitalOcean App Platform** — point them at `backend/`, set start command:
  ```
  uvicorn server:app --host 0.0.0.0 --port $PORT
  ```
- Add **MongoDB Atlas** (free tier) and set `MONGO_URL` to the Atlas connection string.
- Set env vars on the host:
  ```
  MONGO_URL=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net
  DB_NAME=classroom_management
  JWT_SECRET=<64-char-random-hex>
  ADMIN_EMAIL=admin@yourschool.com
  ADMIN_PASSWORD=<change-me>
  ```
  Generate a secret: `python -c "import secrets;print(secrets.token_hex(32))"`

### 2.2 Frontend (Expo Web)
The frontend builds to a static site you can host anywhere (Vercel, Netlify, Cloudflare Pages, GitHub Pages…).

```bash
cd frontend
# point at the deployed backend
echo "EXPO_PUBLIC_BACKEND_URL=https://YOUR-BACKEND.example.com" > .env
yarn install
npx expo export --platform web
# Static site is now in dist/
```
Upload `dist/` to your static host. That's it.

For Vercel: connect the repo, set root directory to `frontend`, build command `npx expo export --platform web`, output directory `dist`, and add the `EXPO_PUBLIC_BACKEND_URL` env var.

### 2.3 Mobile apps (optional)
With the same code:
```bash
npx expo prebuild
npx expo run:ios       # or run:android
# Or build cloud binaries:
eas build --platform ios
eas build --platform android
```

---

## 3. API quick reference

All routes live under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | create teacher (returns token) |
| POST | `/api/auth/login` | public | login (returns token) |
| GET | `/api/auth/me` | any | current user |
| GET | `/api/classrooms` | any | list with live status |
| POST | `/api/classrooms` | admin | create classroom |
| PATCH | `/api/classrooms/{id}` | admin | edit / toggle availability |
| DELETE | `/api/classrooms/{id}` | admin | delete (cascades bookings) |
| POST | `/api/bookings` | teacher/admin | book a slot (409 on overlap) |
| GET | `/api/bookings?upcoming=true` | any | list bookings (teacher sees own, admin sees all) |
| DELETE | `/api/bookings/{id}` | owner/admin | cancel booking |

### Status logic
A classroom's `status` is computed live:
- `unavailable` — admin set `is_available=false` (e.g., damaged room)
- `occupied` — has an active booking now OR an upcoming booking later today
- `vacant` — otherwise

The dashboard auto-refreshes every 30 seconds, so when a booking's `end_time` passes the room flips back to **Vacant** automatically.

---

## 4. Security notes for production
- Change `JWT_SECRET` to a strong random value before going live.
- Change `ADMIN_PASSWORD`.
- Replace the wildcard CORS in `backend/server.py` with your real frontend origin:
  ```python
  allow_origins=["https://your-frontend.example.com"]
  ```
- Use HTTPS for both frontend and backend.
- The current build uses MongoDB without authentication; lock down your DB on the deploy host.

Enjoy! 🎓
