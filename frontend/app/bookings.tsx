import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/AuthContext";
import { api, formatApiError, Booking } from "../src/api";
import { COLORS, RADIUS, SPACING } from "../src/theme";
import { formatDateTime } from "../src/utils";

const EMPTY_IMG =
  "https://static.prod-images.emergentagent.com/jobs/3e3f40c1-2328-46a3-9026-78df207c0385/images/36200345491d9ef6035f2d3aa37028da1d44e9027c4be6bc960a1342af72e447.png";

type Filter = "upcoming" | "all";

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

export default function Bookings() {
  const { user } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("upcoming");

  const load = useCallback(async () => {
    try {
      const params: any = {};
      if (filter === "upcoming") params.upcoming = true;
      // Admin sees all; teacher endpoint already restricts to own bookings server-side.
      const { data } = await api.get<Booking[]>("/bookings", { params });
      setBookings(data);
    } catch (e) {
      // ignore
    }
  }, [filter]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function cancel(b: Booking) {
    confirm("Cancel booking", `Cancel "${b.purpose}" at ${b.classroom_name}?`, async () => {
      try {
        await api.delete(`/bookings/${b.id}`);
        await load();
      } catch (e: any) {
        Alert.alert("Error", formatApiError(e));
      }
    });
  }

  function renderItem({ item }: { item: Booking }) {
    const now = new Date();
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    const isOngoing = start <= now && end >= now;
    const isPast = end < now;
    return (
      <View style={styles.card} testID={`booking-card-${item.id}`}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.classroom}>{item.classroom_name}</Text>
            <Text style={styles.purpose}>{item.purpose}</Text>
          </View>
          <View
            style={[
              styles.pill,
              isOngoing ? styles.pillNow : isPast ? styles.pillPast : styles.pillUpcoming,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                {
                  color: isOngoing
                    ? COLORS.occupiedText
                    : isPast
                    ? COLORS.textSecondary
                    : COLORS.bookedText,
                },
              ]}
            >
              {isOngoing ? "Now" : isPast ? "Past" : "Upcoming"}
            </Text>
          </View>
        </View>

        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.timeText}>
            {formatDateTime(item.start_time)} → {formatDateTime(item.end_time)}
          </Text>
        </View>

        {user?.role === "admin" && (
          <View style={styles.byRow}>
            <Ionicons name="person-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.byText}>Booked by {item.teacher_name}</Text>
          </View>
        )}

        {!isPast && (
          <TouchableOpacity
            testID={`cancel-booking-${item.id}`}
            style={styles.cancelBtn}
            onPress={() => cancel(item)}
          >
            <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
            <Text style={styles.cancelText}>Cancel booking</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="back-button"
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>
          {user?.role === "admin" ? "All bookings" : "My bookings"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabsRow}>
        <FilterTab
          testID="filter-upcoming"
          label="Upcoming"
          active={filter === "upcoming"}
          onPress={() => setFilter("upcoming")}
        />
        <FilterTab
          testID="filter-all"
          label="All"
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Image source={{ uri: EMPTY_IMG }} style={styles.emptyImg} resizeMode="contain" />
              <Text style={styles.emptyTitle}>No bookings here</Text>
              <Text style={styles.emptyText}>
                {filter === "upcoming"
                  ? "You don't have any upcoming bookings."
                  : "Bookings you create will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FilterTab({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.filterTab, active && styles.filterTabActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: 20, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  tabsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.textPrimary, borderColor: COLORS.textPrimary },
  filterText: { color: COLORS.textSecondary, fontWeight: "600", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  classroom: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  purpose: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1 },
  pillUpcoming: { backgroundColor: COLORS.bookedBg, borderColor: COLORS.bookedBorder },
  pillNow: { backgroundColor: COLORS.occupiedBg, borderColor: COLORS.occupiedBorder },
  pillPast: { backgroundColor: COLORS.inputBg, borderColor: COLORS.border },
  pillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm },
  timeText: { fontSize: 13, color: COLORS.textSecondary },
  byRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  byText: { fontSize: 13, color: COLORS.textSecondary },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: SPACING.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  cancelText: { color: COLORS.danger, fontWeight: "700", fontSize: 13 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: SPACING.xxl },
  emptyImg: { width: 180, height: 180, marginBottom: SPACING.md },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", marginTop: 6, paddingHorizontal: SPACING.lg },
});
