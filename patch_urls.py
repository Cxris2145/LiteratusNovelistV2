with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/urls.py', 'r', encoding='utf-8') as f:
    urls_py = f.read()

if 'AutocompleteView' not in urls_py:
    urls_py = urls_py.replace("AuthorSubmitBookView, AuthorMySubmissionsView, AuthorSubmissionRequirementsView", "AuthorSubmitBookView, AuthorMySubmissionsView, AuthorSubmissionRequirementsView, AutocompleteView")
    urls_py = urls_py.replace("path('stats/', CatalogStatsView.as_view(), name='catalog-stats'),", "path('autocomplete/', AutocompleteView.as_view(), name='catalog-autocomplete'),\n    path('stats/', CatalogStatsView.as_view(), name='catalog-stats'),")

with open('respaldos-software/LiteratusNovelist-main/Producto/backend/catalog/urls.py', 'w', encoding='utf-8') as f:
    f.write(urls_py)
