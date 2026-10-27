"""Display identities for the hub; edition-specific avatars remain unchanged."""
import hashlib
import re
import unicodedata

from django.utils import timezone

from catalog.models import BookAuthor


def normalized(value):
    value = unicodedata.normalize('NFKD', value).casefold()
    return ' '.join(re.sub(r'[^\w\s]', ' ', ''.join(
        char for char in value if not unicodedata.combining(char))).split())


# Explicit literary aliases only: a shared first name is not an identity.
AUTHOR_ALIASES = {
    'jules verne': 'julio verne',
    'b perez galdos': 'benito perez galdos',
    'ramon del valle inclan': 'ramon maria del valle inclan',
    'anton pavlovich chejov': 'anton chejov',
    'arthur conan doyle': 'arthur conan doyle',
    'sir arthur conan doyle': 'arthur conan doyle',
}
RECURRING_CHARACTERS = {
    'sherlock holmes': ('sherlock holmes', {'arthur conan doyle'}),
    'dr john h watson': ('john watson', {'arthur conan doyle'}),
    'dr john watson': ('john watson', {'arthur conan doyle'}),
    'doctor watson': ('john watson', {'arthur conan doyle'}),
    'dr watson': ('john watson', {'arthur conan doyle'}),
    'john h watson': ('john watson', {'arthur conan doyle'}),
    'john watson': ('john watson', {'arthur conan doyle'}),
    'capitan nemo': ('capitan nemo', {'julio verne'}),
    'albertine simonet': ('albertine simonet', {'marcel proust'}),
    'alicia': ('alicia', {'lewis carroll'}),
}


def author_name(value):
    name = normalized(value)
    return AUTHOR_ALIASES.get(name, name)


def group_hub_avatars(queryset, sort_by='name', recent_ids=None):
    # Fetch only display metadata for grouping. Prompts and biographies stay out
    # of this query; the paginated representatives are hydrated afterwards.
    rows = list(queryset.order_by().values(
        'id', 'name', 'is_author', 'avatar_image', 'chat_count',
        'edition__book_id', 'edition__book__title', 'edition__book__slug'))
    authors = {}
    for book_id, name in BookAuthor.objects.filter(
        book_id__in={row['edition__book_id'] for row in rows}, role=BookAuthor.RoleChoices.PRIMARY
    ).values_list('book_id', 'author__full_name'):
        authors.setdefault(book_id, set()).add(author_name(name))
    groups = {}
    recent_order = {str(pk): index for index, pk in enumerate(recent_ids or [])}
    for row in rows:
        book_id = row['edition__book_id']
        name = normalized(row['name'])
        creators = authors.get(book_id, set())
        key = f"{'author' if row['is_author'] else 'character'}:{book_id}:{name}"
        if row['is_author'] and author_name(row['name']) in creators:
            key = 'author:' + author_name(row['name'])
        elif not row['is_author'] and name in RECURRING_CHARACTERS:
            canonical, allowed_creators = RECURRING_CHARACTERS[name]
            if creators & allowed_creators:
                key = 'character:' + canonical + ':' + ','.join(sorted(creators & allowed_creators))
        groups.setdefault(key, []).append(row)

    result = []
    for key, members in groups.items():
        members.sort(key=lambda row: (
            recent_order.get(str(row['id']), len(recent_order)),
            not bool(row['avatar_image']), -row['chat_count'], str(row['id'])))
        representative = members[0]
        works = {}
        for row in members:
            works.setdefault(str(row['edition__book_id']), {
                'avatar_id': str(row['id']),
                'book_title': row['edition__book__title'],
                'book_slug': row['edition__book__slug'],
            })
        result.append({
            'key': key, 'id': representative['id'], 'name': representative['name'],
            'chat_count': sum(row['chat_count'] for row in members),
            'works': sorted(works.values(), key=lambda work: normalized(work['book_title'])),
            'recent_order': min((recent_order.get(str(row['id']), len(recent_order)) for row in members)),
            'has_image': any(row['avatar_image'] for row in members),
        })
    if recent_ids is not None:
        result.sort(key=lambda group: (group['recent_order'], group['key']))
    elif sort_by == 'popularity':
        result.sort(key=lambda group: (-group['chat_count'], normalized(group['name']), group['key']))
    elif sort_by == 'featured':
        # Portraits first: most avatars still lack one and silhouettes buried the catalogue.
        result.sort(key=lambda group: (
            not group['has_image'], -group['chat_count'], normalized(group['name']), group['key']))
    elif sort_by == 'daily':
        # A different but stable selection each day, characters before their authors.
        seed = timezone.localdate().isoformat()
        result.sort(key=lambda group: (
            group['key'].startswith('author:'),
            hashlib.sha256(f"{seed}:{group['key']}".encode()).hexdigest()))
    else:
        result.sort(key=lambda group: (normalized(group['name']), group['key']))
    return result


def hydrate_hub_groups(groups):
    from .models import AIAvatar
    avatars = {avatar.pk: avatar for avatar in AIAvatar.objects.select_related(
        'edition__book').filter(pk__in=[group['id'] for group in groups])}
    result = []
    for group in groups:
        avatar = avatars.get(group['id'])
        if avatar is not None:
            avatar.hub_group = group
            result.append(avatar)
    return result
