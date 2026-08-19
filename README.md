# Aurawatt Warranty Backend

Express backend for the Aurawatt warranty management frontend.

## Run

```bash
npm install
npm run dev
```

## Core routes

- `GET /health`
- `GET /api/models`
- `GET /api/photo-requirements`
- `POST /api/serials/validate`
- `POST /api/warranties`
- `GET /api/warranties/:id`
- `GET /api/warranties/:id/status`
- `GET /api/warranties/:id/certificate`

Admin routes are also included for serial inventory, model management,
photo requirements, dashboard stats, and warranty review actions.

## Storage

The backend persists data to `backend/data/database.json`. If the file is
missing, a seeded demo dataset is recreated automatically on startup.
