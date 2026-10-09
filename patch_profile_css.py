with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re

# Update profile-layout-grid
css = re.sub(
    r"\.profile-layout-grid \{[\s\S]*?\}",
    ".profile-layout-grid {\\n  display: flex;\\n  flex-direction: column;\\n  align-items: stretch;\\n  width: 100%;\\n  max-width: 640px;\\n  margin: 0 auto;\\n  box-sizing: border-box;\\n}",
    css,
    count=1
)

# Remove grid-template-columns in media query
css = re.sub(
    r"@media \(max-width: 860px\) \{\s*\.profile-layout-grid \{\s*grid-template-columns: 1fr;\s*gap: 28px;\s*\}\s*\}",
    "",
    css
)

# Add tabs CSS
tabs_css = '''
.profile-tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin: 10px auto 32px auto;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  padding: 6px;
  border-radius: 100px;
  width: fit-content;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-ui);
  font-weight: 500;
  font-size: 14px;
  border-radius: 100px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn span {
  font-size: 18px;
}

.tab-btn:hover {
  color: var(--text-main);
  background: rgba(255,255,255,0.05);
}

.tab-btn.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  box-shadow: 0 4px 12px var(--color-primary-shadow, rgba(0,0,0,0.3));
}
'''

css = css + '\n' + tabs_css

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/users/profile/profile.component.css', 'w', encoding='utf-8') as f:
    f.write(css)
