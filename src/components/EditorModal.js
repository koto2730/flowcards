import React from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  TouchableOpacity,
  Image,
  Platform,
  Keyboard,
} from 'react-native';
import {
  Divider,
  Card,
  Title,
  Button,
  Icon,
  Text,
  SegmentedButtons,
} from 'react-native-paper';
import Video from 'react-native-video';
import { useTranslation } from 'react-i18next';
import OriginalTheme from '../screens/OriginalTheme';
import { getTextColorForBackground } from '../utils/colorUtils';

const EditorModal = ({
  visible,
  node,
  onClose,
  onSave,
  onNodeChange,
  setColorPickerVisible,
  setUrlInputVisible,
  handleAttachFile,
  handleAttachImageFromLibrary,
  handleOpenAttachment,
  handleRemoveAttachment,
  resolveAttachmentPath,
}) => {
  const { t } = useTranslation();

  if (!visible || !node) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.editingOverlay}
    >
      <Card style={styles.editingContainer}>
        <Card.Content>
          <TextInput
            value={node.title}
            onChangeText={text => onNodeChange({ ...node, title: text })}
            style={styles.input}
            placeholder={t('title')}
            autoFocus
            maxLength={16}
          />
          <TextInput
            value={node.description}
            onChangeText={text => onNodeChange({ ...node, description: text })}
            style={styles.input}
            placeholder={t('description')}
            multiline
            maxLength={100}
            editable={node.size !== 'small'}
          />
          <SegmentedButtons
            value={node.size}
            onValueChange={value => {
              Keyboard.dismiss();
              onNodeChange({ ...node, size: value });
            }}
            buttons={[
              { value: 'small', label: t('sizeSmall') },
              { value: 'medium', label: t('sizeMedium') },
              { value: 'large', label: t('sizeLarge') },
            ]}
            style={styles.sizeSelectionContainer}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: node.color }]}
            onPress={() => {
              Keyboard.dismiss();
              setColorPickerVisible(true);
            }}
          >
            <Text
              style={[
                styles.colorButtonText,
                { color: getTextColorForBackground(node.color) },
              ]}
            >
              {t('selectColor')}
            </Text>
          </TouchableOpacity>

          <Divider style={{ marginVertical: 10 }} />

          {node.attachment ? (
            <View style={styles.attachmentContainer}>
              {node.attachment.mime_type === 'text/url' ? (
                node.attachment.thumbnail_path ? (
                  <Image
                    key={node.attachment.thumbnail_path}
                    source={{
                      uri: `file://${resolveAttachmentPath(
                        node.attachment.thumbnail_path,
                      )}`,
                    }}
                    style={styles.thumbnail}
                  />
                ) : (
                  <Icon source="link-variant" size={80} />
                )
              ) : node.attachment.mime_type.startsWith('video/') ? (
                <Video
                  source={{
                    uri: `file://${resolveAttachmentPath(
                      node.attachment.stored_path,
                    )}`,
                  }}
                  style={styles.thumbnail}
                  controls={false}
                  repeat={false}
                />
              ) : node.attachment.thumbnail_path ||
                (node.attachment.mime_type &&
                  node.attachment.mime_type.startsWith('image/')) ? (
                <Image
                  key={
                    node.attachment.thumbnail_path ||
                    node.attachment.stored_path
                  }
                  source={{
                    uri: `file://${resolveAttachmentPath(
                      node.attachment.thumbnail_path ||
                        node.attachment.stored_path,
                    )}`,
                  }}
                  style={styles.thumbnail}
                />
              ) : (
                <Icon source="file-document-outline" size={80} />
              )}
              <Text style={styles.attachmentText} numberOfLines={1}>
                {node.attachment.filename}
              </Text>
              <View style={styles.attachmentButtons}>
                <Button onPress={() => handleOpenAttachment(node)}>
                  {t('open')}
                </Button>
                <Button
                  onPress={() => handleRemoveAttachment(node)}
                  textColor={OriginalTheme.colors.error}
                >
                  {t('remove')}
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.attachmentSection}>
              <Title style={styles.attachmentTitle}>{t('attach')}</Title>
              <View style={styles.attachButtonsContainer}>
                <Button
                  icon="file-document-outline"
                  mode="outlined"
                  onPress={() => handleAttachFile(node)}
                  style={styles.attachButton}
                >
                  {t('file')}
                </Button>
                <Button
                  icon="image-multiple"
                  mode="outlined"
                  onPress={() => handleAttachImageFromLibrary(node)}
                  style={styles.attachButton}
                >
                  {t('photo')}
                </Button>
                <Button
                  icon="web"
                  mode="outlined"
                  onPress={() => {
                    Keyboard.dismiss();
                    setUrlInputVisible(true);
                  }}
                  style={styles.attachButton}
                >
                  {t('url')}
                </Button>
              </View>
            </View>
          )}
        </Card.Content>
        <Card.Actions style={styles.buttonContainer}>
          <Button onPress={() => onSave(node)}>{t('save')}</Button>
          <Button mode="outlined" onPress={onClose} textColor={'#555'}>
            {t('cancel')}
          </Button>
        </Card.Actions>
      </Card>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  editingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editingContainer: {
    width: '90%',
    padding: 8,
  },
  input: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  sizeSelectionContainer: {
    marginBottom: 10,
  },
  colorButton: {
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  colorButtonText: {
    fontWeight: 'bold',
  },
  attachmentContainer: {
    alignItems: 'center',
  },
  attachmentText: {
    marginTop: 8,
    marginBottom: 10,
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '60%',
  },
  attachmentSection: {
    alignItems: 'center',
    marginVertical: 10,
  },
  attachmentTitle: {
    fontSize: 16,
    marginBottom: 10,
  },
  attachButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    flexWrap: 'wrap',
  },
  attachButton: {
    width: '45%',
    marginBottom: 10,
  },
  thumbnail: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    marginBottom: 10,
    borderRadius: 5,
  },
});

export default EditorModal;