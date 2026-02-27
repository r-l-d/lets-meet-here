"use client";

import { FormEvent, useMemo, useState } from "react";

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

type MeetupOption = {
  destination: {
    code: string;
    city: string;
    country: string;
  };
  combinedPrice: number;
  combinedCurrency: string;
  arrivalGapMinutes: number;
  flights: {
    fromA: {
      origin: string;
      offer: Offer;
    };
    fromB: {
      origin: string;
      offer: Offer;
    };
  };
};

type SearchResponse = {
  options: MeetupOption[];
  dataSource?: string;
  error?: string;
};

function getDefaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString();
}

function formatDuration(rawDuration: string): string {
  if (!rawDuration.startsWith("PT")) {
    return rawDuration;
  }

  const hours = rawDuration.match(/(\d+)H/)?.[1];
  const minutes = rawDuration.match(/(\d+)M/)?.[1];
  if (!hours && !minutes) {
    return rawDuration;
  }

  return `${hours ? `${hours}h ` : ""}${minutes ? `${minutes}m` : ""}`.trim();
}

function FlightSummary({ label, offer }: { label: string; offer: Offer }) {
  const itinerary = offer.itineraries[0];
  const segments = itinerary?.segments ?? [];
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  if (!firstSegment || !lastSegment) {
    return null;
  }

  return (
    <div className="rounded-lg border border-black/10 p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-sm">
        {firstSegment.departure.iataCode} → {lastSegment.arrival.iataCode}
      </p>
      <p className="text-sm">
        {formatDateTime(firstSegment.departure.at)} to{" "}
        {formatDateTime(lastSegment.arrival.at)}
      </p>
      <p className="text-sm">Duration: {formatDuration(itinerary.duration)}</p>
      <p className="text-sm">
        Price: {offer.price.total} {offer.price.currency}
      </p>
    </div>
  );
}

export default function Home() {
  const [originA, setOriginA] = useState("LHR");
  const [originB, setOriginB] = useState("MAD");
  const [departureDate, setDepartureDate] = useState(getDefaultDate());
  const [adults, setAdults] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<MeetupOption[]>([]);
  const [dataSource, setDataSource] = useState<string>("Amadeus (test)");

  const title = useMemo(
    () =>
      `Find a Europe meetup city from ${originA.toUpperCase()} and ${originB.toUpperCase()}`,
    [originA, originB],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/meetup-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originA,
          originB,
          departureDate,
          adults,
          currencyCode: "EUR",
        }),
      });

      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not fetch meetup options.");
      }

      setOptions(payload.options ?? []);
      if (payload.dataSource) {
        setDataSource(payload.dataSource);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unexpected error",
      );
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 sm:p-10">
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Let&apos;s meet here</h1>
          <span className="rounded-full border border-black/15 bg-black/5 px-3 py-1 text-xs font-medium text-black/70">
            Demo mode · {dataSource}
          </span>
        </div>
        <p className="mt-2 text-sm text-black/70">
          Compare real-time flight prices from two home airports and find the
          best city to meet in Europe using Amadeus live flight data.
        </p>
      </section>

      <section className="rounded-xl border border-black/10 p-5">
        <h2 className="text-lg font-medium">Search</h2>
        <p className="mb-4 mt-1 text-sm text-black/70">
          Europe-only destinations are included in results.
        </p>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            Home airport A (IATA)
            <input
              className="rounded-md border border-black/20 bg-transparent px-3 py-2"
              value={originA}
              maxLength={3}
              onChange={(event) => setOriginA(event.target.value.toUpperCase())}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Home airport B (IATA)
            <input
              className="rounded-md border border-black/20 bg-transparent px-3 py-2"
              value={originB}
              maxLength={3}
              onChange={(event) => setOriginB(event.target.value.toUpperCase())}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Departure date
            <input
              className="rounded-md border border-black/20 bg-transparent px-3 py-2"
              type="date"
              value={departureDate}
              onChange={(event) => setDepartureDate(event.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Adults per booking
            <input
              className="rounded-md border border-black/20 bg-transparent px-3 py-2"
              type="number"
              min={1}
              max={6}
              value={adults}
              onChange={(event) => setAdults(Number(event.target.value))}
              required
            />
          </label>

          <button
            className="sm:col-span-2 rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Searching live flight offers..." : "Find meetup cities"}
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-medium">{title}</h2>
        {error && (
          <p className="mt-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!error && !loading && options.length === 0 && (
          <p className="mt-2 text-sm text-black/70">
            Run a search to see meetup city suggestions.
          </p>
        )}

        <div className="mt-4 grid gap-4">
          {options.map((option) => (
            <article
              key={option.destination.code}
              className="rounded-xl border border-black/10 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-semibold">
                  {option.destination.city} ({option.destination.code})
                </h3>
                <p className="text-sm font-medium">
                  Combined price: {option.combinedPrice.toFixed(2)}{" "}
                  {option.combinedCurrency}
                </p>
              </div>

              <p className="mt-1 text-sm text-black/70">
                {option.destination.country} · Arrival gap:{" "}
                {option.arrivalGapMinutes} minutes
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FlightSummary
                  label={`From ${option.flights.fromA.origin}`}
                  offer={option.flights.fromA.offer}
                />
                <FlightSummary
                  label={`From ${option.flights.fromB.origin}`}
                  offer={option.flights.fromB.offer}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
