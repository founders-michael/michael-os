import { normalizePlaceQuery, placesFromOpenMeteo } from "@/lib/place-search";
import { authenticatedLifestyleUserId } from "@/lib/product-authorization";
import { privateJson } from "@/lib/private-api-response";

export const instant = false;

const GEOCODER_URL = "https://geocoding-api.open-meteo.com/v1/search";
const GEOCODER_TIMEOUT_MS = 5_000;

/**
 * City search for choosing a time zone. Proxied so the user's browser (and IP)
 * never talks to the geocoder; only the typed city name leaves MichaelOS. It
 * returns public place data, nothing about the user, and the query is never
 * logged or stored.
 */
export async function GET(request: Request) {
  const userId = await authenticatedLifestyleUserId();
  if (!userId) return Response.json({ error: "Sign in with an account that has LifestyleOS access." }, { status: 401 });

  const query = normalizePlaceQuery(new URL(request.url).searchParams.get("q"));
  if (!query) return Response.json({ error: "Type at least 2 letters of a city name.", code: "QUERY_INVALID" }, { status: 400 });

  const params = new URLSearchParams({ name: query, count: "10", language: "en", format: "json" });
  try {
    const response = await fetch(`${GEOCODER_URL}?${params}`, { signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) throw new Error(`geocoder ${response.status}`);
    return privateJson({ places: placesFromOpenMeteo(await response.json()) });
  } catch {
    console.error("[places] City search is unavailable.");
    return Response.json({ error: "City search isn't available right now. Choose a time zone instead.", code: "PLACE_SEARCH_UNAVAILABLE" }, { status: 502 });
  }
}
