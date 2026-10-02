from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_profile_equipped_frame_profile_equipped_title_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='avatar',
            field=models.TextField(blank=True, default='', help_text='Foto de perfil del usuario (URL o imagen codificada).'),
        ),
    ]
