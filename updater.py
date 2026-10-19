import logging
import os
import time
import re
from typing import Dict, List, Optional
from curl_cffi import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Set up clean logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("OLXPeriodicUpdater")

class OLXScraper:
    BASE_API_URL = "https://www.olx.ro/api/v1/offers/"
    
    def __init__(self, browser_version: str = "chrome120"):
        self.session = requests.Session(impersonate=browser_version)
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.olx.ro/",
        })
        self._id_cache = {}

    def _resolve_live_ids(self, city: str, category_keyword: str) -> dict:
        query = f"{category_keyword} {city}"
        cache_key = query.lower()
        if cache_key in self._id_cache:
            return self._id_cache[cache_key]

        logger.info(f"Resolving IDs for: '{query}'...")
        try:
            response = self.session.get(self.BASE_API_URL, params={"query": query, "limit": 5}, timeout=10)
            if response.status_code != 200:
                return {}

            data = response.json().get("data", [])
            if not data:
                return {}
                
            sample = data[0]
            ids = {
                "category_id": str(sample.get("category", {}).get("id")),
                "city_id": str(sample.get("location", {}).get("city", {}).get("id")),
            }
            self._id_cache[cache_key] = ids
            return ids
        except Exception as e:
            logger.exception(f"Error resolving IDs: {e}")
            return {}

    def _extract_price(self, params: List[Dict]) -> Dict[str, Optional[float]]:
        for p in params:
            if p.get("key") == "price":
                val_data = p.get("value", {})
                return {
                    "value": val_data.get("value"),
                    "currency": val_data.get("currency", "EUR")
                }
        return {"value": None, "currency": None}

    def _extract_surface(self, params: List[Dict]) -> Optional[float]:
        for p in params:
            if p.get("key") == "m":
                val_obj = p.get("value")
                if isinstance(val_obj, dict):
                    raw_val = val_obj.get("key") or val_obj.get("value") or val_obj.get("label")
                else:
                    raw_val = val_obj
                    
                if not raw_val:
                    continue
                    
                try:
                    clean_str = re.sub(r'[^\d.,]', '', str(raw_val)).replace(",", ".")
                    return float(clean_str)
                except (ValueError, TypeError):
                    pass
        return None

    def _extract_image(self, item: Dict) -> Optional[str]:
        # 1. Standard OLX photos array
        photos = item.get("photos", [])
        if photos and isinstance(photos, list):
            first = photos[0]
            if isinstance(first, dict):
                raw_link = first.get("link") or first.get("url")
                if raw_link:
                    return str(raw_link).replace("{width}", "800").replace("{height}", "600")

        # 2. Fallback for syndicated/Storia listings with a thumbnail key
        thumbnail = item.get("thumbnail") or item.get("preview_url")
        if thumbnail and isinstance(thumbnail, str):
            return thumbnail.replace("{width}", "800").replace("{height}", "600")

        return None

    def fetch_listings(self, city_name: str, category_keyword: str, limit: int = 40, offset: int = 0) -> List[Dict]:
        ids = self._resolve_live_ids(city_name, category_keyword)
        
        params = {
            "offset": str(offset),
            "limit": str(limit),
        }
        
        if ids.get("category_id"):
            params["category_id"] = ids["category_id"]
        if ids.get("city_id"):
            params["city_id"] = ids["city_id"]

        logger.info(f"Checking {city_name.title()} ({category_keyword}) | Offset: {offset}")
        
        for attempt in range(3):
            try:
                response = self.session.get(self.BASE_API_URL, params=params, timeout=12)
                
                if response.status_code == 200:
                    items = response.json().get("data", [])
                    if not items:
                        return []

                    normalized_listings = []
                    for item in items:
                        price_info = self._extract_price(item.get("params", []))
                        surface = self._extract_surface(item.get("params", []))
                        
                        price = price_info["value"]
                        price_per_sqm = None
                        if price and surface and surface > 0:
                            price_per_sqm = round(price / surface, 2)
                        
                        listing = {
                            "external_id": item.get("id"),
                            "title": item.get("title", "").strip(),
                            "url": item.get("url"),
                            "image_url": self._extract_image(item),
                            "created_at": item.get("created_time"),
                            "price": price,
                            "currency": price_info["currency"],
                            "surface_sqm": surface,
                            "price_per_sqm": price_per_sqm,
                            "city": item.get("location", {}).get("city", {}).get("name", city_name),
                            "location_district": item.get("location", {}).get("district", {}).get("name"),
                            "is_business": item.get("user", {}).get("company_name") is not None,
                        }
                        normalized_listings.append(listing)

                    return normalized_listings

                elif response.status_code in [429, 403]:
                    logger.warning(f"Rate limited (HTTP {response.status_code}). Backing off...")
                    time.sleep(3 * (attempt + 1))
                else:
                    break

            except Exception as e:
                logger.error(f"Request exception: {e}")
                time.sleep(2)

        return []

# Initialize Database Connection
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is missing!")

engine = create_engine(DATABASE_URL)

def sync_updates_to_postgres(listings):
    """UPSERTs listings and records price changes into price_history."""
    if not listings:
        return

    external_ids = [str(item["external_id"]) for item in listings]

    # Query 1: Fetch current prices from DB to compare with scraped values
    fetch_existing_query = text("""
        SELECT id, external_id, price FROM listings WHERE external_id = ANY(:external_ids)
    """)

    # Query 2: UPSERT listing metadata and update last_seen_at
    # Query 2: UPSERT listing metadata and update last_seen_at
    upsert_query = text("""
        INSERT INTO listings (
            external_id, title, price, currency, surface_sqm, price_per_sqm, city, district, url, image_url, is_business, created_at, first_seen_at, last_seen_at
        ) VALUES (
            :external_id, :title, :price, :currency, :surface_sqm, :price_per_sqm, :city, :location_district, :url, :image_url, :is_business, 
            CASE 
                WHEN CAST(:created_at AS TEXT) IS NOT NULL AND CAST(:created_at AS TEXT) != '' THEN CAST(:created_at AS TIMESTAMPTZ)
                ELSE NOW()
            END,
            NOW(), 
            NOW()
        )
        ON CONFLICT (external_id) DO UPDATE SET
            price = EXCLUDED.price,
            surface_sqm = COALESCE(listings.surface_sqm, EXCLUDED.surface_sqm),
            price_per_sqm = COALESCE(listings.price_per_sqm, EXCLUDED.price_per_sqm),
            image_url = COALESCE(EXCLUDED.image_url, listings.image_url),
            last_seen_at = NOW()
        RETURNING id, external_id;
    """)

    # Query 3: Record price changes in price_history
    history_query = text("""
        INSERT INTO price_history (listing_id, old_price, new_price, changed_at)
        VALUES (:listing_id, :old_price, :new_price, NOW())
    """)

    try:
        new_count = 0
        updated_count = 0
        price_change_count = 0

        with engine.begin() as conn:
            # Check current prices
            existing_rows = conn.execute(fetch_existing_query, {"external_ids": external_ids}).mappings().all()
            existing_map = {row["external_id"]: {"id": row["id"], "price": row["price"]} for row in existing_rows}
            
            history_inserts = []
            
            for item in listings:
                ext_id = str(item["external_id"])
                new_price = float(item["price"]) if item.get("price") is not None else None
                
                payload = {
                    "external_id": ext_id,
                    "title": item.get("title") or "Untitled",
                    "price": new_price,
                    "currency": item.get("currency") or "EUR",
                    "surface_sqm": item.get("surface_sqm"),
                    "price_per_sqm": item.get("price_per_sqm"),
                    "city": item.get("city") or "Romania",
                    "location_district": item.get("location_district"),
                    "url": item.get("url"),
                    "image_url": item.get("image_url"),
                    "is_business": bool(item.get("is_business")),
                    "created_at": str(item.get("created_at")) if item.get("created_at") else None,
                }
                
                # Run the UPSERT
                result = conn.execute(upsert_query, payload).mappings().fetchone()
                db_id = result["id"] if result else None

                if ext_id in existing_map:
                    updated_count += 1
                    old_price = existing_map[ext_id]["price"]
                    # Record price change if price differs
                    if old_price is not None and new_price is not None and old_price != new_price:
                        history_inserts.append({
                            "listing_id": db_id,
                            "old_price": old_price,
                            "new_price": new_price
                        })
                else:
                    new_count += 1
            
            if history_inserts:
                conn.execute(history_query, history_inserts)
                price_change_count = len(history_inserts)

        logger.info(
            f"Sync Complete: {new_count} new listings, {updated_count} existing refreshed, {price_change_count} price changes recorded."
        )
    except Exception as e:
        logger.error(f"Error syncing updates: {e}")

def run_update_cycle():
    """Executes a fast periodic scan over target cities and categories."""
    scraper = OLXScraper()
    cities = ["Cluj-Napoca", "Bucuresti", "Brasov"]
    categories = ["apartamente", "apartamente de inchiriat"]
    
    pages_to_check = 3  # Check first 3 pages (~120 listings per city/category)
    limit = 40

    logger.info("Starting periodic update scan...")
    start_time = time.time()

    for city in cities:
        for cat in categories:
            offset = 0
            for _ in range(pages_to_check):
                results = scraper.fetch_listings(
                    city_name=city,
                    category_keyword=cat,
                    limit=limit,
                    offset=offset
                )
                
                if not results:
                    break

                sync_updates_to_postgres(results)
                offset += limit
                time.sleep(1.5)  # Politeness delay

    elapsed = round(time.time() - start_time, 2)
    logger.info(f"Periodic update scan completed in {elapsed} seconds.")

if __name__ == "__main__":
    run_update_cycle()