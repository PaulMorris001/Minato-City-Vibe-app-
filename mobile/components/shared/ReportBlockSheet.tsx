import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BottomSheetModal from "./BottomSheetModal";
import { Fonts } from "@/constants/fonts";
import {
  reportContent,
  blockUser,
  type ReportReason,
  type ReportTargetType,
} from "@/services/moderation.service";

interface ReportBlockSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string;
  targetUsername?: string;
  currentUserId?: string;
  /** Called after a successful block — caller should refresh feed and/or navigate back. */
  onBlocked?: () => void;
  /** Called after a successful report — for showing a toast or refreshing. */
  onReported?: () => void;
}

const REASONS: { value: ReportReason; label: string; description: string }[] = [
  { value: "spam", label: "Spam", description: "Repetitive or unwanted promotional content" },
  { value: "harassment", label: "Harassment or bullying", description: "Threats, intimidation, or targeted abuse" },
  { value: "hate", label: "Hate speech", description: "Attacks based on identity" },
  { value: "sexual", label: "Sexual content", description: "Explicit or sexually suggestive material" },
  { value: "violence", label: "Violence or dangerous content", description: "Graphic violence or illegal activity" },
  { value: "fraud", label: "Fraud or scam", description: "Event isn't real, organizer didn't show up, or money was taken without delivery" },
  { value: "other", label: "Something else", description: "Tell us what's wrong" },
];

export default function ReportBlockSheet({
  visible,
  onClose,
  targetType,
  targetId,
  targetUserId,
  targetUsername,
  currentUserId,
  onBlocked,
  onReported,
}: ReportBlockSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const canBlock =
    !!targetUserId && (!currentUserId || targetUserId !== currentUserId);

  const reset = () => {
    setReason(null);
    setDetails("");
    setSubmitting(false);
    setBlocking(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitReport = async () => {
    if (!reason) {
      Alert.alert("Pick a reason", "Tell us what's wrong so we can review.");
      return;
    }
    setSubmitting(true);
    try {
      await reportContent({ targetType, targetId, reason, details });
      Alert.alert(
        "Thanks for the report",
        "We'll review this within 24 hours and take action if it violates our policies."
      );
      onReported?.();
      handleClose();
    } catch (err: any) {
      Alert.alert("Couldn't submit report", err?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmBlock = () => {
    if (!targetUserId) return;
    const name = targetUsername ? `@${targetUsername}` : "this user";
    Alert.alert(
      `Block ${name}?`,
      `They won't see your content and you won't see theirs. We'll also review the situation.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            setBlocking(true);
            try {
              await blockUser(targetUserId);
              onBlocked?.();
              handleClose();
            } catch (err: any) {
              Alert.alert("Couldn't block", err?.message || "Please try again.");
            } finally {
              setBlocking(false);
            }
          },
        },
      ]
    );
  };

  return (
    <BottomSheetModal visible={visible} onClose={handleClose} title="Report or block">
      <Text style={styles.sectionLabel}>Why are you reporting this?</Text>
      {REASONS.map((r) => {
        const selected = reason === r.value;
        return (
          <TouchableOpacity
            key={r.value}
            style={[styles.reasonRow, selected && styles.reasonRowSelected]}
            onPress={() => setReason(r.value)}
            activeOpacity={0.7}
          >
            <View style={styles.reasonText}>
              <Text style={styles.reasonLabel}>{r.label}</Text>
              <Text style={styles.reasonDescription}>{r.description}</Text>
            </View>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
          </TouchableOpacity>
        );
      })}

      <TextInput
        style={styles.details}
        placeholder="Add more details (optional)"
        placeholderTextColor="#6b7280"
        value={details}
        onChangeText={setDetails}
        multiline
        numberOfLines={3}
        maxLength={1000}
      />

      <TouchableOpacity
        style={[styles.primary, (!reason || submitting) && styles.primaryDisabled]}
        onPress={submitReport}
        disabled={!reason || submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Submit report</Text>
        )}
      </TouchableOpacity>

      {canBlock ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>
            Block {targetUsername ? `@${targetUsername}` : "this user"}
          </Text>
          <Text style={styles.blockHelp}>
            They won't see your content and you won't see theirs. This also
            notifies our moderation team.
          </Text>
          <TouchableOpacity
            style={[styles.secondary, blocking && styles.primaryDisabled]}
            onPress={confirmBlock}
            disabled={blocking}
            activeOpacity={0.8}
          >
            {blocking ? (
              <ActivityIndicator color="#ef4444" />
            ) : (
              <Text style={styles.secondaryText}>
                Block {targetUsername ? `@${targetUsername}` : "user"}
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : null}

      <View style={{ height: 24 }} />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: "#fff",
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#16161f",
    marginBottom: 8,
  },
  reasonRowSelected: {
    borderColor: "#a855f7",
    backgroundColor: "#1f1730",
  },
  reasonText: {
    flex: 1,
    marginRight: 12,
  },
  reasonLabel: {
    color: "#fff",
    fontFamily: Fonts.medium,
    fontSize: 14,
    marginBottom: 2,
  },
  reasonDescription: {
    color: "#9ca3af",
    fontSize: 12,
    lineHeight: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#6b7280",
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: {
    backgroundColor: "#a855f7",
    borderColor: "#a855f7",
  },
  details: {
    backgroundColor: "#16161f",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 12,
    color: "#fff",
    minHeight: 80,
    textAlignVertical: "top",
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
  },
  primary: {
    backgroundColor: "#a855f7",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: "#fff",
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginVertical: 24,
  },
  blockHelp: {
    color: "#9ca3af",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  secondary: {
    borderWidth: 1,
    borderColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryText: {
    color: "#ef4444",
    fontFamily: Fonts.semiBold,
    fontSize: 16,
  },
});
