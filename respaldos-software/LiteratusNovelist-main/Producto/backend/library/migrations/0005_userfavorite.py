import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0022_book_word_count'),
        ('library', '0004_db_audit_unique_constraints'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserFavorite',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, help_text='Identificador único universal. Ver documentación de diseño para justificación.', primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True, help_text='Fecha y hora de creación. Inmutable post-creación.')),
                ('updated_at', models.DateTimeField(auto_now=True, help_text='Fecha y hora de la última modificación. Gestionado automáticamente.')),
                ('is_active', models.BooleanField(db_index=True, default=True, help_text='False indica un registro borrado lógicamente (soft delete).')),
                ('deleted_at', models.DateTimeField(blank=True, default=None, help_text='Timestamp del borrado lógico. NULL = registro activo.', null=True)),
                ('book', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorited_by', to='catalog.book')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='favorites', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'User Favorite',
                'verbose_name_plural': 'User Favorites',
                'ordering': ['-created_at'],
                'indexes': [models.Index(fields=['user', 'created_at'], name='library_use_user_id_8edfc5_idx')],
                'constraints': [models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('user', 'book'), name='unique_active_user_favorite', violation_error_message='Este libro ya está en tus favoritos.')],
            },
        ),
    ]
