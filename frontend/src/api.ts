import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
});

export const TOKEN_KEY = "auth_token";

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function formatApiError(err: any): string {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: any) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export type Role = "admin" | "teacher";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Classroom {
  id: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
  equipment: string[];
  is_available: boolean;
  unavailable_reason: string | null;
  status: "vacant" | "occupied" | "unavailable";
  current_booking: Booking | null;
  next_booking_today: Booking | null;
}

export interface Booking {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  purpose: string;
  start_time: string;
  end_time: string;
  created_at: string;
}
