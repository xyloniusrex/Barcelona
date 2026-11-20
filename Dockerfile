# PoliGo — minimal single-container deployment.
# App + SQLite + Python-rendered animations, no external services.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server ./server
COPY tools ./tools
COPY web ./web

RUN mkdir -p data

VOLUME ["/app/data"]
EXPOSE 8000
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
