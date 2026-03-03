# Let&apos;s meet there

Find a city in Europe where two friends can meet by comparing real-time flight offers from both home airports.

## What this app does

- Takes two home airport IATA codes, a departure date, and passenger count.
- Calls live Amadeus flight shopping APIs for both travelers.
- Compares Europe-only destination airports.
- Ranks meetup options by combined price and how close the two arrival times are.

## Requirements

- Node.js 20+
- Amadeus Self-Service API keys

## Setup

1. Install dependencies:

	```bash
	npm install
	```

2. Copy the environment template and add your keys:

	```bash
	cp .env.example .env.local
	```

3. Configure `.env.local`:

	```bash
	AMADEUS_CLIENT_ID=your_client_id
	AMADEUS_CLIENT_SECRET=your_client_secret
	AMADEUS_ENV=test
	```

Use `AMADEUS_ENV=production` when you are ready to run against Amadeus production.

## Run

```bash
npm run dev
```

Open http://localhost:3000.

## Notes

- The server route uses Amadeus endpoints and requires valid API credentials.
- `AMADEUS_ENV=test` targets `https://test.api.amadeus.com`.
- `AMADEUS_ENV=production` targets `https://api.amadeus.com`.
- Destination search is intentionally limited to a fixed set of European airports for simplicity.
- Flight availability, carriers, and pricing depend on live API responses and may change between searches.
