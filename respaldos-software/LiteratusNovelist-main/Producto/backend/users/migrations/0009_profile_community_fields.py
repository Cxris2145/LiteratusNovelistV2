from django.db import migrations, models


class Migration(migrations.Migration):
    """Campos de La Taberna de Tinta. friend_code nace sin índice único: 0010 lo rellena y 0011 lo vuelve único."""

    dependencies = [
        ('users', '0008_profile_favorite_genres_profile_followed_authors_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='friend_code',
            field=models.CharField(blank=True, editable=False, max_length=6, null=True, help_text='Código público e inmutable para encontrar al lector en La Taberna (ej. K7Q2XM).'),
        ),
        migrations.AddField(
            model_name='profile',
            name='tagline',
            field=models.CharField(blank=True, default='', max_length=80, help_text='Frase corta que ven los amigos en La Taberna.'),
        ),
        migrations.AddField(
            model_name='profile',
            name='outfit',
            field=models.JSONField(blank=True, default=dict, help_text="Accesorios de Maguito por espacio: {'head': 'crown', ...}. Solo cambia desde El Bazar."),
        ),
        migrations.AddField(
            model_name='profile',
            name='last_seen_in_tavern',
            field=models.DateTimeField(blank=True, null=True, help_text='Último latido de presencia en La Taberna.'),
        ),
    ]
