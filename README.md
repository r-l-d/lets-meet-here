# Let&apos;s meet here

Find a city in Europe where two friends can meet by comparing real-time flight offers from both home airports.

## What this app does

- Takes two home airport IATA codes, a departure date, and passenger count.
- Calls live no-key public fare APIs for both travelers.
- Compares Europe-only destination airports.
- Ranks meetup options by combined price and how close the two arrival times are.

## Requirements

- Node.js 20+

## Setup

1. Install dependencies:

	```bash
	npm install
	```

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## Notes

- The server route uses public Ryanair fare search endpoints and does not require API keys.
- Destination search is intentionally limited to a fixed set of European airports for simplicity.
- Flight availability, carriers, and pricing depend on live API responses and may change between searches.
- Results are strongest for airports covered by the public fare source (Ryanair network).
