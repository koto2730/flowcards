import React from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Modal, Portal, Text, Button } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import OriginalTheme from '../screens/OriginalTheme';

const UrlInputModal = ({
  visible,
  onClose,
  attachmentUrl,
  onUrlChange,
  onSave,
}) => {
  const { t } = useTranslation();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.urlInputContainer}
        testID="url-input-modal" // ここを追加
      >
        <View style={styles.urlInputWrapper}>
          <Text style={styles.urlInputLabel}>https://</Text>
          <TextInput
            value={attachmentUrl}
            onChangeText={onUrlChange}
            style={styles.urlInputField}
            placeholder="example.com"
            autoCapitalize="none"
            keyboardType="url"
            autoFocus
          />
        </View>
        <View style={styles.buttonContainer}>
          <Button onPress={onSave}>{t('save')}</Button>
          <Button onPress={onClose} textColor={OriginalTheme.colors.secondary}>
            {t('cancel')}
          </Button>
        </View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  urlInputContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignSelf: 'center',
  },
  urlInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    marginBottom: 10,
  },
  urlInputLabel: {
    paddingHorizontal: 8,
    color: '#555',
  },
  urlInputField: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
});

export default UrlInputModal;