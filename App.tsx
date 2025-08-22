import React, { useEffect, useState } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text } from 'react-native';
import FlowListScreen from './src/screens/FlowListScreen';
import FlowEditorScreen from './src/screens/FlowEditorScreen';
import { initDB } from './src/db';

// i18n関連のインポート
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import * as RNLocalize from 'react-native-localize';
import { resources } from './src/screens/i18nResources';

const Stack = createStackNavigator();

// i18n初期化
const languageDetector = {
  type: 'languageDetector',
  async: true,
  detect: (callback: (lang: string) => void) => {
    const locales = RNLocalize.getLocales();
    if (Array.isArray(locales)) {
      const langCode = locales[0].languageCode;
      if (['ja', 'zh'].includes(langCode)) {
        callback(langCode);
        return;
      }
    }
    callback('en');
  },
  init: () => {},
  cacheUserLanguage: () => {},
};

i18n
  .use(languageDetector as any)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    compatibilityJSON: 'v3',
    interpolation: {
      escapeValue: false,
    },
  });

function App() {
  const [dbReady, setDbReady] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    initDB()
      .then(() => setDbReady(true))
      .catch(err => {
        console.error('DB initialization failed:', err);
      });
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>{t('loading') || 'Loading...'}</Text>
      </View>
    );
  }

  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="FlowList">
          <Stack.Screen
            name="FlowList"
            component={FlowListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="FlowEditor"
            component={FlowEditorScreen}
            options={({ route }) => ({
              title: route.params?.flowName
                ? route.params.flowName
                : t('flowEditor') || 'Flow Editor',
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

export default App;
