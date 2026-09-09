# Aurawatt Warranty Backend

Express backend for the Aurawatt warranty management frontend.

## Run

```bash
npm install
npm run dev
```

## Authentication

Admin authentication uses HS256 JWTs stored only in an HttpOnly cookie. Set a
long random `JWT_SECRET` (at least 32 characters) in production; the server
will refuse to start without one. The frontend never stores an access token in
`localStorage` and sends a memory-only CSRF proof for authenticated write
requests. Default expiry is 7 days, or 30 days when “remember me” is selected;
override these with `JWT_ACCESS_TTL_DAYS` and `JWT_REMEMBER_TTL_DAYS`.

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
missing, a blank workspace is created automatically on startup.
