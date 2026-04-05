# SmartAllocate Local + Render Setup

## Goal

- Local development:
  - `backend` runs locally
  - `frontend_admin` runs locally
  - `frontend_user` runs locally
  - database stays on Render Postgres
- Production:
  - backend runs on Render
  - both frontends run on Render
  - backend connects to the same Render Postgres database

## 1. Local env files

Create `backend/.env.local`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://USERNAME:PASSWORD@EXTERNAL-HOST:5432/DATABASE
PGSSLMODE=require
FRONTEND_URL=http://localhost:5174,http://localhost:4173
CORS_ORIGINS=
OPENAI_API_KEY=YOUR_KEY
OPENAI_MODEL=gpt-4o-mini
```

Create `frontend_admin/.env.local`:

```env
VITE_API_URL=http://localhost:3000
VITE_USER_URL=http://localhost:4173
```

Create `frontend_user/.env.local`:

```env
VITE_API_URL=http://localhost:3000
VITE_ADMIN_URL=http://localhost:5174
```

## 2. Run locally

Backend:

```bash
cd backend
npm install
npm run dev
```

Admin frontend:

```bash
cd frontend_admin
npm install
npm run dev
```

User frontend:

```bash
cd frontend_user
npm install
npm run dev
```

Local URLs:

- Admin: `http://localhost:5174`
- User: `http://localhost:4173`
- Backend: `http://localhost:3000`

## 3. Which Render DB URL to use

Use `External Database URL` when the backend runs on your own computer.

Use `Internal Database URL` when the backend runs on Render.

In this project:

- local backend -> Render Postgres: `External Database URL`
- Render backend -> Render Postgres: `Internal Database URL`

## 4. Production deployment on Render

This repo now includes [render.yaml](./render.yaml).

It defines:

- `smartallocate-backend`
- `smartallocate-admin`
- `smartallocate-user`

It references an existing Render Postgres database named:

- `smartallocate-db`

If your existing Render database has a different name, update `render.yaml`.

## 5. Deploy with Blueprint

In Render:

1. Go to `Blueprints`
2. Click `New Blueprint Instance`
3. Select this repository
4. Render will detect `render.yaml`
5. Review the 3 services and create them

During setup, Render will ask for values for the variables marked `sync: false`.

Use these values:

### Backend variables

`FRONTEND_URL`

```env
https://YOUR-ADMIN.onrender.com,https://YOUR-USER.onrender.com
```

`CORS_ORIGINS`

```env
https://YOUR-ADMIN.onrender.com,https://YOUR-USER.onrender.com
```

`OPENAI_API_KEY`

```env
YOUR_OPENAI_KEY
```

### Admin frontend variables

`VITE_API_URL`

```env
https://YOUR-BACKEND.onrender.com
```

`VITE_USER_URL`

```env
https://YOUR-USER.onrender.com
```

### User frontend variables

`VITE_API_URL`

```env
https://YOUR-BACKEND.onrender.com
```

`VITE_ADMIN_URL`

```env
https://YOUR-ADMIN.onrender.com
```

## 6. Important note about first deploy

Because frontend build variables depend on the deployed backend URL, the practical order is:

1. create the backend
2. note the backend Render URL
3. set `VITE_API_URL` on both frontends
4. deploy frontends
5. update backend `FRONTEND_URL` and `CORS_ORIGINS` with the final frontend URLs

If you use the Blueprint flow, you can still do it in one pass, but you may need one extra redeploy after the final Render URLs are known.

## 7. Files already prepared in this repo

- [backend/config/env.js](./backend/config/env.js)
- [backend/db.js](./backend/db.js)
- [backend/server.js](./backend/server.js)
- [frontend_admin/src/api/api.js](./frontend_admin/src/api/api.js)
- [frontend_user/src/api.js](./frontend_user/src/api.js)
- [backend/.env.local.example](./backend/.env.local.example)
- [backend/.env.production.example](./backend/.env.production.example)
- [frontend_admin/.env.local.example](./frontend_admin/.env.local.example)
- [frontend_admin/.env.production.example](./frontend_admin/.env.production.example)
- [frontend_user/.env.local.example](./frontend_user/.env.local.example)
- [frontend_user/.env.production.example](./frontend_user/.env.production.example)

## 8. If CORS fails in production

Make sure `FRONTEND_URL` and `CORS_ORIGINS` on the backend contain the exact frontend URLs, including:

- protocol (`https://`)
- correct `onrender.com` hostname
- no trailing slash

Example:

```env
https://smartallocate-admin.onrender.com,https://smartallocate-user.onrender.com
```
