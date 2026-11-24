import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return jsonResponse({ error: "Sign in to use product lookup." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase function environment is missing required values.");
    return jsonResponse({ error: "Product lookup is not configured." }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "A valid staff sign-in is required." }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to check product lookup role:", profileError.message);
    return jsonResponse({ error: "Unable to verify Shop Admin access." }, 500);
  }
  if (profile?.role !== "shop_admin") {
    return jsonResponse({ error: "Only Shop Admins can use product lookup." }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const barcodeValue = typeof body === "object" && body !== null && "barcode" in body
    ? body.barcode
    : undefined;
  const barcode = typeof barcodeValue === "string" ? barcodeValue.trim() : "";
  if (!/^(?:\d{8}|\d{12,14})$/.test(barcode)) {
    return jsonResponse({ error: "Enter an 8- or 12–14-digit UPC/EAN/GTIN barcode." }, 400);
  }

  const lookupUrl = new URL("https://api.upcitemdb.com/prod/trial/lookup");
  lookupUrl.searchParams.set("upc", barcode);

  let upstream: Response;
  try {
    upstream = await fetch(lookupUrl, { headers: { Accept: "application/json" } });
  } catch (error) {
    console.error("UPCitemdb request failed:", error);
    return jsonResponse({ error: "The product catalogue service could not be reached." }, 502);
  }

  if (upstream.status === 429) {
    return jsonResponse({ error: "The product lookup daily limit has been reached. Try again later." }, 429);
  }
  if (!upstream.ok) {
    console.error("UPCitemdb returned HTTP status:", upstream.status);
    return jsonResponse({ error: "The product catalogue service returned an error." }, 502);
  }

  let result: {
    items?: Array<{
      title?: unknown;
      brand?: unknown;
      model?: unknown;
      description?: unknown;
      category?: unknown;
    }>;
  };
  try {
    result = await upstream.json();
  } catch (error) {
    console.error("UPCitemdb returned invalid JSON:", error);
    return jsonResponse({ error: "The product catalogue returned an invalid response." }, 502);
  }

  const item = result.items?.[0];
  if (!item) return jsonResponse({ product: null });

  return jsonResponse({
    product: {
      name: text(item.title),
      brand: text(item.brand),
      model: text(item.model),
      description: text(item.description),
      category: text(item.category),
    },
  });
});
