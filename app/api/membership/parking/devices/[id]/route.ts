import { createItemHandlers } from "@/lib/crud";

export const { GET, PUT, DELETE } = createItemHandlers({
  table: "parking_devices",
  resource: "parking_devices",
  columns: [
    "site_id", "gate_id", "name", "code", "device_type", "direction", "protocol",
    "host", "port", "endpoint", "min_confidence", "status", "is_enabled", "notes",
  ],
  searchable: ["name", "code", "host"],
  auditEntity: "parking_device",
});
