with open('respaldos-software/LiteratusNovelist-main/Producto/backend/ai_engine/views.py', 'r', encoding='utf-8') as f:
    views_py = f.read()

ephemeral_view = '''
class AssistantEphemeralChatView(APIView):
    \"\"\"
    POST /api/v1/ai/assistant/chat/ephemeral/
    Modo efímero: no guarda la conversación en la base de datos.
    Recibe message (el último mensaje) y history (lista de mensajes anteriores).
    \"\"\"
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        message_content = request.data.get('message')
        section = request.data.get('section', '')
        history_data = request.data.get('history', [])

        if not message_content:
            return Response({"error": "message is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Mock conversation to reuse AssistantAIService without saving
        class FakeConversation:
            id = None
            def __init__(self, history):
                self.history = history
            def getattr(self, attr, default):
                return default

        fake_conv = FakeConversation(history_data)
        
        # We need to monkey patch _format_history in AssistantAIService to use history_data
        from google.generativeai import types
        class EphemeralAssistantAIService(AssistantAIService):
            def _format_history(self):
                formatted = []
                for msg in self.conversation.history:
                    # expects msg to be dict with 'role' and 'content'
                    role = 'model' if msg.get('role') == 'assistant' else 'user'
                    formatted.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.get('content', ''))]))
                return formatted
                
        try:
            assistant_service = EphemeralAssistantAIService(conversation=fake_conv)
            reply_text = assistant_service.generate_reply(message_content, section=section)
        except Exception as e:
            return Response(
                {"error": f"Error del asistente: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response({
            "id": "ephemeral-msg",
            "role": "assistant",
            "content": reply_text
        }, status=status.HTTP_200_OK)
'''

if 'class AssistantEphemeralChatView' not in views_py:
    views_py += '\n' + ephemeral_view

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/ai_engine/views.py', 'w', encoding='utf-8') as f:
    f.write(views_py)
