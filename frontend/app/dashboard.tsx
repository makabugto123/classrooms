import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/AuthContext";
import { api, formatApiError, Classroom } from "../src/api";
import { COLORS, RADIUS, SPACING } from "../src/theme";
import { formatTime, nowLocalTime, todayTimeToISO } from "../src/utils";

const EMPTY_IMG =
  "https://static.prod-images.emergentagent.com/jobs/3e3f40c1-2328-46a3-9026-78df207c0385/images/36200345491d9ef6035f2d3aa37028da1d44e9027c4be6bc960a1342af72e447.png";

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onYes();
  } else {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: onYes },
    ]);
  }
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add/Edit classroom modal (admin)
  const [classroomModal, setClassroomModal] = useState<{
    open: boolean;
    editing: Classroom | null;
  }>({ open: false, editing: null });
  const [cName, setCName] = useState("");
  const [cBuilding, setCBuilding] = useState("");
  const [cFloor, setCFloor] = useState("");
  const [cCapacity, setCCapacity] = useState("");
  const [cEquipment, setCEquipment] = useState("");
  const [cError, setCError] = useState("");
  const [cSaving, setCSaving] = useState(false);

  // Booking modal (teacher) — time-only, today's date
  const [bookModal, setBookModal] = useState<{ open: boolean; room: Classroom | null }>({
    open: false,
    room: null,
  });
  const [bPurpose, setBPurpose] = useState("");
  const [bStart, setBStart] = useState(nowLocalTime(15));
  const [bEnd, setBEnd] = useState(nowLocalTime(75));
  const [bError, setBError] = useState("");
  const [bSaving, setBSaving] = useState(false);

  const loadClassrooms = useCallback(async () => {
    try {
      const { data } = await api.get<Classroom[]>("/classrooms");
      setClassrooms(data);
    } catch (e) {
      // ignore for refresh
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadClassrooms();
      setLoading(false);
    })();
  }, [loadClassrooms]);

  // Auto-refresh every 30s so that when a booking's end time passes the
  // classroom flips back to "Vacant" without the user pulling to refresh.
  useEffect(() => {
    const id = setInterval(() => {
      loadClassrooms();
    }, 30_000);
    return () => clearInterval(id);
  }, [loadClassrooms]);

  async function onRefresh() {
    setRefreshing(true);
    await loadClassrooms();
    setRefreshing(false);
  }

  function openAdd() {
    setCName("");
    setCBuilding("");
    setCFloor("");
    setCCapacity("");
    setCEquipment("");
    setCError("");
    setClassroomModal({ open: true, editing: null });
  }

  function openEdit(room: Classroom) {
    setCName(room.name);
    setCBuilding(room.building);
    setCFloor(room.floor);
    setCCapacity(String(room.capacity));
    setCEquipment(room.equipment.join(", "));
    setCError("");
    setClassroomModal({ open: true, editing: room });
  }

  async function saveClassroom() {
    setCError("");
    if (!cName.trim() || !cBuilding.trim() || !cFloor.trim() || !cCapacity.trim()) {
      setCError("Please fill all required fields");
      return;
    }
    const cap = parseInt(cCapacity, 10);
    if (!Number.isFinite(cap) || cap < 1) {
      setCError("Capacity must be a positive number");
      return;
    }
    const equipment = cEquipment
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    setCSaving(true);
    try {
      if (classroomModal.editing) {
        await api.patch(`/classrooms/${classroomModal.editing.id}`, {
          name: cName.trim(),
          building: cBuilding.trim(),
          floor: cFloor.trim(),
          capacity: cap,
          equipment,
        });
      } else {
        await api.post("/classrooms", {
          name: cName.trim(),
          building: cBuilding.trim(),
          floor: cFloor.trim(),
          capacity: cap,
          equipment,
        });
      }
      setClassroomModal({ open: false, editing: null });
      await loadClassrooms();
    } catch (e: any) {
      setCError(formatApiError(e));
    } finally {
      setCSaving(false);
    }
  }

  function deleteClassroom(room: Classroom) {
    confirm(
      "Delete classroom",
      `Delete "${room.name}"? All its bookings will be removed.`,
      async () => {
        try {
          await api.delete(`/classrooms/${room.id}`);
          await loadClassrooms();
        } catch (e: any) {
          Alert.alert("Error", formatApiError(e));
        }
      }
    );
  }

  function openBook(room: Classroom) {
    setBPurpose("");
    setBStart(nowLocalTime(15));
    setBEnd(nowLocalTime(75));
    setBError("");
    setBookModal({ open: true, room });
  }

  async function submitBooking() {
    setBError("");
    if (!bookModal.room) return;
    if (!bPurpose.trim()) {
      setBError("Please enter a purpose");
      return;
    }
    const startISO = todayTimeToISO(bStart);
    const endISO = todayTimeToISO(bEnd);
    if (!startISO || !endISO) {
      setBError("Please use 24-hour time format HH:MM");
      return;
    }
    if (new Date(endISO) <= new Date(startISO)) {
      setBError("End time must be after start time");
      return;
    }
    setBSaving(true);
    try {
      await api.post("/bookings", {
        classroom_id: bookModal.room.id,
        purpose: bPurpose.trim(),
        start_time: startISO,
        end_time: endISO,
      });
      setBookModal({ open: false, room: null });
      await loadClassrooms();
      Alert.alert("Booked", "Your classroom has been reserved for today.");
    } catch (e: any) {
      setBError(formatApiError(e));
    } finally {
      setBSaving(false);
    }
  }

  async function toggleAvailability(room: Classroom) {
    if (room.is_available) {
      const reason =
        Platform.OS === "web"
          // eslint-disable-next-line no-alert
          ? window.prompt("Reason (e.g., damaged, under maintenance):", "damaged")
          : "damaged";
      if (reason === null) return;
      try {
        await api.patch(`/classrooms/${room.id}`, {
          is_available: false,
          unavailable_reason: (reason || "damaged").trim() || "damaged",
        });
        await loadClassrooms();
      } catch (e: any) {
        Alert.alert("Error", formatApiError(e));
      }
    } else {
      try {
        await api.patch(`/classrooms/${room.id}`, {
          is_available: true,
          unavailable_reason: null,
        });
        await loadClassrooms();
      } catch (e: any) {
        Alert.alert("Error", formatApiError(e));
      }
    }
  }

  function renderItem({ item }: { item: Classroom }) {
    const isAdmin = user?.role === "admin";
    const isUnavailable = item.status === "unavailable";
    const isOccupied = item.status === "occupied";
    const pillStyle = isUnavailable
      ? styles.pillUnavailable
      : isOccupied
      ? styles.pillOccupied
      : styles.pillVacant;
    const dotColor = isUnavailable
      ? COLORS.unavailableBorder
      : isOccupied
      ? COLORS.occupiedBorder
      : COLORS.vacantBorder;
    const textColor = isUnavailable
      ? COLORS.unavailableText
      : isOccupied
      ? COLORS.occupiedText
      : COLORS.vacantText;
    const statusLabel = isUnavailable
      ? "Unavailable"
      : isOccupied
      ? "Occupied"
      : "Vacant";

    const upcomingToday = item.next_booking_today;

    return (
      <View style={styles.card} testID={`classroom-card-${item.id}`}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSubtitle}>
              {item.building} · Floor {item.floor} · Capacity {item.capacity}
            </Text>
          </View>
          <View style={[styles.statusPill, pillStyle]} testID={`classroom-status-${item.id}`}>
            <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.statusText, { color: textColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {item.equipment.length > 0 && (
          <View style={styles.tagRow}>
            {item.equipment.map((eq) => (
              <View key={eq} style={styles.tag}>
                <Text style={styles.tagText}>{eq}</Text>
              </View>
            ))}
          </View>
        )}

        {isUnavailable && (
          <View style={styles.unavailableBox} testID={`classroom-unavailable-${item.id}`}>
            <Ionicons name="warning-outline" size={16} color={COLORS.unavailableText} />
            <Text style={styles.unavailableText}>
              {item.unavailable_reason
                ? `Out of service: ${item.unavailable_reason}`
                : "Out of service"}
            </Text>
          </View>
        )}

        {!isUnavailable && isOccupied && item.current_booking && (
          <View style={styles.currentBookingBox}>
            <Text style={styles.currentBookingLabel}>In use until</Text>
            <Text style={styles.currentBookingValue}>
              {formatTime(item.current_booking.end_time)} · {item.current_booking.teacher_name}
            </Text>
            <Text style={styles.currentBookingPurpose}>{item.current_booking.purpose}</Text>
          </View>
        )}

        {!isUnavailable && !item.current_booking && upcomingToday && (
          <View style={styles.upcomingBox}>
            <Text style={styles.upcomingLabel}>Reserved later today</Text>
            <Text style={styles.upcomingValue}>
              {formatTime(upcomingToday.start_time)} – {formatTime(upcomingToday.end_time)} ·{" "}
              {upcomingToday.teacher_name}
            </Text>
            <Text style={styles.upcomingPurpose}>{upcomingToday.purpose}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          {isAdmin ? (
            <>
              <TouchableOpacity
                testID={`edit-classroom-${item.id}`}
                style={[styles.actionBtn, styles.actionSecondary]}
                onPress={() => openEdit(item)}
              >
                <Ionicons name="create-outline" size={16} color={COLORS.textPrimary} />
                <Text style={styles.actionSecondaryText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`toggle-availability-${item.id}`}
                style={[
                  styles.actionBtn,
                  isUnavailable ? styles.actionPrimary : styles.actionWarning,
                ]}
                onPress={() => toggleAvailability(item)}
              >
                <Ionicons
                  name={isUnavailable ? "checkmark-circle-outline" : "warning-outline"}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.actionPrimaryText}>
                  {isUnavailable ? "Mark available" : "Mark unavailable"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID={`delete-classroom-${item.id}`}
                style={[styles.actionBtn, styles.actionDanger]}
                onPress={() => deleteClassroom(item)}
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.actionDangerText}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              testID={`book-classroom-${item.id}`}
              style={[
                styles.actionBtn,
                isUnavailable ? styles.actionDisabled : styles.actionPrimary,
              ]}
              onPress={() => !isUnavailable && openBook(item)}
              disabled={isUnavailable}
            >
              <Ionicons
                name={isUnavailable ? "lock-closed-outline" : "calendar-outline"}
                size={16}
                color="#fff"
              />
              <Text style={styles.actionPrimaryText}>
                {isUnavailable ? "Unavailable" : "Book this room"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greet}>Hi, {user?.name?.split(" ")[0] || "there"} 👋</Text>
          <Text style={styles.role}>
            {user?.role === "admin" ? "Administrator" : "Teacher"}
          </Text>
        </View>
        <TouchableOpacity
          testID="bookings-link"
          style={styles.iconButton}
          onPress={() => router.push("/bookings")}
        >
          <Ionicons name="time-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="logout-button"
          style={styles.iconButton}
          onPress={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <SummaryStat
          label="Classrooms"
          value={String(classrooms.length)}
          color={COLORS.primary}
        />
        <SummaryStat
          label="Vacant"
          value={String(classrooms.filter((c) => c.status === "vacant").length)}
          color={COLORS.vacantText}
        />
        <SummaryStat
          label="Occupied"
          value={String(classrooms.filter((c) => c.status === "occupied").length)}
          color={COLORS.occupiedText}
        />
        <SummaryStat
          label="Unavailable"
          value={String(classrooms.filter((c) => c.status === "unavailable").length)}
          color={COLORS.unavailableText}
        />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={classrooms}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} resizeMode="contain" />
              <Text style={styles.emptyTitle}>No classrooms yet</Text>
              <Text style={styles.emptyText}>
                {user?.role === "admin"
                  ? "Add your first classroom to get started."
                  : "Ask an admin to add classrooms."}
              </Text>
            </View>
          }
        />
      )}

      {user?.role === "admin" && (
        <TouchableOpacity testID="add-classroom-fab" style={styles.fab} onPress={openAdd}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add/Edit Classroom Modal */}
      <Modal
        visible={classroomModal.open}
        animationType="slide"
        transparent
        onRequestClose={() => setClassroomModal({ open: false, editing: null })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {classroomModal.editing ? "Edit classroom" : "New classroom"}
              </Text>

              <FormInput
                testID="classroom-name-input"
                label="Name *"
                value={cName}
                onChangeText={setCName}
                placeholder="Room 101"
              />
              <FormInput
                testID="classroom-building-input"
                label="Building *"
                value={cBuilding}
                onChangeText={setCBuilding}
                placeholder="Science Block"
              />
              <FormInput
                testID="classroom-floor-input"
                label="Floor *"
                value={cFloor}
                onChangeText={setCFloor}
                placeholder="2"
              />
              <FormInput
                testID="classroom-capacity-input"
                label="Capacity *"
                value={cCapacity}
                onChangeText={setCCapacity}
                placeholder="30"
                keyboardType="number-pad"
              />
              <FormInput
                testID="classroom-equipment-input"
                label="Equipment (comma separated)"
                value={cEquipment}
                onChangeText={setCEquipment}
                placeholder="Projector, Whiteboard, AC"
              />

              {cError ? <Text style={styles.errorText}>{cError}</Text> : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  testID="classroom-cancel-button"
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setClassroomModal({ open: false, editing: null })}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="classroom-save-button"
                  style={[styles.modalBtn, styles.modalBtnPrimary, cSaving && { opacity: 0.6 }]}
                  onPress={saveClassroom}
                  disabled={cSaving}
                >
                  {cSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>
                      {classroomModal.editing ? "Save" : "Add classroom"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Book Modal */}
      <Modal
        visible={bookModal.open}
        animationType="slide"
        transparent
        onRequestClose={() => setBookModal({ open: false, room: null })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Book {bookModal.room?.name}</Text>
              <Text style={styles.modalSubtitle}>
                {bookModal.room?.building} · Floor {bookModal.room?.floor} · Today
              </Text>

              <FormInput
                testID="booking-purpose-input"
                label="Purpose *"
                value={bPurpose}
                onChangeText={setBPurpose}
                placeholder="Math class, Lab session..."
              />
              <FormInput
                testID="booking-start-input"
                label="Start time (HH:MM, 24h) *"
                value={bStart}
                onChangeText={setBStart}
                placeholder="10:00"
              />
              <FormInput
                testID="booking-end-input"
                label="End time (HH:MM, 24h) *"
                value={bEnd}
                onChangeText={setBEnd}
                placeholder="11:00"
              />

              {bError ? (
                <Text testID="booking-error" style={styles.errorText}>
                  {bError}
                </Text>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  testID="booking-cancel-button"
                  style={[styles.modalBtn, styles.modalBtnSecondary]}
                  onPress={() => setBookModal({ open: false, room: null })}
                >
                  <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="booking-confirm-button"
                  style={[styles.modalBtn, styles.modalBtnPrimary, bSaving && { opacity: 0.6 }]}
                  onPress={submitBooking}
                  disabled={bSaving}
                >
                  {bSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnPrimaryText}>Confirm booking</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FormInput({
  label,
  testID,
  ...props
}: {
  label: string;
  testID?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "email-address";
}) {
  return (
    <View style={{ marginBottom: SPACING.md }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.formInput}
        placeholderTextColor={COLORS.textMuted}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  greet: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  role: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: "700" },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  cardTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  cardSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    gap: 6,
  },
  pillVacant: { backgroundColor: COLORS.vacantBg, borderColor: COLORS.vacantBorder },
  pillOccupied: { backgroundColor: COLORS.occupiedBg, borderColor: COLORS.occupiedBorder },
  pillUnavailable: { backgroundColor: COLORS.unavailableBg, borderColor: COLORS.unavailableBorder },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "700" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACING.sm },
  tag: {
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  tagText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "500" },
  unavailableBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.unavailableBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.unavailableBorder,
  },
  unavailableText: { color: COLORS.unavailableText, fontWeight: "600", fontSize: 13, flex: 1 },
  upcomingBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.bookedBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.bookedBorder,
  },
  upcomingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.bookedText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  upcomingValue: { fontSize: 14, fontWeight: "700", color: COLORS.bookedText, marginTop: 2 },
  upcomingPurpose: { fontSize: 13, color: COLORS.bookedText, marginTop: 2 },
  currentBookingBox: {
    marginTop: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.occupiedBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.occupiedBorder,
  },
  currentBookingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.occupiedText,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  currentBookingValue: { fontSize: 14, fontWeight: "700", color: COLORS.occupiedText, marginTop: 2 },
  currentBookingPurpose: { fontSize: 13, color: COLORS.occupiedText, marginTop: 2 },
  actionsRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    gap: 6,
    flex: 1,
  },
  actionPrimary: { backgroundColor: COLORS.primary },
  actionPrimaryText: { color: "#fff", fontWeight: "700" },
  actionSecondary: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionSecondaryText: { color: COLORS.textPrimary, fontWeight: "700" },
  actionDanger: { backgroundColor: COLORS.danger },
  actionDangerText: { color: "#fff", fontWeight: "700" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: SPACING.xxl },
  emptyImg: { width: 180, height: 180, marginBottom: SPACING.md },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", marginTop: 6, paddingHorizontal: SPACING.lg },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: SPACING.lg + 8,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.lg,
    maxHeight: "90%",
  },
  modalTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary },
  modalSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.md },
  modalActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnPrimary: { backgroundColor: COLORS.primary },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalBtnSecondary: { backgroundColor: COLORS.inputBg },
  modalBtnSecondaryText: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 15 },
  formLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary, marginBottom: 6 },
  formInput: {
    backgroundColor: COLORS.inputBg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  errorText: { color: COLORS.danger, fontSize: 14, marginTop: 4 },
});
