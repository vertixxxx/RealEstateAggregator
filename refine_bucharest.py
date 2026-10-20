import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from district_extractor import extract_district_from_title

# Locate .env
script_dir = Path(__file__).resolve().parent
candidate_paths = [
    script_dir / ".env",
    script_dir.parent / ".env",
    script_dir / "real-estate-app" / ".env",
]

env_path = next((p for p in candidate_paths if p.exists()), None)
if not env_path:
    raise FileNotFoundError("Could not find .env file.")

load_dotenv(dotenv_path=env_path)

db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise ValueError("DATABASE_URL is not set.")

engine = create_engine(db_url)

def refine():
    print("1. Fetching Bucharest listings from database...", flush=True)
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT id, title, city, district FROM listings WHERE city ILIKE '%Bucure%'")
        ).mappings().all()

    print(f"2. Found {len(rows)} listings. Analyzing titles for neighborhoods...", flush=True)

    updates = []
    for row in rows:
        title = row["title"] or ""
        city = row["city"] or ""
        current_district = row["district"] or ""

        inferred = extract_district_from_title(title, city)
        
        # Only update if we extracted a specific neighborhood that isn't already set
        if inferred and not inferred.startswith("Sector") and inferred != current_district:
            updates.append({"id": row["id"], "district": inferred})

    if not updates:
        print("No specific neighborhoods identified to update.")
        return

    print(f"3. Applying {len(updates)} neighborhood updates in batches...", flush=True)

    batch_size = 200
    total_batches = (len(updates) + batch_size - 1) // batch_size

    for i in range(0, len(updates), batch_size):
        chunk = updates[i : i + batch_size]
        batch_num = (i // batch_size) + 1

        with engine.begin() as conn:
            conn.execute(
                text("UPDATE listings SET district = :district WHERE id = :id"),
                chunk
            )

        print(f"   Saved batch {batch_num}/{total_batches} ({min(i + batch_size, len(updates))}/{len(updates)})...", flush=True)

    print("Finished refining Bucharest neighborhoods successfully!")

if __name__ == "__main__":
    refine()