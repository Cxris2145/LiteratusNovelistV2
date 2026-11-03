"""Marcos de El Bazar: precios por rareza, siembra y que el frontend sepa dibujar cada uno."""
import importlib
import re
from pathlib import Path
from unittest import skipUnless

from django.apps import apps
from django.test import TestCase

from learning.cosmetics_catalog import COSMETICS, FRAME, FRAME_PRICES
from learning.models import ShopItem

FRAMES = [row for row in COSMETICS if row[1] == FRAME]
AVATAR_FRAME_DIR = (Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'app'
                    / 'core' / 'components' / 'avatar-frame')


class FrameCatalogTests(TestCase):

    def test_every_frame_for_sale_costs_exactly_its_tier_price(self):
        prices = set(FRAME_PRICES.values())
        for code, _, _, _, _, cost, _, purchasable, _ in FRAMES:
            if purchasable:
                self.assertIn(cost, prices, code)

    def test_tiers_go_up_in_price(self):
        ladder = list(FRAME_PRICES.values())
        self.assertEqual(ladder, sorted(ladder))
        self.assertEqual(len(ladder), len(set(ladder)))

    def test_there_are_many_animated_frames_with_seasonal_ones(self):
        values = {row[2] for row in FRAMES}
        animated = [row for row in FRAMES if row[8] >= 200]
        self.assertGreaterEqual(len(animated), 30)
        for prefix in ('frame-xmas-', 'frame-ny-', 'frame-hw-', 'frame-bw-'):
            self.assertGreaterEqual(sum(v.startswith(prefix) for v in values), 3, prefix)
        self.assertIn('frame-dragon-fire', values)
        self.assertEqual(len({row[0] for row in COSMETICS}), len(COSMETICS))
        self.assertEqual(len({row[2] for row in COSMETICS}), len(COSMETICS))

    def test_migrations_seed_the_animated_frames_for_sale(self):
        dragon = ShopItem.objects.get(code='frame_dragon_fire')
        self.assertEqual((dragon.value, dragon.cost_ink, dragon.is_purchasable), ('frame-dragon-fire', 750, True))
        self.assertEqual(ShopItem.objects.get(code='frame_xmas_santa').cost_ink, FRAME_PRICES['legendario'])

    def test_classic_frames_move_to_the_ladder_unless_someone_set_their_price(self):
        ShopItem.objects.filter(code='frame_gold').update(cost_ink=80)
        ShopItem.objects.filter(code='frame_victorian').update(cost_ink=123)
        migration = importlib.import_module('learning.migrations.0008_animated_frames')
        migration.seed_animated_frames(apps, None)
        self.assertEqual(ShopItem.objects.get(code='frame_gold').cost_ink, FRAME_PRICES['comun'])
        self.assertEqual(ShopItem.objects.get(code='frame_victorian').cost_ink, 123)

    @skipUnless(AVATAR_FRAME_DIR.exists(), 'sin el frontend al lado')
    def test_the_frontend_draws_every_frame(self):
        catalog = (AVATAR_FRAME_DIR / 'frame-catalog.ts').read_text(encoding='utf-8')
        styles = ''.join(p.read_text(encoding='utf-8') for p in AVATAR_FRAME_DIR.glob('*.css'))
        known = set(re.findall(r"'(frame-[a-z0-9-]+)':", catalog))
        for _, _, value, *_ in FRAMES:
            self.assertIn(value, known, f'{value} no está en frame-catalog.ts')
            self.assertIn(f'[data-frame="{value}"]', styles, f'{value} no tiene estilos')
