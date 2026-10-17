import { createCrudHandlers } from "@/lib/crud";

/**
 * Device & integration registry CRUD.
 * Devices represent barrier gates, RFID readers, ANPR/LPR cameras, printers,
 * kiosks and access controllers. Reachability is tested explicitly via
 * /devices/[id]/test — a row existing says nothing about live connectivity.
 */
export const { GET, POST } = createCrudHandlers({
  table: "parking_devices",
  resource: "parking_devices",
  columns: [
    "site_id", "gate_id", "name", "code", "device_type", "direction", "protocol",
    "host", "port", "endpoint", "min_confidence", "status", "is_enabled", "notes",
  ],
  searchable: ["name", "code", "host"],
  filters: ["device_type", "status", "site_id", "gate_id", "is_enabled"],
  orderBy: "id DESC",
  auditEntity: "parking_device",
});
