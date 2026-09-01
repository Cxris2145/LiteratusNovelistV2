"""
core/pagination.py — Clases globales de paginación
"""
from rest_framework.pagination import PageNumberPagination

class StandardResultsSetPagination(PageNumberPagination):
    """
    Paginación estándar para todo el proyecto Literatus.
    - 12 por página: encaja perfecto en grids de 4 columnas × 3 filas.
    - El frontend puede pedir hasta 50 con ?page_size=50.
    """
    page_size = 12
    page_size_query_param = 'page_size'
    max_page_size = 50
