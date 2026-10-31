path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\core\services\community.service.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """  member_since: string;
  is_public: boolean;
  relation: Relation;"""

replacement = """  member_since: string;
  is_public: boolean;
  show_friends?: boolean;
  show_books?: boolean;
  show_reviews?: boolean;
  relation: Relation;"""

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf)
    print("Replaced CRLF in community.service.ts")
elif target in text:
    text = text.replace(target, replacement)
    print("Replaced LF in community.service.ts")
else:
    print("Target not found in community.service.ts")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

