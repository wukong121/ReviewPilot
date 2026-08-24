export type ReviewVersionStatus =
  | "DRAFT"
  | "REVISION_DRAFT"
  | "AI_PROCESSING"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";

const ALLOWED_TRANSITIONS: Record<ReviewVersionStatus, ReadonlySet<ReviewVersionStatus>> = {
  DRAFT: new Set(["AI_PROCESSING"]),
  REVISION_DRAFT: new Set(["AI_PROCESSING"]),
  AI_PROCESSING: new Set(["PENDING_REVIEW"]),
  PENDING_REVIEW: new Set(["APPROVED", "REJECTED"]),
  APPROVED: new Set(),
  REJECTED: new Set(),
};

export function assertTransition(from: ReviewVersionStatus, to: ReviewVersionStatus): void {
  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new Error(`invalid review transition: ${from} -> ${to}`);
  }
}
