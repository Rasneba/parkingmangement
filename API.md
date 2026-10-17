# Parking API Reference

Base path: `/api`. Every request must send `Authorization: Bearer <jwt>` except
`POST /api/auth/login`. Responses are JSON and list endpoints are scoped to the
caller's `company_id`. Users whose role is `super_admin` operate across companies.

Standard status codes: `200` OK, `201` Created, `400` Bad request, `401`
Unauthorized, `403` Forbidden, `404` Not found, `405` Method not allowed,
`409` Conflict, `500` Server error.

The parking module is split into two namespaces:

- `/api/membership/parking/*` — CRUD, POS, reports and payment gateways.
- `/api/parking/access/*` — the hardware/bridge and QR access surface.

---

## Auth

### `POST /api/auth/login`
Body: `{ email, password, company_tin? }` → `{ message, token, user }`.

### `GET /api/auth/me`
Returns the authenticated user.

---

## Dashboard

### `GET /api/membership/parking/stats`
KPIs: `activeSessions`, `totalSlots`, `occupiedSlots`, `availableSlots`,
`todayRevenue`, `todayEntries`, `todayExits`, `totalCustomers`,
`activeSubscriptions`, `recentSessions[]`.

---

## Facility

`zones`, `slots`, `gates`, `cameras` follow the same conventions:

- `GET  /api/membership/parking/<resource>` — list (`?q=`, resource filters).
- `POST /api/membership/parking/<resource>` — create (`company_id` injected).
- `GET|PUT|DELETE /api/membership/parking/<resource>/:id` — read/update/delete.

| Resource | Endpoint | Notable filters / fields |
| --- | --- | --- |
| Zones | `/zones` | `name`, `code`, `floor`, `type`, `slot_count`, `is_active` |
| Slots | `/slots` | `zone_id`, `slot_number`, `floor`, `status`, `type` |
| Gates | `/gates` | `name`, `code`, `type` (`entry\|exit\|dual`), `direction`, `ip_address` |
| Cameras | `/cameras` | `name`, `location`, `channel`, `ip_address`, `type`, `is_active` |

---

## Registry

| Resource | Endpoint | Notes |
| --- | --- | --- |
| Customers | `/customers` | Backed by `membership_members`. `GET /customers/next-id` returns the next `customer_id` (`CUT-###`). |
| Vehicles | `/vehicles` | Plate, type, owner, `customer_id`, `is_resident`, `is_blacklisted`. |
| RFID cards | `/rfid-cards` | `card_uid` (unique/company), `label`, `status`, `member_id`. |

Customers, vehicles and RFID cards support `GET/POST` on the collection and
`GET|PUT|DELETE /:id` on a single record.

---

## Sessions & POS

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/sessions` | Query: `status`, `plate`, `zone_id`, `from`, `to`, `limit`. |
| `POST` | `/sessions` | Records an entry; creates the vehicle if unknown; generates `ticket_number`. |
| `GET` | `/sessions/:id` | One session with vehicle/zone/gate detail. |
| `PUT` | `/sessions/:id` | Update whitelisted columns. |
| `DELETE` | `/sessions/:id` | Remove a session. |
| `GET` | `/payments` | Query: `date`, `from`, `to`, `method`, `q`. |
| `POST` | `/payments` | Settles a session; returns `{ payment, session }`. |
| `GET` | `/payments/:id` | One payment. |
| `PUT`/`DELETE` | `/payments/:id` | Update/remove a payment. |
| `POST` | `/kiosk` | Self-service ticket issue + fee. |
| `POST` | `/kiosk/lookup` | Look up a session/ticket number and return the amount due. |

---

## Subscriptions & rates

| Resource | Endpoint | Notes |
| --- | --- | --- |
| Subscription plans | table `membership_plans` (`type='parking'`) | Used to price subscriptions. |
| Subscriptions | `/subscriptions` | `GET/POST` list/create, `GET|PUT|DELETE /:id`. Create body: `customer_id`, `vehicle_id?`, `plan_id?`, `plan_type`, `start_date`, `end_date`, `amount`, `payment_method`, `payment_reference`, `auto_renew`, `notes`. Returns a QR image. |
| Rates | `/rates` | `GET/POST`, `GET|PUT|DELETE /:id`. Fields include `name`, `vehicle_type`, `rate_type`, `base_rate`, `per_hour_rate`, `per_day_rate`, `billing_increment_minutes`, `grace_period_minutes`, `min_charge`, `currency`, `is_active`, `is_default`. |

---

## QR tickets

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/qr-tickets` | List (filters: `status`, `q`). |
| `POST` | `/qr-tickets` | Create a visitor QR ticket + data URL. |
| `GET` | `/qr-tickets/:id` | One ticket + data URL. |
| `PUT` | `/qr-tickets/:id` | Update status. |
| `DELETE` | `/qr-tickets/:id` | Remove a ticket. |

---

## Reports

| Endpoint | Returns |
| --- | --- |
| `GET /reports/access-logs` | The `parking_access_logs` view: entry/exit, duration, amount, payment trail. |
| `GET /reports/controller-swipes` | RFID swipe log (`rfid_access_logs`) with grant/deny reason. |
| `GET /reports/subscriptions` | Subscription report rows. |

---

## RFID access

### `POST /api/membership/parking/rfid-card-lookup`
Given a `card_uid`, returns the member, active subscription, plan, remaining days
and whether access is granted; optionally opens the gate via the controller.

---

## Access hardware bridge — `/api/parking/access`

| Method | Endpoint | Notes |
| --- | --- | --- |
| `GET` | `/api/parking/access` | Controller status / relay helper (reads controller events). |
| `GET` | `/api/parking/access/live` | Live entry feed (recent sessions/logs). |
| `GET` | `/api/parking/access/logs` | Access log stream. |
| `GET` | `/api/parking/access/qr-live` | Live QR-lookup feed. |
| `POST` | `/api/parking/access/qr-lookup` | Resolves a QR payload to a session/subscription. |
| `POST` | `/api/parking/access/relay` | Queue/trigger a relay command (open door). |
| `GET` | `/api/parking/access/relay` | Poll pending relay commands (for the local bridge). |
| `POST` | `/api/parking/access/swipes` | Controller posts raw RFID swipes → `rfid_access_logs`. |

---

## Online payments

| Gateway | Endpoints |
| --- | --- |
| Chapa | `POST /chapa/initialize`, `GET /chapa/callback`, `POST /chapa/callback`, `GET /chapa/verify/:tx_ref` |
| AddisPay | `POST /addispay/initialize`, `GET /addispay/callback`, `GET /addispay/verify/:tx_ref` |

Both require the matching `*_SECRET_KEY` environment variable (see `.env.example`).
