path = r'respaldos-software\LiteratusNovelist-main\Producto\frontend\src\app\users\profile\profile.component.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. FormGroup in constructor
target1 = """      country: [''],
      birth_date: [''],
      is_public: [true]
    });"""

replacement1 = """      country: [''],
      birth_date: [''],
      is_public: [true],
      show_friends: [true],
      show_books: [true],
      show_reviews: [true]
    });"""

# 2. patchValue in loadProfile
target2 = """            country: profile.country,
            birth_date: profile.birth_date || '',
            is_public: profile.is_public !== false
          });"""

replacement2 = """            country: profile.country,
            birth_date: profile.birth_date || '',
            is_public: profile.is_public !== false,
            show_friends: profile.show_friends !== false,
            show_books: profile.show_books !== false,
            show_reviews: profile.show_reviews !== false
          });"""

# 3. payload in onSubmit
target3 = """      theme: this.selectedTheme,
      is_public: this.profileForm.get('is_public')?.value !== false
    };"""

replacement3 = """      theme: this.selectedTheme,
      is_public: this.profileForm.get('is_public')?.value !== false,
      show_friends: this.profileForm.get('show_friends')?.value !== false,
      show_books: this.profileForm.get('show_books')?.value !== false,
      show_reviews: this.profileForm.get('show_reviews')?.value !== false
    };"""

for t, r in [(target1, replacement1), (target2, replacement2), (target3, replacement3)]:
    t_crlf = t.replace('\n', '\r\n')
    r_crlf = r.replace('\n', '\r\n')
    if t_crlf in text:
        text = text.replace(t_crlf, r_crlf)
        print("Replaced CRLF")
    elif t in text:
        text = text.replace(t, r)
        print("Replaced LF")
    else:
        print("Target not found:", t[:30])

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
print("profile.component.ts updated")

