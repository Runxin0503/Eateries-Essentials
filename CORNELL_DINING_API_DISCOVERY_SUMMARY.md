# Cornell Dining API Discovery Summary

## Overview
This document summarizes the process and findings from exploring how to programmatically access Cornell dining menus using curl and the web API.

---

## Key Findings
- The main Cornell Dining website is a JavaScript SPA and does not expose menu data in the initial HTML.
- There is a working public JSON API endpoint for all eateries and menus for a given date.
- The endpoint uses a `?date=YYYY-MM-DD` query parameter to specify the date.
- Other guessed endpoints (e.g., .json, /menus/, /eatery/, etc.) returned 500 errors or no data.

---

## Working API Endpoint
```
https://now.dining.cornell.edu/api/1.0/dining/eateries.json?date=YYYY-MM-DD
```
- Replace `YYYY-MM-DD` with the desired date (e.g., 2025-09-09).
- Returns a large JSON object with all eateries, their hours, and full menu details for the specified date.

### Example curl usage
```sh
# Get today's menus
curl -s "https://now.dining.cornell.edu/api/1.0/dining/eateries.json?date=2025-09-09"

# Get tomorrow's menus
curl -s "https://now.dining.cornell.edu/api/1.0/dining/eateries.json?date=2025-09-10"

# Get a specific date
curl -s "https://now.dining.cornell.edu/api/1.0/dining/eateries.json?date=YYYY-MM-DD"
```

---

## Non-working/Rejected Endpoints
- All of these returned 500 Internal Server Error or no data:
  - `/api/1.0/eateries/104-west.json`
  - `/api/1.0/eateries/104-West.json`
  - `/api/1.0/eateries/104-west`
  - `/api/1.0/eatery/104-west.json`
  - `/api/1.0/menus/104-west.json`
  - `/api/1.0/dining/menus.json?date=YYYY-MM-DD`
  - `/api/1.0/dining/eateries.json?timestamp=...` (timestamp param not supported)
  - `/api/1.0/dining/eateries.json?date=MM/DD/YYYY` (US date format not supported)

---

## Tips
- Always use ISO date format: `YYYY-MM-DD`.
- The endpoint works for past, present, and future dates (as far as data is available).
- The response is large; you may want to filter or parse it for specific eateries or menu items.

---

## Conclusion
The only reliable way to get Cornell dining menus programmatically is to use the `eateries.json?date=YYYY-MM-DD` endpoint with curl. All other guessed endpoints are not public or do not work.
