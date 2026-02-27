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

type RyanairFare = {
  outbound: {
    departureAirport: {
      iataCode: string;
    };
    arrivalAirport: {
      iataCode: string;
    };
    departureDate: string;
    arrivalDate: string;
    price: {
      value: number;
      currencyCode: string;
    };
    flightKey: string;
    flightNumber: string;
  };
};

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

function toIsoDuration(from: string, to: string): string {
  const fromTs = Date.parse(from);
  const toTs = Date.parse(to);

  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) {
    return "PT0M";
  }

  const totalMinutes = Math.round((toTs - fromTs) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `PT${hours}H${minutes}M`;
  }
  if (hours > 0) {
    return `PT${hours}H`;
  }
  return `PT${minutes}M`;
}

async function getCheapestOffer(params: {
  origin: string;
  destination: string;
  departureDate: string;
  currencyCode: string;
}): Promise<Offer | null> {
  const search = new URLSearchParams({
    departureAirportIataCode: params.origin,
    arrivalAirportIataCode: params.destination,
    outboundDepartureDateFrom: params.departureDate,
    outboundDepartureDateTo: params.departureDate,
    language: "en",
    market: "en-gb",
    currency: params.currencyCode,
    offset: "0",
    limit: "8",
  });

  const response = await fetch(
    `https://services-api.ryanair.com/farfnd/v4/oneWayFares?${search}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { fares?: RyanairFare[] };
  const fares = payload.fares ?? [];

  if (fares.length === 0) {
    return null;
  }

  fares.sort(
    (left, right) => left.outbound.price.value - right.outbound.price.value,
  );

  const cheapestFare = fares[0];
  const outbound = cheapestFare.outbound;
  const carrierCode = outbound.flightNumber.replace(/\d/g, "") || "FR";
  const flightNumber =
    outbound.flightNumber.replace(/\D/g, "") || outbound.flightNumber;

  return {
    id: outbound.flightKey,
    price: {
      total: outbound.price.value.toFixed(2),
      currency: outbound.price.currencyCode,
    },
    itineraries: [
      {
        duration: toIsoDuration(outbound.departureDate, outbound.arrivalDate),
        segments: [
          {
            departure: {
              iataCode: outbound.departureAirport.iataCode,
              at: outbound.departureDate,
            },
            arrival: {
              iataCode: outbound.arrivalAirport.iataCode,
              at: outbound.arrivalDate,
            },
            carrierCode,
            number: flightNumber,
          },
        ],
      },
    ],
  };
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

    const candidateAirports = EUROPEAN_AIRPORTS.filter(
      (airport) => airport.code !== originA && airport.code !== originB,
    );

    const rawResults = await mapWithConcurrency(
      candidateAirports,
      6,
      async (airport) => {
        const [offerA, offerB] = await Promise.all([
          getCheapestOffer({
            origin: originA,
            destination: airport.code,
            departureDate,
            currencyCode,
          }),
          getCheapestOffer({
            origin: originB,
            destination: airport.code,
            departureDate,
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
