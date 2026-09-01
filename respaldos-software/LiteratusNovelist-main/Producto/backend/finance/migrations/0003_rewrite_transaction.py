"""
finance/migrations/0003_rewrite_transaction.py

Migración manual que elimina los modelos anteriores (Order, OrderItem, Transaction)
y recrea solo Transaction con el nuevo esquema para Webpay Plus.
"""
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0002_initial'),
        ('users', '0001_initial'),
    ]

    operations = [
        # 1. Borrar TODAS las tablas viejas (si existen) en un solo SQL seguro
        migrations.RunSQL(
            sql="""
                DROP TABLE IF EXISTS finance_transaction CASCADE;
                DROP TABLE IF EXISTS finance_orderitem CASCADE;
                DROP TABLE IF EXISTS finance_order CASCADE;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),

        # 2. Eliminar los modelos del estado de Django con state_operations=[]
        #    para que Django no intente borrarlos de la DB otra vez
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel(name='Transaction'),
                migrations.DeleteModel(name='OrderItem'),
                migrations.DeleteModel(name='Order'),
            ],
        ),

        # 3. Crear el nuevo modelo Transaction limpio
        migrations.CreateModel(
            name='Transaction',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('buy_order', models.CharField(help_text='ID único de orden para Webpay.', max_length=50, unique=True)),
                ('session_id', models.CharField(blank=True, help_text='ID de sesión interno.', max_length=100)),
                ('token', models.CharField(blank=True, help_text='Token WS devuelto por Transbank.', max_length=255, null=True, unique=True)),
                ('amount', models.DecimalField(decimal_places=2, help_text='Monto total cobrado.', max_digits=10)),
                ('status', models.CharField(
                    choices=[('iniciada', 'Iniciada'), ('exitosa', 'Exitosa'), ('fallida', 'Fallida'), ('reversada', 'Reversada')],
                    default='iniciada', max_length=20
                )),
                ('response_code', models.CharField(blank=True, help_text='Código de respuesta de Transbank.', max_length=10, null=True)),
                ('item_type', models.CharField(
                    choices=[('book', 'Libro'), ('ink', 'Tinta')],
                    max_length=10
                )),
                ('item_reference', models.CharField(help_text='Slug del libro o cantidad de tinta.', max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transactions', to='users.user')),
            ],
            options={
                'verbose_name': 'Transaction',
                'verbose_name_plural': 'Transactions',
            },
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['buy_order'], name='finance_tra_buy_ord_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['token'], name='finance_tra_token_idx'),
        ),
    ]
