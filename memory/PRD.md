# Classroom Management App — PRD

## Goal
Web/mobile app (Expo + FastAPI + MongoDB) to manage classroom availability and bookings with two roles: Admin and Teacher.

## Roles
- **Admin**: seeded on startup (`admin@school.com` / `admin123`). Adds/edits/deletes classrooms, views all bookings.
- **Teacher**: self-registers. Browses classrooms, sees vacant/occupied status, books a time slot, sees own upcoming/past bookings.

## Core Features
1. Email + password JWT auth (Bearer token in AsyncStorage).
2. Classroom CRUD (admin only for write).
3. Time-slot bookings with conflict prevention (409 on overlap).
4. Live status: vacant / occupied (based on whether a booking covers `now`).
5. Booking history & upcoming bookings (per teacher; admin sees all).

## API Surface
- `/api/auth/register|login|me`
- `/api/classrooms` (list with status, create, get, patch, delete)
- `/api/bookings` (list with `mine`, `upcoming`, `classroom_id` filters; create; cancel)

## Tech
- Backend: FastAPI + Motor (MongoDB) + PyJWT + bcrypt
- Frontend: Expo Router (React Native + Web), AsyncStorage, axios
- Design: Pastel light theme — Mint = Vacant, Rose = Occupied, Lavender = Booked
