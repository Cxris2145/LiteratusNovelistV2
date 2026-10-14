import { HubAvatar } from '../../core/services/chat.service';
import { FALLBACK_AVATAR, portraitThumbnail, uniqueCharacters } from './character-hub.util';

describe('Character hub portraits and identities', () => {
  it('keeps both dimensions and contain when requesting a portrait thumbnail', () => {
    const url = new URL(portraitThumbnail('https://example.supabase.co/storage/v1/object/public/media/portrait.webp?download=1'));
    expect(url.pathname).toContain('/render/image/public/');
    expect(url.searchParams.get('width')).toBe('300');
    expect(url.searchParams.get('height')).toBe('375');
    expect(url.searchParams.get('resize')).toBe('contain');
    expect(url.searchParams.get('download')).toBe('1');
  });

  it('preserves local images and supplies the placeholder only when missing', () => {
    expect(portraitThumbnail('/media/a.webp')).toBe('/media/a.webp');
    expect(portraitThumbnail(null)).toBe(FALLBACK_AVATAR);
  });

  it('removes overlapping groups across pages without merging homonyms', () => {
    const a = {id: '1', name: 'Alberto', group_key: 'book-a:alberto'} as HubAvatar;
    const b = {id: '2', name: 'Alberto', group_key: 'book-b:alberto'} as HubAvatar;
    const overlap = {...a, id: '3'};
    expect(uniqueCharacters([a, b, overlap])).toEqual([overlap, b]);
  });
});
