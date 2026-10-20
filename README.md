#  ImoPont — Romanian Real Estate Aggregator & Market Analytics

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Visit_ImoPont-blue?style=for-the-badge)](https://real-estate-aggregator-rho.vercel.app/)

**ImoPont** is a full-stack real estate intelligence platform and listing aggregator focused on major Romanian markets (**Cluj-Napoca**, **București**, **Brașov**, and surrounding metropolitan areas). 

Beyond displaying property listings, ImoPont tracks historical price changes over time, automatically infers missing neighborhood data using natural language title parsing, and computes live neighborhood-level $€/m^2$ benchmarks to flag undervalued properties in real time.

---

##  Key Features

* **Automated ETL Scraping Pipeline:** Periodically scrapes sales and rental listings from OLX Romania and syndicated Storia.ro offers using TLS fingerprint impersonation (`curl_cffi`) to bypass anti-bot protections.
* **Historical Price Tracking ("🔥 Deals Only"):** Detects price revisions on existing listings and logs them in a relational `price_history` table, highlighting discounted properties with strikethrough pricing and `PRICE DROP` badges.
* **Statistical Market Value Indicator:** Computes live $€/m^2$ averages per city and neighborhood (with outlier filtering) and flags properties priced $\ge 15\%$ below their local area benchmark with a `💎 X% BELOW AVG` badge.
* **Interactive Neighborhood Price Map:** Built with **Leaflet** and **OpenStreetMap**, displaying clickable neighborhood bubbles with active listing counts and live average $€/m^2$ metrics.
* **NLP Title-Based Neighborhood Inference:** Uses diacritic-insensitive regex and landmark alias mapping (`district_extractor.py`) to extract exact neighborhoods from listing titles when sellers or syndicated platforms leave location fields blank or generic.
* **Multi-Stage Image Recovery:** Extracts cover photos from the OLX REST API and automatically falls back to parsing OpenGraph (`og:image`) and Apollo CDN links directly from HTML for syndicated Storia.ro listings.
* **Dynamic Filtering & Sorting:** Server-side paginated filtering by transaction type (*For Sale* / *For Rent*), cascading *City* $\rightarrow$ *Neighborhood* dropdowns, *Deals Only* toggle, and sorting by *Latest*, *Total Price*, or *Price per $m^2$*.

---

##  Tech Stack

### Frontend & Web Application
* **Framework:** [Next.js](https://nextjs.org/) (App Router, Server Components)
* **Language:** TypeScript
* **ORM:** [Prisma](https://www.prisma.io/) (PostgreSQL aggregation, `groupBy` market benchmarks, relational queries)
* **Styling:** Tailwind CSS
* **Mapping:** [Leaflet](https://leafletjs.com/) + OpenStreetMap Tiles

### Data Engineering & Backend Scraper
* **Language:** Python 3.11+
* **HTTP & TLS Impersonation:** `curl_cffi` (Chrome 120 TLS fingerprint impersonation)
* **Database Toolkit:** SQLAlchemy + `psycopg` (v3) / `psycopg2-binary`
* **Data Normalization:** Custom regex & Unicode normalization (`unicodedata`) for Romanian diacritics

### Infrastructure & DevOps
* **Database:** Cloud-hosted PostgreSQL
* **Automation / Scheduling:** GitHub Actions (Scheduled cron workflows + manual `workflow_dispatch`)
* **Hosting:** Vercel

---

##  System Architecture & How It Works

```text
┌───────────────────────────┐
│   OLX.ro / Storia.ro API  │
│    & HTML Offer Pages     │
└─────────────┬─────────────┘
              │ 1. Fetch via curl_cffi (Chrome TLS Impersonation)
              ▼
┌───────────────────────────┐
│   Python ETL Pipeline     │  ◄── Triggered hourly via GitHub Actions
│      (updater.py)         │
├───────────────────────────┤
│ • Price & €/m² calculation│
│ • Title -> District NLP   │
│ • OpenGraph image fallback│
└─────────────┬─────────────┘
              │ 2. SQLAlchemy UPSERT (ON CONFLICT) & Price History Trigger
              ▼
┌───────────────────────────┐
│   PostgreSQL Database     │
│ • listings                │
│ • price_history           │
└─────────────┬─────────────┘
              │ 3. Prisma ORM (Parallel Queries + GroupBy Aggregations)
              ▼
┌───────────────────────────┐
│   Next.js Web Platform    │  ◄── Hosted on Vercel
│ • FilterBar & Sorting     │
│ • Leaflet Price Map       │
│ • Market Value Badges     │
└───────────────────────────┘
```

## Project Structure
```text
├── .github/
│   └── workflows/
│       └── scraper.yml            # GitHub Actions scheduled scraper workflow
├── real-estate-app/               # Next.js Frontend Application
│   ├── prisma/
│   │   └── schema.prisma          # PostgreSQL database schema (Listing, PriceHistory)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Main Server Component & market benchmark logic
│   │   │   └── globals.css        # Global styles
│   │   ├── components/
│   │   │   ├── FilterBar.tsx      # Client filter controls, sorting & map toggle
│   │   │   └── NeighborhoodMap.tsx# Interactive Leaflet price-cluster map
│   │   └── lib/
│   │       └── prisma.ts          # Prisma client singleton
│   ├── updater.py                 # Main periodic scraper & PostgreSQL sync worker
│   └── district_extractor.py      # NLP regex neighborhood parser
├── backfill_images.py             # Utility to recover missing/Storia images via OpenGraph
├── backfill_districts.py          # Bulk utility to infer neighborhoods for older rows
└── refine_bucharest.py            # Refines generic Bucharest sectors into neighborhoods
