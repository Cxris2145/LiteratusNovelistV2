import os

path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\core\components\maguito\maguito.component.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    (
        """    <radialGradient [attr.id]="ids['body']" cx="0.34" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#86a3f7"/>
      <stop offset="0.3" stop-color="#5373e3"/>
      <stop offset="0.7" stop-color="#3452c6"/>
      <stop offset="1" stop-color="#1f3190"/>
    </radialGradient>""",
        """    <radialGradient [attr.id]="ids['body']" cx="0.34" cy="0.3" r="0.85">
      <stop offset="0" style="stop-color: var(--mg-body-a, #86a3f7)"/>
      <stop offset="0.3" style="stop-color: var(--mg-body-b, #5373e3)"/>
      <stop offset="0.7" style="stop-color: var(--mg-body-c, #3452c6)"/>
      <stop offset="1" style="stop-color: var(--mg-body-d, #1f3190)"/>
    </radialGradient>"""
    ),
    (
        """    <linearGradient [attr.id]="ids['limb']" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5877e4"/>
      <stop offset="1" stop-color="#2c43b0"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['lid']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f5ed4"/>
      <stop offset="1" stop-color="#5373e3"/>
    </linearGradient>
    <radialGradient [attr.id]="ids['hat']" cx="0.3" cy="0.3" r="0.95">
      <stop offset="0" stop-color="#9d5fd8"/>
      <stop offset="0.45" stop-color="#6d2fad"/>
      <stop offset="1" stop-color="#3c1068"/>
    </radialGradient>
    <linearGradient [attr.id]="ids['brim']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8b4bc9"/>
      <stop offset="0.55" stop-color="#63259c"/>
      <stop offset="1" stop-color="#441373"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['brim-under']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a0c60"/>
      <stop offset="1" stop-color="#5b2090"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['band']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6a2aa6"/>
      <stop offset="1" stop-color="#4c1880"/>
    </linearGradient>""",
        """    <linearGradient [attr.id]="ids['limb']" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color: var(--mg-limb-a, #5877e4)"/>
      <stop offset="1" style="stop-color: var(--mg-limb-b, #2c43b0)"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['lid']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--mg-body-c, #3f5ed4)"/>
      <stop offset="1" style="stop-color: var(--mg-body-b, #5373e3)"/>
    </linearGradient>
    <radialGradient [attr.id]="ids['hat']" cx="0.3" cy="0.3" r="0.95">
      <stop offset="0" style="stop-color: var(--mg-hat-a, #9d5fd8)"/>
      <stop offset="0.45" style="stop-color: var(--mg-hat-b, #6d2fad)"/>
      <stop offset="1" style="stop-color: var(--mg-hat-c, #3c1068)"/>
    </radialGradient>
    <linearGradient [attr.id]="ids['brim']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--mg-brim-a, #8b4bc9)"/>
      <stop offset="0.55" style="stop-color: var(--mg-brim-b, #63259c)"/>
      <stop offset="1" style="stop-color: var(--mg-brim-c, #441373)"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['brim-under']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--mg-hat-c, #3a0c60)"/>
      <stop offset="1" style="stop-color: var(--mg-brim-b, #5b2090)"/>
    </linearGradient>
    <linearGradient [attr.id]="ids['band']" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--mg-band-a, #6a2aa6)"/>
      <stop offset="1" style="stop-color: var(--mg-band-b, #4c1880)"/>
    </linearGradient>"""
    ),
    (
        """    <radialGradient [attr.id]="ids['aura']" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#a855f7" stop-opacity="0.34"/>
      <stop offset="0.55" stop-color="#f5b73b" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#f5b73b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient [attr.id]="ids['hat-glow']" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#b56cff" stop-opacity="0.38"/>
      <stop offset="0.6" stop-color="#9b4dff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#9b4dff" stop-opacity="0"/>
    </radialGradient>""",
        """    <radialGradient [attr.id]="ids['aura']" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" style="stop-color: var(--mg-aura-glow, #a855f7); stop-opacity: 0.34"/>
      <stop offset="0.55" style="stop-color: var(--mg-spark-glow, #f5b73b); stop-opacity: 0.12"/>
      <stop offset="1" style="stop-color: var(--mg-spark-glow, #f5b73b); stop-opacity: 0"/>
    </radialGradient>
    <radialGradient [attr.id]="ids['hat-glow']" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" style="stop-color: var(--mg-hat-glow, #b56cff); stop-opacity: 0.38"/>
      <stop offset="0.6" style="stop-color: var(--mg-hat-glow, #9b4dff); stop-opacity: 0.12"/>
      <stop offset="1" style="stop-color: var(--mg-hat-glow, #9b4dff); stop-opacity: 0"/>
    </radialGradient>"""
    )
]

for idx, (old, new) in enumerate(replacements):
    old_crlf = old.replace('\n', '\r\n')
    new_crlf = new.replace('\n', '\r\n')
    if old_crlf in text:
        text = text.replace(old_crlf, new_crlf)
        print(f'Block {idx}: Replaced successfully (CRLF)')
    elif old in text:
        text = text.replace(old, new)
        print(f'Block {idx}: Replaced successfully (LF)')
    else:
        print(f'Block {idx}: Warning, not found')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print('Done!')

