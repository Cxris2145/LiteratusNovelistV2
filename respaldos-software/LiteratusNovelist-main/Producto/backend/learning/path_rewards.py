"""Recompensas efectivas del nivel, compartidas por el mapa y la corrección."""


def level_reward_preview(level, is_practice=False):
    return {
        'xp': 5 if is_practice else level.xp_reward,
        'ink': 0 if is_practice else min(level.ink_reward, 10),
        'perfect_bonus_xp': 0 if is_practice else 10,
        'perfect_bonus_ink': 0 if is_practice else 3,
        'is_practice': bool(is_practice),
    }
