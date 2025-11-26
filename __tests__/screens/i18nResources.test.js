import { resources } from '../../src/screens/i18nResources';

describe('i18nResources', () => {
  const languages = Object.keys(resources);
  const baseLang = 'en';
  const baseKeys = Object.keys(resources[baseLang].translation).sort();

  it('should have translation keys for all languages', () => {
    expect(languages).toContain('en');
    expect(languages).toContain('ja');
    expect(languages).toContain('zh');
  });

  languages.forEach(lang => {
    if (lang === baseLang) return;

    it(`should have all keys in ${lang} that are present in ${baseLang}`, () => {
      const langKeys = Object.keys(resources[lang].translation).sort();
      
      // ベース言語にあるキーが、対象言語にもあるか
      baseKeys.forEach(key => {
        if (!langKeys.includes(key)) {
          // テスト失敗時に分かりやすくするためログ出力（jestの出力で見えない場合もあるが）
          // console.error(`Missing key in ${lang}: ${key}`);
        }
        expect(langKeys).toContain(key);
      });
    });

    it(`should have no extra keys in ${lang} that are not in ${baseLang}`, () => {
        const langKeys = Object.keys(resources[lang].translation).sort();
        
        // 対象言語にあるキーが、ベース言語にもあるか
        langKeys.forEach(key => {
          if (!baseKeys.includes(key)) {
             // console.error(`Extra key in ${lang}: ${key}`);
          }
          expect(baseKeys).toContain(key);
        });
      });
  });
});
