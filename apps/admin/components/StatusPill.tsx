import type { PayoutStatus, QuizStatus } from "@mini-quiz/shared";

// Visual variants map to badge classes in globals.css.
type Variant =
  | "live"
  | "scheduled"
  | "draft"
  | "ended"
  | "archived"
  | "paid"
  | "pending"
  | "approved"
  | "broadcast"
  | "confirmed"
  | "failed"
  | "review"
  | "processing";

const QUIZ_VARIANT: Record<QuizStatus, Variant> = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  LIVE: "live",
  ENDED: "ended",
  ARCHIVED: "archived",
};

const PAYOUT_VARIANT: Record<PayoutStatus, Variant> = {
  PENDING: "pending",
  APPROVED: "approved",
  BROADCAST: "broadcast",
  CONFIRMED: "paid",
  FAILED: "failed",
};

export function QuizStatusPill({ status }: { status: QuizStatus }) {
  return <span className={`adm-badge ${QUIZ_VARIANT[status]}`}>{status}</span>;
}

export function PayoutStatusPill({ status }: { status: PayoutStatus }) {
  // CONFIRMED reads as "PAID" in the design.
  const label = status === "CONFIRMED" ? "PAID" : status;
  return <span className={`adm-badge ${PAYOUT_VARIANT[status]}`}>{label}</span>;
}

export function CustomPill({
  variant,
  children,
}: {
  variant: Variant;
  children: React.ReactNode;
}) {
  return <span className={`adm-badge ${variant}`}>{children}</span>;
}
