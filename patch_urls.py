with open('respaldos-software/LiteratusNovelist-main/Producto/backend/ai_engine/urls.py', 'r', encoding='utf-8') as f:
    urls_py = f.read()

import re

# Add import
if 'AssistantEphemeralChatView' not in urls_py:
    urls_py = urls_py.replace('AssistantChatView,', 'AssistantChatView,\n    AssistantEphemeralChatView,')

# Add path
if 'chat/ephemeral/' not in urls_py:
    urls_py = urls_py.replace("path('assistant/chat/', AssistantChatView.as_view(), name='assistant-chat'),", "path('assistant/chat/', AssistantChatView.as_view(), name='assistant-chat'),\n    path('assistant/chat/ephemeral/', AssistantEphemeralChatView.as_view(), name='assistant-chat-ephemeral'),")

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/ai_engine/urls.py', 'w', encoding='utf-8') as f:
    f.write(urls_py)
