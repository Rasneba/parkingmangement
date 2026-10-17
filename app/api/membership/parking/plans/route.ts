import { createCrudHandlers } from "@/lib/crud";

/**
 * Subscription plans (membership_plans where type='parking').
 * Used to price and duration new memberships.
 */
export const { GET, POST } = createCrudHandlers({
  table: "membership_plans",
  resource: "parking_subscriptions",
  columns: ["name", "description", "price", "currency", "duration_days", "type", "max_members", "is_active"],
  searchable: ["name"],
  filters: ["type", "is_active"],
  orderBy: "id DESC",
  auditEntity: "membership_plan",
});
