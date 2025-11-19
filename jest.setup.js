jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');

  // The mock for `call` immediately calls the callback `fun`
  Reanimated.default.call = (fun) => fun();

  return {
    ...Reanimated,
    // ReanimatedLogLevel をモックに追加
    ReanimatedLogLevel: {
      current: 1, // 初期値
      set: jest.fn(),
      setStrict: jest.fn(),
      warn: 1,
      error: 2,
    },
    // configureReanimatedLogger も必要に応じて完全なモックに
    configureReanimatedLogger: jest.fn(),
  };
});
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: 'View',
  // 他のGesture Handlerのコンポーネントやフックも必要に応じてモックする
}));

// Skiaモックの追加
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');

  // Skiaの描画コンポーネントを単純なViewとしてモック
  const createSkiaMockComponent = (name) => {
    return (props) => React.createElement(name, props);
  };

  return {
    // スコープ外に持ち出すものをここに移動
    TextAlign: { Left: 'left' }, // 直接エクスポート
    FontWeight: { Bold: 'bold' }, // 直接エクスポート
    // Skiaオブジェクトの主要な部分をモック
    Skia: {
      Color: jest.fn((c) => c), // 色をそのまま返す
      XYWHRect: jest.fn(() => ({})),
      Path: {
        Make: jest.fn(() => ({
          moveTo: jest.fn().mockReturnThis(),
          lineTo: jest.fn().mockReturnThis(),
          addRect: jest.fn().mockReturnThis(),
        })),
      },
      ParagraphBuilder: {
        Make: jest.fn(() => ({
          pushStyle: jest.fn().mockReturnThis(),
          addText: jest.fn().mockReturnThis(),
          pop: jest.fn().mockReturnThis(),
          build: jest.fn(() => ({
            layout: jest.fn(),
          })),
        })),
      },
      Paragraph: {}, // 必要に応じてモックを拡張
    },
    // コンポーネントをモック
    Canvas: createSkiaMockComponent('Canvas'),
    Group: createSkiaMockComponent('Group'),
    Rect: createSkiaMockComponent('Rect'),
    Path: createSkiaMockComponent('Path'),
    Circle: createSkiaMockComponent('Circle'),
    Image: createSkiaMockComponent('Image'),
    ImageSVG: createSkiaMockComponent('ImageSVG'),
    Paragraph: createSkiaMockComponent('Paragraph'),
    DashPathEffect: createSkiaMockComponent('DashPathEffect'),
    // フックをモック
    useImage: jest.fn(() => null), // デフォルトはnullを返す
    useSVG: jest.fn(() => null), // デフォルトはnullを返す
    useVideo: jest.fn(() => ({
      currentFrame: null,
      seek: { value: 0 },
      paused: { value: false },
      looping: { value: false },
    })),
    useDerivedValue: jest.fn((fn) => ({
      value: fn(),
    })),
    useSharedValue: jest.fn((initialValue) => ({
      value: initialValue,
    })),
    runOnJS: jest.fn((fn) => fn),
    configureReanimatedLogger: jest.fn(),
  };
});

// react-native-fs モック
jest.mock('react-native-fs', () => ({
  exists: jest.fn(() => Promise.resolve(true)),
  readFile: jest.fn(() => Promise.resolve('')),
  DocumentDirectoryPath: '/mock/document/directory',
  // 他の必要なメソッドもここに追加
}));

// react-native-localize モック
jest.mock('react-native-localize', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', countryCode: 'US' }]),
  getNumberFormatSettings: jest.fn(() => ({
    decimalSeparator: '.',
    groupingSeparator: ',',
  })),
  getCalendar: jest.fn(() => 'gregorian'),
  getCountry: jest.fn(() => 'US'),
  getCurrencies: jest.fn(() => ['USD']),
  getTemperatureUnit: jest.fn(() => 'celsius'),
  getTimeZone: jest.fn(() => 'America/Los_Angeles'),
  uses24HourClock: jest.fn(() => true),
  usesMetricSystem: jest.fn(() => true),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// react-native-video モック (Skia内のuseVideoとは別に、もし通常のVideoコンポーネントを使用する場合)
jest.mock('react-native-video', () => 'Video');

// react-native-vector-icons をモック
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
jest.mock('react-native-vector-icons/Entypo', () => 'Icon');
jest.mock('react-native-vector-icons/Feather', () => 'Icon');
jest.mock('react-native-vector-icons/EvilIcons', () => 'Icon');
jest.mock('react-native-vector-icons/AntDesign', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome5', () => 'Icon');
jest.mock('react-native-vector-icons/SimpleLineIcons', () => 'Icon');
jest.mock('react-native-vector-icons/Octicons', () => 'Icon');
jest.mock('react-native-vector-icons/Zocial', () => 'Icon');
jest.mock('react-native-vector-icons/Fontisto', () => 'Icon');

// link-preview-js モック
jest.mock('link-preview-js', () => ({
  getLinkPreview: jest.fn(() => Promise.resolve({
    url: 'mock-url',
    title: 'Mock Title',
    description: 'Mock Description',
    images: [],
    videos: [],
    contentType: 'text/html',
    favicons: [],
  })),
}));

// i18next モック
jest.mock('i18next', () => {
  const i18nextMock = {
    use: jest.fn().mockReturnThis(), // useメソッドがi18nextMock自身を返すように修正
    init: jest.fn(),
    t: jest.fn((key) => key), // t関数がキーをそのまま返すようにモック
  };
  return i18nextMock;
});

// react-i18next モック
jest.mock('react-i18next', () => ({
  useTranslation: () => {
    return {
      t: (key) => key,
      i18n: {
        changeLanguage: () => new Promise(() => {},),
      },
    };
  },
  initReactI18next: 'initReactI18next',
}));

// react-native-color-palette をモック
jest.mock('react-native-color-palette', () => 'ColorPalette');

// react-native-safe-area-context をモック
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// react-native-paper をモック
jest.mock('react-native-paper', () => {
  const OriginalPaper = jest.requireActual('react-native-paper');
  const { DefaultTheme } = OriginalPaper;

  return {
    ...OriginalPaper,
    Text: 'Text',
    Provider: ({ children }) => children,
    Button: 'Button',
    Modal: 'Modal',
    Portal: ({ children }) => children,
    Dialog: {
      ...OriginalPaper.Dialog,
      actions: ({ children }) => children,
      Content: ({ children }) => children,
    },
    PaperProvider: ({ children }) => children,
    // DefaultThemeをモックに追加
    DefaultTheme: {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: '#7C4DFF', // プロジェクトのOriginalThemeに合わせて適当な値を設定
        accent: '#03DAC4',
        // 他のカラープロパティも必要に応じて追加
      },
    },
    // OriginalThemeを直接参照している箇所があるため、こちらもモック
    // このモックの名前は、OriginalTheme.jsでインポートされている方法に合わせる必要があります
    OriginalTheme: { // このモックの名前は、OriginalTheme.jsでインポートされている方法に合わせる必要があります
      colors: {
        primary: '#7C4DFF',
        secondary: '#33334D',
        tertiary: '#00DDC6ff',
        background: '#fff',
        // 他の必要な色
      }
    }
  };
});

// react-native-sqlite-storage をモック
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(() => ({
    transaction: jest.fn((callback) => callback({
      executeSql: jest.fn((sql, params, success, error) => success()),
    })),
  })),
}));

// react-native-image-picker をモック
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn((options, callback) => callback({
    didCancel: false,
    assets: [{ uri: 'mock-image-uri', type: 'image/jpeg', fileName: 'mock.jpg' }],
  })),
  launchCamera: jest.fn((options, callback) => callback({
    didCancel: false,
    assets: [{ uri: 'mock-image-uri', type: 'image/jpeg', fileName: 'mock.jpg' }],
  })),
}));

// @react-native-documents/picker をモック
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(() => Promise.resolve([{
    uri: 'mock-document-uri',
    name: 'mock.pdf',
    fileCopyUri: 'mock-document-filecopy-uri',
    type: 'application/pdf',
    size: 1024,
  }])),
  types: {
    allFiles: 'allFiles',
    images: 'images',
    pdf: 'pdf',
  },
}));

// react-native-share をモック
jest.mock('react-native-share', () => ({
  default: {
    open: jest.fn(() => Promise.resolve()),
    shareSingle: jest.fn(() => Promise.resolve()),
  },
}));

// react-native-zip-archive をモック
jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(() => Promise.resolve('mock-zip-path')),
  unzip: jest.fn(() => Promise.resolve('mock-unzip-path')),
}));

// uuid をモック
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
}));

// React Navigation関連のモック (必要であれば追加)
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      dispatch: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

// react-native-file-viewer をモック
jest.mock('react-native-file-viewer', () => ({
  open: jest.fn(() => Promise.resolve()),
}));