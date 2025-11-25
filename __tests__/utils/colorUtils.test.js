import { getTextColorForBackground } from '../../src/utils/colorUtils';

describe('getTextColorForBackground', () => {
  it('should return "black" for a light background color', () => {
    // 白に近い色
    expect(getTextColorForBackground('#FFFFFF')).toBe('black');
    expect(getTextColorForBackground('#FFFF00')).toBe('black'); // 黄色
    expect(getTextColorForBackground('#00FF00')).toBe('white'); // 緑
  });

  it('should return "white" for a dark background color', () => {
    // 黒に近い色
    expect(getTextColorForBackground('#000000')).toBe('white');
    expect(getTextColorForBackground('#FF0000')).toBe('white'); // 赤
    expect(getTextColorForBackground('#0000FF')).toBe('white'); // 青
  });

  it('should return "black" when hexColor is null or undefined', () => {
    expect(getTextColorForBackground(null)).toBe('black');
    expect(getTextColorForBackground(undefined)).toBe('black');
  });

  it('should return correct color when hexColor does not start with #', () => {
    expect(getTextColorForBackground('FFFFFF')).toBe('black');
    expect(getTextColorForBackground('000000')).toBe('white');
  });

  // 境界値のテスト
  it('should return "black" for a color slightly above the luminance threshold', () => {
    // 輝度186が閾値なので、187以上はblack
    // RGB(187, 187, 187) -> #BBBBBB, 輝度 = 0.299 * 187 + 0.587 * 187 + 0.114 * 187 = 187
    expect(getTextColorForBackground('#BBBBBB')).toBe('black');
  });

  it('should return "white" for a color slightly below the luminance threshold', () => {
    // 輝度186が閾値なので、185以下はwhite
    // RGB(185, 185, 185) -> #B9B9B9, 輝度 = 0.299 * 185 + 0.587 * 185 + 0.114 * 185 = 185
    expect(getTextColorForBackground('#B9B9B9')).toBe('white');
  });

  // 不正な入力のテスト
  it('should return "white" for invalid hex colors (too short)', () => {
    expect(getTextColorForBackground('#FFF')).toBe('white');
    expect(getTextColorForBackground('FFF')).toBe('white');
    expect(getTextColorForBackground('#123')).toBe('white');
  });

  it('should return "white" for invalid hex colors (too long)', () => {
    expect(getTextColorForBackground('#1234567')).toBe('white');
    expect(getTextColorForBackground('1234567')).toBe('white');
  });

  it('should return "white" for invalid hex colors (invalid characters)', () => {
    expect(getTextColorForBackground('#GGGGGG')).toBe('white');
    expect(getTextColorForBackground('GGGGGG')).toBe('white');
    expect(getTextColorForBackground('#12345G')).toBe('white');
  });

  it('should return "black" for an empty string hexColor', () => {
    expect(getTextColorForBackground('')).toBe('black');
  });
});
