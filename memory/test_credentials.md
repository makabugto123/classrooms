# Test Credentials

## Admin (seeded automatically on backend startup)
- Email: `admin@school.com`
- Password: `admin123`
- Role: `admin`

## Teacher (created via /api/auth/register or in-app sign-up)
- Suggested test teacher
- Email: `teacher@school.com`
- Password: `teacher123`
- Role: `teacher`

## Auth endpoints
- POST `/api/auth/register` (creates a teacher)
- POST `/api/auth/login`
- GET `/api/auth/me` (Bearer token)

Notes:
- Auth uses `Authorization: Bearer <token>` header (JWT, 7-day expiry).
- Frontend stores the token in AsyncStorage under key `auth_token`.
