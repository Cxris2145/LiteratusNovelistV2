path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\users\profile\profile.component.css'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """.visibility-group .field-hint { margin-top: 2px; }"""

replacement = """.visibility-group .field-hint { margin-top: 2px; }

/* Subopciones de privacidad granular */
.privacy-suboptions {
  margin-top: 14px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--color-surface, #fff) 40%, transparent);
  border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.15));
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.privacy-suboptions-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.privacy-toggles-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.visibility-toggle.sub-toggle {
  min-height: 44px;
  padding: 4px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-surface, #fff) 30%, transparent);
  transition: background 0.15s ease;
  user-select: none;
}

.visibility-toggle.sub-toggle:active {
  background: color-mix(in srgb, var(--color-surface, #fff) 60%, transparent);
}

.visibility-toggle.sub-toggle .material-symbols-rounded {
  font-size: 19px;
  color: var(--color-primary, #6366f1);
}

@media (min-width: 600px) {
  .privacy-toggles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
  }
}"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in profile.component.css")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in profile.component.css")
else:
    print("Target not found in profile.component.css")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

