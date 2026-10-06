with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/library/reader/reader.component.html', 'r', encoding='utf-8') as f:
    html = f.read()

target = '''        <!-- VOZ PREMIUM AI (KOKORO) -->
        <div class="voice-option" [class.active]="currentAudioMode === 'kokoro'" (click)="setAudioMode('kokoro')">
          <div class="voice-info">
            <span>Voz Kokoro 80M</span>
            <small>Voz Neuronal API</small>
          </div>
          <span class="ink-cost unlocked-badge">Nuevo</span>
        </div>'''

replacement = '''        <!-- VOZ PREMIUM AI (KOKORO) - DESHABILITADO -->
        <div class="voice-option disabled-option" style="opacity: 0.5; pointer-events: none; cursor: not-allowed; filter: grayscale(100%);">
          <div class="voice-info">
            <span>Voz Kokoro 80M</span>
            <small>Voz Neuronal API (BETA)</small>
          </div>
          <span class="ink-cost unlocked-badge" style="background: #6b7280; border: none; color: white;">Próximamente</span>
        </div>'''

html = html.replace(target, replacement)
with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/library/reader/reader.component.html', 'w', encoding='utf-8') as f:
    f.write(html)
