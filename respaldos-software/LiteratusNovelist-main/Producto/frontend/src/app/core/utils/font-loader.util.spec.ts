import { loadFontStylesheet } from './font-loader.util';

describe('loadFontStylesheet', () => {
  const href = 'https://fonts.googleapis.com/css2?family=Prueba&display=swap';

  afterEach(() => {
    document.head.querySelectorAll(`link[href="${href}"]`).forEach(link => link.remove());
  });

  it('agrega la hoja una sola vez', () => {
    loadFontStylesheet(href);
    loadFontStylesheet(href);
    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .filter(link => link.href === href);
    expect(links.length).toBe(1);
  });
});
