import { createItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = createItemHandlers({
  table: "parking_sites",
  resource: "parking_sites",
  columns: ["name", "code", "address", "city", "latitude", "longitude", "total_capacity", "contact_name", "contact_phone", "is_active", "notes"],
  searchable: ["name", "code", "city"],
  auditEntity: "parking_site",
});
