# AddisPay Integration

Status: **UAT verified working.** Moving to the real AddisPay API only requires
swapping the base URL and secret key and redeploying — no code changes.

This document covers the online checkout used by **Vehicle Exit → Self Checkout**.

---

## 1. Where the code lives

| File | Responsibility |
| --- | --- |
| `lib/addispay.ts` | Low-level AddisPay client: `createOrder`, `getOrder`, `checkStatus`. |
| `lib/addispay-complete.ts` | Verifies a payment and atomically closes the parking session + releases the space. Idempotent. |
| `app/api/membership/parking/addispay/initialize/route.ts` | Authenticated. Prices the session server-side, creates the order, stores the payment row. |
| `app/api/membership/parking/addispay/callback/route.ts` | Unauthenticated gateway redirect. Completes the payment, then redirects back to the app. |
| `app/api/membership/parking/addispay/verify/[tx_ref]/route.ts` | Authenticated status poll used by the checkout dialog (every 5 s). |
| `app/dashboard/membership/parking/exit/page.tsx` | Self-checkout UI: QR dialog, "Open checkout page", "Check status". |

---

## 2. Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ADDISPAY_SECRET_KEY` | Yes | Secret key from the AddisPay dashboard. Sent as the `Auth` header. |
| `ADDISPAY_API_URL` | Yes | Base URL of the AddisPay API. Must start with `http://` or `https://`. |
| `NEXT_PUBLIC_APP_URL` | Recommended | Public URL of this app, used for fallback gateway callbacks. |
| `DATABASE_URL` | Yes | PostgreSQL (Neon) connection string. |
| `JWT_SECRET` | Yes | Must match the ERP secret (`genius-hrms-secret-key-2026`). |

### UAT values

```
ADDISPAY_API_URL="https://uat.api.addispay.et"
ADDISPAY_SECRET_KEY="<your UAT key>"
NEXT_PUBLIC_APP_URL="https://parkingmangement.vercel.app"
```

The client validates the base URL: if `ADDISPAY_API_URL` is empty or not a valid
`http(s)` URL (e.g. a placeholder such as `DEFAULT`), it falls back to
`https://uat.api.addispay.et` instead of throwing `Failed to parse URL`. The key is
trimmed before use.

---

## 3. Payment flow

```
Self Checkout lookup
        │  POST /addispay/initialize  { session_id, return_url }
        ▼
initialize route ── priceSession() (server-side, client cannot set price)
        │  POST {ADDISPAY_API_URL}/checkout-api/v1/create-order   (Auth: key)
        │  INSERT parking_payments (payment_method='addispay',
        │         reference=tx_ref, notes='uuid:<uuid>')
        ▼
{ checkout_url, uuid, tx_ref, amount, currency }
        │
        ▼
Exit page dialog: QR of checkout_url + "Open checkout page"
        │
        ▼
Customer pays on AddisPay
        │
        ├─ AddisPay → success_url → GET /addispay/callback?tx_ref=…&session_id=…&return_url=…
        │        └─ completeAddisPayPayment(tx_ref)
        │              └─ GET …/transaction/check-status?uuid=…
        │              └─ close session, release slot, mark paid
        │        └─ 302 → return_url?addispay=success&session=…
        │
        └─ Exit page polls GET /addispay/verify/:tx_ref every 5 s (fallback)
```

### AddisPay endpoints used

All calls send `Auth: <ADDISPAY_SECRET_KEY>` and `Content-Type: application/json`.

| Method | Path |
| --- | --- |
| `POST` | `/checkout-api/v1/create-order` |
| `GET` | `/checkout-api/v1/get-order?uuid=<uuid>` |
| `GET` | `/checkout-api/v1/transaction/check-status?uuid=<uuid>` |

`create-order` body (built in `lib/addispay.ts`):

```json
{
  "data": {
    "total_amount": "150",
    "currency": "ETB",
    "tx_ref": "ADP-000123-<ts36>",
    "nonce": "nonce-<ts>-<random>",
    "first_name": "Customer",
    "last_name": "...",
    "email": "...",
    "phone_number": "...",
    "redirect_url": "https://<app>/dashboard/membership/parking/exit?...",
    "cancel_url": "https://<app>/dashboard/membership/parking/exit?...",
    "success_url": "https://<app>/api/membership/parking/addispay/callback?...",
    "error_url": "https://<app>/dashboard/membership/parking/exit?...",
    "order_reason": "Parking fee - ABC-123",
    "order_detail": { "amount": 150, "description": "Parking fee for ABC-123" }
  },
  "message": "Parking payment"
}
```

---

## 4. What gets written on success

`completeAddisPayPayment()` runs in a transaction:

- `parking_sessions`: `status='completed'`, `exit_time`, `duration_minutes`,
  `gross_amount = amount`, `amount_paid`, `paid=TRUE`, `payment_status='paid'`,
  `exit_method='qr'`.
- `parking_slots`: `status='available'`, `current_session_id = NULL`.
- `parking_payments` was already inserted at initialize time.
- A `PAYMENT` entry is written to the parking audit log at initialize time.

Calling it again is safe: an already-closed session is left untouched.

---

## 5. Switching to the real (production) AddisPay API

1. Obtain from AddisPay:
   - the **production secret key**
   - the **production base URL** (the UAT base is `https://uat.api.addispay.et`;
     use exactly the base they issue for production, no trailing slash).
2. Update the Vercel **Production** environment variables:

   ```bash
   vercel env add ADDISPAY_SECRET_KEY production --value "<production-key>" --force
   vercel env add ADDISPAY_API_URL  production --value "<production-base-url>" --force
   vercel env add NEXT_PUBLIC_APP_URL production --value "https://parkingmangement.vercel.app" --force
   ```

3. Redeploy — **environment changes only apply to new deployments**:

   ```bash
   vercel --prod --yes
   ```

4. Run one small live transaction and confirm it in the AddisPay dashboard and in
   `parking_payments`.
5. Confirm the gateway can reach the public callback URL. Never leave
   `NEXT_PUBLIC_APP_URL` pointing at `localhost` in production.

> Keep `.env` out of git. It is covered by `.gitignore` and `.vercelignore`.
> Rotate the key immediately if it is ever exposed.

---

## 6. Testing checklist

- [ ] Sidebar → **Self Checkout** (`/exit?mode=self`); method defaults to AddisPay.
- [ ] Look up an active session (ticket, plate, slot, or QR).
- [ ] Tap **Pay … with AddisPay** → QR + checkout URL appear.
- [ ] Complete the payment in UAT.
- [ ] Dialog flips to success (poll or callback) and the session closes.
- [ ] Slot returns to `available`; session shows `paid` / `completed`.
- [ ] `parking_payments` has one row with `payment_method='addispay'` and `reference=tx_ref`.
- [ ] Re-running verify does **not** double-charge or reopen a closed session.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 {"message":"API key missing"}` | `ADDISPAY_SECRET_KEY` missing/blank/wrong env | Set the key for Production, redeploy. |
| `Failed to parse URL from DEFAULT_…/checkout-api/…` | `ADDISPAY_API_URL` held a placeholder, not a URL | Set a valid `https://…` base URL; current code falls back to UAT if invalid. |
| AddisPay button not visible | Exit page in **Cashier / Attendant** mode or method = cash | Use **Self Checkout** in the sidebar; AddisPay is the default method there. |
| `There is nothing to pay for this session` | Amount due is 0 (covered/grace) | Use the cashier exit path for zero-value closures. |
| `502 … order could not be created` | Gateway rejected the request | Read the returned message; check key/environment and Vercel function logs. |
| Old config still used after editing env | No redeploy since the change | Run `vercel --prod --yes`. |
| Callback lands on `localhost` | `NEXT_PUBLIC_APP_URL` is local | Set it to the deployed domain and redeploy. |
| Payment succeeded but session still active | Callback never reached the app | The dialog's 5 s verify poll will complete it; otherwise hit verify manually. |

Useful commands:

```bash
vercel env ls
vercel logs parkingmangement
vercel --prod --yes
```
