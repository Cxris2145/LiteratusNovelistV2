"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from django.http import JsonResponse

def health_check(request):
    return JsonResponse({"status": "ok", "message": "Server is awake!"})

urlpatterns = [
    # Health check para pings automáticos (ej. cron-job.org)
    path('api/health/', health_check, name='health_check'),

    # Panel de administración base
    path('admin/', admin.site.urls),

    # -----------------------------------------------------------------------
    # Rutas OpenAPI y Documentación Swagger
    # -----------------------------------------------------------------------
    # Endpoint central que genera el esquema JSON/YAML dinámico
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    # Interfaz interactiva de Swagger UI consumiendo el esquema
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # -----------------------------------------------------------------------
    # Endpoints de Módulos (Business Logic)
    # -----------------------------------------------------------------------
    path('api/v1/users/', include('users.urls')),
    path('api/v1/catalog/', include('catalog.urls')),
    path('api/v1/library/', include('library.urls')),
    path('api/v1/ai/', include('ai_engine.urls')),
    path('api/v1/finance/', include('finance.urls')),
    path('api/v1/dashboard/', include('dashboard.urls')),
    path('api/v1/core/', include('core.urls')),
]

from django.conf import settings
from django.conf.urls.static import static

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
