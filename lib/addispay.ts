const ADDISPAY_API = process.env.ADDISPAY_API_URL || "https://uat.api.addispay.et";

function getApiKey() {
  return process.env.ADDISPAY_SECRET_KEY || "";
}

export interface AddisPayInitializeParams {
  amount: number;
  currency?: string;
  first_name: string;
  last_name?: string;
  email: string;
  phone_number?: string;
  tx_ref: string;
  nonce: string;
  redirect_url?: string;
  success_url?: string;
  cancel_url?: string;
  error_url?: string;
  order_reason?: string;
  order_detail?: Record<string, any>;
}

export interface AddisPayResponse {
  status: "success" | "failed";
  message: string;
  data?: {
    uuid: string;
    checkout_url: string;
    amount: string;
  };
}

export async function createOrder(params: AddisPayInitializeParams): Promise<AddisPayResponse> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const body = {
      data: {
        redirect_url: params.redirect_url || `${appUrl}/dashboard/membership/parking/pos?session=${params.tx_ref}`,
        cancel_url: params.cancel_url || `${appUrl}/dashboard/membership/parking/pos`,
        success_url: params.success_url || `${appUrl}/api/membership/parking/addispay/callback?tx_ref=${params.tx_ref}`,
        error_url: params.error_url || `${appUrl}/dashboard/membership/parking/pos`,
        order_reason: params.order_reason || "Parking payment",
        currency: params.currency || "ETB",
        email: params.email,
        first_name: params.first_name,
        last_name: params.last_name || "",
        nonce: params.nonce,
        order_detail: params.order_detail || { amount: params.amount, description: "Parking payment" },
        phone_number: params.phone_number || "",
        total_amount: String(params.amount),
        tx_ref: params.tx_ref,
      },
      message: "Parking payment",
    };

    const res = await fetch(`${ADDISPAY_API}/checkout-api/v1/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Auth": getApiKey(),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { return { status: "failed", message: text.slice(0, 300) }; }

    if (res.ok && json.uuid && json.checkout_url) {
      const baseUrl = json.checkout_url.replace(/\/+$/, "");
      return {
        status: "success",
        message: json.status || "Order created",
        data: { uuid: json.uuid, checkout_url: `${baseUrl}/${json.uuid}`, amount: json.amount },
      };
    }

    return { status: "failed", message: json.message || json.details || "Failed to create order" };
  } catch (err: any) {
    return { status: "failed", message: err.message };
  }
}

export async function getOrder(uuid: string): Promise<{ status: string; data?: any; message: string }> {
  try {
    const res = await fetch(`${ADDISPAY_API}/checkout-api/v1/get-order?uuid=${uuid}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Auth": getApiKey(),
      },
    });

    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { return { status: "failed", message: text.slice(0, 300) }; }

    if (res.ok && json.data?.status === true) {
      return { status: "success", data: json.data, message: json.message };
    }

    return { status: "failed", data: json.data, message: json.message || "Order not found" };
  } catch (err: any) {
    return { status: "failed", message: err.message };
  }
}

export async function checkStatus(uuid: string): Promise<{ status: string; data?: any; message: string }> {
  try {
    const res = await fetch(`${ADDISPAY_API}/checkout-api/v1/transaction/check-status?uuid=${uuid}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Auth": getApiKey(),
      },
    });

    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { return { status: "failed", message: text.slice(0, 300) }; }

    if (res.ok && json.data?.status === "success") {
      return { status: "success", data: json.data, message: json.message };
    }

    return { status: json.data?.status || "pending", data: json.data, message: json.message || "Payment not completed" };
  } catch (err: any) {
    return { status: "failed", message: err.message };
  }
}
