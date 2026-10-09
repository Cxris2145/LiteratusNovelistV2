with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

# Add isEphemeral to the component
if 'isEphemeral = false;' not in ts:
    ts = ts.replace("isOpen = false;", "isOpen = false;\n  isEphemeral = false;")
    
    ts = ts.replace("this.assistant.isHistoryOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isHistoryOpen = v);", "this.assistant.isHistoryOpen$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isHistoryOpen = v);\n      this.assistant.isEphemeral$.pipe(takeUntil(this.destroy$)).subscribe(v => this.isEphemeral = v);")

# Add toggleEphemeral to component
if 'toggleEphemeral(): void' not in ts:
    ts = ts.replace("newConversation(): void {", '''toggleEphemeral(): void {
    this.assistant.setEphemeralMode(!this.isEphemeral);
  }

  newConversation(): void {
    if (this.isEphemeral) this.assistant.setEphemeralMode(false);
    this.assistant.startNewConversation();
  }''')

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/components/assistant-widget/assistant-widget.component.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
