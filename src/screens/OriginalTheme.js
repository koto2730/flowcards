import { DefaultTheme } from 'react-native-paper';

const OriginalTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#7C4DFF', // プライマリカラー
    background: '#33334D', // 背景色
    surface: '#F5F3F7', // サーフェイスの色
    onSurface: '#000000', // サーフェイス上のテキスト・アイコンの色
  },
};

export default OriginalTheme;
