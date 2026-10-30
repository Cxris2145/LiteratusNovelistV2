path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\core\components\maguito\maguito.component.css'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """  --mg-sleeve: #e39a2e;
  --mg-sleeve-hi: #f7c15e;
}"""

replacement = """  --mg-sleeve: #e39a2e;
  --mg-sleeve-hi: #f7c15e;

  /* Variables base de personalización de Maguito (sombrero, cuerpo, magia) */
  --mg-hat-a: #9d5fd8;
  --mg-hat-b: #6d2fad;
  --mg-hat-c: #3c1068;
  --mg-brim-a: #8b4bc9;
  --mg-brim-b: #63259c;
  --mg-brim-c: #441373;
  --mg-band-a: #6a2aa6;
  --mg-band-b: #4c1880;

  --mg-body-a: #86a3f7;
  --mg-body-b: #5373e3;
  --mg-body-c: #3452c6;
  --mg-body-d: #1f3190;
  --mg-limb-a: #5877e4;
  --mg-limb-b: #2c43b0;

  --mg-aura-glow: #a855f7;
  --mg-spark-glow: #ffe08a;
  --mg-hat-glow: #b56cff;
  --mg-metal-acc: #d6a64f;
}"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF")
else:
    print("Target not found")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("maguito.component.css updated!")

