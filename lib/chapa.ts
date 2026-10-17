const CHAPA_API = "https://api.chapa.co/v1";

function getSecretKey() {
  return process.env.CHAPA_SECRET_KEY || "";
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getSecretKey()}`,
    "Content-Type": "application/json",
  };
}

export interface ChapaInitializeParams {
  amount: number;
  currency?: string;
  email: string;
  first_name: string;
  last_name?: string;
  phone_number?: string;
  tx_ref: string;
  callback_url?: string;
  return_url?: string;
  customization?: {
    title?: string;
    description?: string;
  };
}

export interface ChapaResponse {
  status: "success" | "failed";
  message: string;
  data?: {
    checkout_url: string;
    tx_ref: string;
  };
}

export async function initializePayment(params: ChapaInitializeParams): Promise<ChapaResponse> {
  try {
    const body: Record<string, any> = {
      amount: String(params.amount),
      currency: params.currency || "ETB",
      email: params.email,
      first_name: params.first_name,
      tx_ref: params.tx_ref,
      callback_url: params.callback_url || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/membership/parking/chapa/callback`,
      return_url: params.return_url || `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/membership/parking/pos`,
    };

    if (params.last_name) body.last_name = params.last_name;
    if (params.phone_number) body.phone_number = params.phone_number;
    if (params.customization) body.customization = params.customization;

    const res = await fetch(`${CHAPA_API}/transaction/initialize`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    return await res.json();
  } catch (err: any) {
    return { status: "failed", message: err.message };
  }
}

export async function verifyPayment(txRef: string): Promise<ChapaResponse> {
  try {
    const res = await fetch(`${CHAPA_API}/transaction/verify/${txRef}`, {
      method: "GET",
      headers: getHeaders(),
    });
    return await res.json();
  } catch (err: any) {
    return { status: "failed", message: err.message };
  }
}
