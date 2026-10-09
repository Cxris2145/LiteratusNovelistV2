with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

import re

# Add isEphemeral
if 'isEphemeral$' not in ts:
    ts = ts.replace("public conversations$ = this._conversations$.asObservable();", "public conversations$ = this._conversations$.asObservable();\n  private _isEphemeral$ = new BehaviorSubject<boolean>(false);\n  public isEphemeral$ = this._isEphemeral$.asObservable();")

# Add toggleEphemeral and update startNewConversation
if 'setEphemeralMode(' not in ts:
    ts = ts.replace("startNewConversation(): void {", '''setEphemeralMode(ephemeral: boolean): void {
    this._isEphemeral$.next(ephemeral);
    if (ephemeral) {
      this._activeConversationId$.next(null);
      this._messages$.next([{ role: 'assistant', content: ASSISTANT_GREETING }]);
      this._isHistoryOpen$.next(false);
    } else {
      this.startNewConversation();
    }
  }

  startNewConversation(): void {
    if (this._isEphemeral$.value) {
      this._activeConversationId$.next(null);
      this._messages$.next([{ role: 'assistant', content: ASSISTANT_GREETING }]);
      this._isHistoryOpen$.next(false);
      return;
    }''')

# Update sendMessage to handle ephemeral
send_msg_logic = '''
  sendMessage(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this._isEphemeral$.value) {
      const history = [...this._messages$.value];
      history.push({ role: 'user', content: trimmed });
      this._messages$.next(history);
      
      const pMsg = { id: 'pending', role: 'assistant' as const, content: '', pending: true };
      this._messages$.next([...history, pMsg]);
      
      this.api.post<AssistantMessage>(${this.BASE}/chat/ephemeral/, {
        message: trimmed,
        section: this.currentSection,
        history: history.filter(m => !m.pending && m.role !== 'assistant' || m.content !== ASSISTANT_GREETING)
      }).subscribe({
        next: (reply) => {
          this._messages$.next([...history, reply]);
        },
        error: () => {
          this._messages$.next([...history, { role: 'assistant', content: 'Lo siento, hubo un error de conexión.' }]);
        }
      });
      return;
    }

    let conversationId = this._activeConversationId$.value;
'''

ts = re.sub(r"  sendMessage\(text: string\): void \{[\s\S]*?let conversationId = this\._activeConversationId\$\.value;", send_msg_logic.strip(), ts)

with open('respaldos-software/LiteratusNovelist-main/Producto/frontend/src/app/core/services/assistant.service.ts', 'w', encoding='utf-8') as f:
    f.write(ts)
