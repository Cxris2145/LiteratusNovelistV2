from django.urls import path
from .views import StoreSettingsView

urlpatterns = [
    path('settings/', StoreSettingsView.as_view(), name='store-settings'),
]
