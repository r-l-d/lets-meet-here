import { NextResponse } from "next/server";
import { EUROPEAN_AIRPORTS } from "@/lib/europeAirports";

type Offer = {
  id: string;
  price: {
    total: string;
    currency: string;
  };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        at: string;
      };
      carrierCode: string;
      number: string;
    }>;
  }>;
};

type AccessTokenCache = {
  token: string;
  expiresAt: number;
  baseUrl: string;
} | null;

let tokenCache: AccessTokenCache = null;

function isIataCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parsePrice(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getArrivalTime(offer: Offer): string | null {
  const itinerary = offer.itineraries[0];
  const segments = itinerary?.segments;
  if (!segments || segments.length === 0) {
    return null;
  }

  return segments[segments.length - 1].arrival.at;
}

function toTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getArrivalGapMinutes(
  arrivalA: string | null,
  arrivalB: string | null,
): number {
  const tsA = toTimestamp(arrivalA);
  const tsB = toTimestamp(arrivalB);

  if (tsA === null || tsB === null) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round(Math.abs(tsA - tsB) / 60000);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function getAmadeusBaseUrl(): string {
  const env = (process.env.AMADEUS_ENV ?? "").toLowerCase();
  if (env === "production") {
    return "https://api.amadeus.com";
  }
  if (env === "test") {
    return "https://test.api.amadeus.com";
  }
  return process.env.NODE_ENV === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";
}

async function getAmadeusToken(baseUrl: string): Promise<string> {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET.");
  }

  if (
    tokenCache &&
    tokenCache.baseUrl === baseUrl &&
    tokenCache.expiresAt > Date.now() + 30_000
  ) {
    return tokenCache.token;
  }

  const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to authenticate with Amadeus API.");
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    baseUrl,
  };

  return data.access_token;
}

async function getCheapestOffer(params: {
  token: string;
  baseUrl: string;
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
  currencyCode: string;
}): Promise<Offer | null> {
  const search = new URLSearchParams({
    originLocationCode: params.origin,
    destinationLocationCode: params.destination,
    departureDate: params.departureDate,
    adults: String(params.adults),
    currencyCode: params.currencyCode,
    max: "5",
  });

  const response = await fetch(
    `${params.baseUrl}/v2/shopping/flight-offers?${search}`,
    {
      headers: {
        Authorization: `Bearer ${params.token}`,
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { data?: Offer[] };
  const offers = payload.data ?? [];

  if (offers.length === 0) {
    return null;
  }

  offers.sort(
    (left, right) =>
      parsePrice(left.price.total) - parsePrice(right.price.total),
  );

  return offers[0];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      originA?: string;
      originB?: string;
      departureDate?: string;
      adults?: number;
      currencyCode?: string;
    };

    const originA = (body.originA ?? "").toUpperCase().trim();
    const originB = (body.originB ?? "").toUpperCase().trim();
    const departureDate = (body.departureDate ?? "").trim();
    const adultsInput = Number(body.adults ?? 1);
    const adults = Number.isFinite(adultsInput)
      ? Math.max(1, Math.min(6, adultsInput))
      : 1;
    const currencyCode =
      (body.currencyCode ?? "EUR").toUpperCase().trim() || "EUR";

    if (!isIataCode(originA) || !isIataCode(originB)) {
      return NextResponse.json(
        {
          error:
            "Please provide valid 3-letter IATA airport codes for both home cities.",
        },
        { status: 400 },
      );
    }

    if (originA === originB) {
      return NextResponse.json(
        {
          error:
            "Home airports must be different so we can compare meetup routes.",
        },
        { status: 400 },
      );
    }

    if (!isIsoDate(departureDate)) {
      return NextResponse.json(
        {
          error: "Please provide a valid departure date in YYYY-MM-DD format.",
        },
        { status: 400 },
      );
    }

    const baseUrl = getAmadeusBaseUrl();
    const token = await getAmadeusToken(baseUrl);

    const candidateAirports = EUROPEAN_AIRPORTS.filter(
      (airport) => airport.code !== originA && airport.code !== originB,
    );

    const rawResults = await mapWithConcurrency(
      candidateAirports,
      6,
      async (airport) => {
        const [offerA, offerB] = await Promise.all([
          getCheapestOffer({
            token,
            baseUrl,
            origin: originA,
            destination: airport.code,
            departureDate,
            adults,
            currencyCode,
          }),
          getCheapestOffer({
            token,
            baseUrl,
            origin: originB,
            destination: airport.code,
            departureDate,
            adults,
            currencyCode,
          }),
        ]);

        if (!offerA || !offerB) {
          return null;
        }

        const arrivalA = getArrivalTime(offerA);
        const arrivalB = getArrivalTime(offerB);
        const totalPrice =
          parsePrice(offerA.price.total) + parsePrice(offerB.price.total);
        const arrivalGapMinutes = getArrivalGapMinutes(arrivalA, arrivalB);
        const score = totalPrice + arrivalGapMinutes * 0.2;

        return {
          destination: airport,
          score,
          combinedPrice: totalPrice,
          combinedCurrency: offerA.price.currency,
          arrivalGapMinutes,
          flights: {
            fromA: {
              origin: originA,
              offer: offerA,
            },
            fromB: {
              origin: originB,
              offer: offerB,
            },
          },
        };
      },
    );

    const options = rawResults
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => left.score - right.score)
      .slice(0, 12);

    return NextResponse.json({
      searchedAt: new Date().toISOString(),
      region: "Europe",
      dataSource:
        baseUrl === "https://api.amadeus.com"
          ? "Amadeus (production)"
          : "Amadeus (test)",
      filters: {
        originA,
        originB,
        departureDate,
        adults,
        currencyCode,
      },
      options,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
