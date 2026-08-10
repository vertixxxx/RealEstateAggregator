from curl_cffi import requests

s = requests.Session(impersonate="chrome120")
s.headers.update({
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.olx.ro/",
})

# Broad search: No city_id restrictions, just a text query
url_search = "https://www.olx.ro/api/v1/offers/?query=apartament+cluj&limit=5"
r1 = s.get(url_search)

print(f"Status Code: {r1.status_code}")

data = r1.json().get("data", [])
print(f"Found {len(data)} items.\n")

if data:
    sample = data[0]
    
    # Extract the exact IDs OLX uses under the hood for this listing
    cat_id = sample.get("category", {}).get("id")
    city_id = sample.get("location", {}).get("city", {}).get("id")
    region_id = sample.get("location", {}).get("region", {}).get("id")
    
    print("EXACT API PARAMETERS DETECTED:")
    print(f"-> category_id: {cat_id}")
    print(f"-> city_id: {city_id}")
    print(f"-> region_id: {region_id}")
else:
    print("Still 0 items. OLX might be requiring an auth token or different headers.")