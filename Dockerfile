# Multi-stage: build the React/TS SPA, then run the Flask API that serves it.

# --- 1. Build the frontend ---
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# --- 2. Backend runtime ---
FROM python:3.11-slim-bullseye
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
# Bring in the built SPA so Flask can serve it from frontend/dist.
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV FLASK_ENV=production
EXPOSE 5000
WORKDIR /app/backend
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "60", "app:app"]
