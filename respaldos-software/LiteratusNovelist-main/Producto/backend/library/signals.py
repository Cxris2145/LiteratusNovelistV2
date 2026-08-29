from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import UserInventory, ReadingProgress

@receiver(post_save, sender=UserInventory)
def create_reading_progress(sender, instance, created, **kwargs):
    """
    Automatización de Progreso:
    Cada vez que un usuario adquiere una obra (UserInventory), 
    se le inicializa su registro de progreso en 0%.
    """
    if created:
        ReadingProgress.objects.get_or_create(inventory=instance)
