path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\community\tavern-bazar\tavern-bazar.component.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. BazarTab
text = text.replace(
    "export type BazarTab = 'ropero' | 'racha' | 'perfil';",
    "export type BazarTab = 'ropero' | 'tintes' | 'racha' | 'perfil';"
)

# 2. isBazarTab
text = text.replace(
    "export function isBazarTab(value: string | null | undefined): value is BazarTab {\n  return value === 'ropero' || value === 'racha' || value === 'perfil';\n}",
    "export function isBazarTab(value: string | null | undefined): value is BazarTab {\n  return value === 'ropero' || value === 'tintes' || value === 'racha' || value === 'perfil';\n}"
)

# 3. TAB_ITEMS
text = text.replace(
    """const TAB_ITEMS: Record<BazarTab, ShopItem['item_type'][]> = {
  ropero: ['maguito_wear'],
  racha: ['streak_shield', 'streak_repair', 'hearts_refill'],
  perfil: ['profile_frame', 'title', 'theme'],
};""",
    """const TAB_ITEMS: Record<BazarTab, ShopItem['item_type'][]> = {
  ropero: ['maguito_wear'],
  tintes: [],
  racha: ['streak_shield', 'streak_repair', 'hearts_refill'],
  perfil: ['profile_frame', 'title', 'theme'],
};"""
)

# 4. tabLabels & tabIcons
text = text.replace(
    "readonly tabLabels: Record<BazarTab, string> = { ropero: 'Ropero', racha: 'Racha y vidas', perfil: 'Perfil' };\n  readonly tabIcons: Record<BazarTab, string> = { ropero: 'checkroom', racha: 'local_fire_department', perfil: 'badge' };",
    "readonly tabLabels: Record<BazarTab, string> = { ropero: 'Ropero', tintes: 'Tintes', racha: 'Racha y vidas', perfil: 'Perfil' };\n  readonly tabIcons: Record<BazarTab, string> = { ropero: 'checkroom', tintes: 'palette', racha: 'local_fire_department', perfil: 'badge' };"
)

# 5. count
text = text.replace(
    "count(tab: BazarTab): number { return this.items.filter(item => TAB_ITEMS[tab].includes(item.item_type)).length; }",
    "count(tab: BazarTab): number { return tab === 'tintes' ? 1 : this.items.filter(item => (TAB_ITEMS[tab] || []).includes(item.item_type)).length; }"
)

# 6. applyFilter
text = text.replace(
    """  applyFilter(): void {
    const types = TAB_ITEMS[this.tab];""",
    """  applyFilter(): void {
    if (this.tab === 'tintes') {
      this.visibleItems = [];
      return;
    }
    const types = TAB_ITEMS[this.tab] || [];"""
)

# 7. onCustomizerSaved
if "onCustomizerSaved(" not in text:
    text = text.replace(
        "  // ── Probador ──────────────────────────────────────────────",
        """  onCustomizerSaved(colors: any): void {
    this.gesture.emit('equip');
  }

  // ── Probador ──────────────────────────────────────────────"""
    )

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("tavern-bazar.component.ts updated successfully!")

