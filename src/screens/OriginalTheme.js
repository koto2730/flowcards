import { DefaultTheme } from 'react-native-paper';

const OriginalTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#7C4DFF', // プライマリカラー
    secondary: '#33334D',
    tertiary: '#00DDC6ff',
    background: '#33334D', // 背景色
    surface: '#F5F3F7', // サーフェイスの色
    onSurface: '#000000', // サーフェイス上のテキスト・アイコンの色
    onSurfaceVariant: 'gray', // チェックボックスなどのアウトラインの色
  },
};
export default OriginalTheme;
