import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from district_extractor import extract_district_from_title

# Load .env
env_path = Path(__file__).resolve().parent / "real-estate-app" / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent / ".env"

load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL not found!")

engine = create_engine(DATABASE_URL)

def backfill_districts():
    print("Fetching listings with missing districts...")
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT id, title, city FROM listings WHERE district IS NULL OR district = ''")
        ).mappings().all()

    print(f"Analyzing {len(rows)} listings...")

    updates = []
    for row in rows:
        title = row["title"]
        city = row["city"]
        inferred = extract_district_from_title(title, city)
        if inferred:
            updates.append({"id": row["id"], "district": inferred})

    if not updates:
        print("No matches found from titles.")
        return

    print(f"Found matches for {len(updates)} listings! Updating database in bulk...")

    # Fast bulk update in a single transaction
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE listings SET district = :district WHERE id = :id"),
            updates
        )

    print(f"Successfully assigned neighborhoods to {len(updates)} listings!")

if __name__ == "__main__":
    backfill_districts()