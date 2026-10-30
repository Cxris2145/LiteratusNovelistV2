path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\core\components\maguito\maguito.component.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Import
import_target = "import { MaguitoLook, MaguitoOutfit, WearSlot, resolveOutfit } from './maguito-outfit';"
import_replacement = "import { MaguitoLook, MaguitoOutfit, WearSlot, resolveOutfit } from './maguito-outfit';\nimport { MaguitoCustomColors, applyMaguitoColors } from './maguito-colors';"

# 2. Input
input_target = "  @Input() outfit: MaguitoOutfit | null | undefined = null;"
input_replacement = "  @Input() outfit: MaguitoOutfit | null | undefined = null;\n  /** Paleta de colores personalizada de Maguito. */\n  @Input() colors: Partial<MaguitoCustomColors> | null | undefined = null;"

# 3. ngOnChanges
onchanges_target = "    if (changes['outfit']) this.look = resolveOutfit(this.outfit);"
onchanges_replacement = "    if (changes['outfit']) this.look = resolveOutfit(this.outfit);\n    if (changes['colors'] && this.colors) applyMaguitoColors(this.host, this.colors);"

# 4. ngAfterViewInit
afterview_target = "    this.face = this.host.querySelector<SVGGElement>('.mg-face');"
afterview_replacement = "    this.face = this.host.querySelector<SVGGElement>('.mg-face');\n    if (this.colors) applyMaguitoColors(this.host, this.colors);"

for old, new in [
    (import_target, import_replacement),
    (input_target, input_replacement),
    (onchanges_target, onchanges_replacement),
    (afterview_target, afterview_replacement)
]:
    old_crlf = old.replace('\n', '\r\n')
    new_crlf = new.replace('\n', '\r\n')
    if old_crlf in text:
        text = text.replace(old_crlf, new_crlf)
        print("Replaced CRLF")
    elif old in text:
        text = text.replace(old, new)
        print("Replaced LF")
    else:
        print("Target not found:", old[:30])

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("maguito.component.ts updated!")

