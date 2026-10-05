from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_backfill_friend_codes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='profile',
            name='friend_code',
            field=models.CharField(blank=True, editable=False, max_length=6, null=True, unique=True, help_text='Código público e inmutable para encontrar al lector en La Taberna (ej. K7Q2XM).'),
        ),
    ]
