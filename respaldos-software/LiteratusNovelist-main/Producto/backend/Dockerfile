# Backend de Literatus Novelist para Azure Container Apps.
# GitHub construye esta imagen (.github/workflows/backend-image.yml) y .\deploy-azure.ps1 la publica.
# Guía paso a paso: ../DEPLOY-AZURE.md
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# Compilar los .py al construir la imagen acorta el arranque.
RUN python -m compileall -q .

# Un solo proceso con varios hilos: la narración y los resúmenes corren en hilos de fondo de ese
# proceso. --timeout 0 deja el límite de cada petición en manos de Azure.
EXPOSE 8080
CMD exec gunicorn config.wsgi:application --bind :${PORT:-8080} --workers 1 --threads 16 --timeout 0
