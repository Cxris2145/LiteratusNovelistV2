from django.apps import AppConfig


class ParentalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'parental'
    verbose_name = 'Control parental'
