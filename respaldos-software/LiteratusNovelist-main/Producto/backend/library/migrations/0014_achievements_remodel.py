from django.db import migrations, models


def sync_remodel_catalog(apps, schema_editor):
    from library.achievement_catalog import sync_achievements
    sync_achievements(apps.get_model('library', 'Achievement'), apps.get_model('learning', 'ShopItem'))


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0013_notebooktab'),
    ]

    operations = [
        migrations.AddField(
            model_name='achievement',
            name='predefined_rarity_pct',
            field=models.FloatField(
                default=45.0,
                help_text='Porcentaje base predefinido de rareza antes del cálculo dinámico comunitario.'
            ),
        ),
        migrations.AlterField(
            model_name='achievement',
            name='rarity',
            field=models.CharField(
                choices=[
                    ('common', 'Común'),
                    ('rare', 'Raro'),
                    ('epic', 'Épico'),
                    ('legendary', 'Legendario'),
                    ('bronze', 'Bronce'),
                    ('silver', 'Plata'),
                    ('gold', 'Oro'),
                    ('diamond', 'Diamante'),
                ],
                default='bronze',
                max_length=12,
            ),
        ),
        migrations.RunPython(sync_remodel_catalog, migrations.RunPython.noop),
    ]
