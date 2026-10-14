import { chapterWords } from './chapter-parser.util';

describe('chapterWords spoiler-safe indexes', () => {
  it('ignores hidden inline and top-level HTML when assigning word-N', () => {
    const html = '<h1>El comienzo</h1><p>Uno <script>personaje futuro</script><style>.futuro { color: red }</style> dos <template>secreto final</template> tres</p><script>fin revelado</script>';
    expect(chapterWords(html)).toEqual(['El', 'comienzo', 'Uno', 'dos', 'tres']);
  });
});
