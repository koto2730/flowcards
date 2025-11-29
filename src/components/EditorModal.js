import React, { useCallback } from 'react';
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
import { useFlowContext } from '../contexts/FlowContext';

const EditorModal = ({
  setColorPickerVisible,
  setUrlInputVisible,
  handleAttachFile,
  handleAttachImageFromLibrary,
  handleOpenAttachment,
  handleRemoveAttachment,
  resolveAttachmentPath,
}) => {
  const { t } = useTranslation();
  const { editingNode, closeEditor, saveEditor, dispatch } = useFlowContext();

  const handleNodeChange = useCallback(
    (key, value) => {
      dispatch({
        type: 'UPDATE_EDITING_NODE',
        payload: { ...editingNode, [key]: value },
      });
    },
    [dispatch, editingNode],
  );

  if (!editingNode) {
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
            value={editingNode.data.label}
            onChangeText={text => handleNodeChange('title', text)}
            style={styles.input}
            placeholder={t('title')}
            autoFocus
            maxLength={16}
          />
          <TextInput
            value={editingNode.data.description}
            onChangeText={text => handleNodeChange('description', text)}
            style={styles.input}
            placeholder={t('description')}
            multiline
            maxLength={100}
            editable={editingNode.data.size !== 'small'}
          />
          <SegmentedButtons
            value={editingNode.data.size}
            onValueChange={value => {
              Keyboard.dismiss();
              handleNodeChange('size', value);
            }}
            buttons={[
              { value: 'small', label: t('sizeSmall') },
              { value: 'medium', label: t('sizeMedium') },
              { value: 'large', label: t('sizeLarge') },
            ]}
            style={styles.sizeSelectionContainer}
          />
          <TouchableOpacity
            style={[styles.colorButton, { backgroundColor: editingNode.color }]}
            onPress={() => {
              Keyboard.dismiss();
              setColorPickerVisible(true);
            }}
          >
            <Text
              style={[
                styles.colorButtonText,
                { color: getTextColorForBackground(editingNode.color) },
              ]}
            >
              {t('selectColor')}
            </Text>
          </TouchableOpacity>

          <Divider style={{ marginVertical: 10 }} />

          {editingNode.attachment ? (
            <View style={styles.attachmentContainer}>
              {editingNode.attachment.mime_type === 'text/url' ? (
                editingNode.attachment.thumbnail_path ? (
                  <Image
                    key={editingNode.attachment.thumbnail_path}
                    source={{
                      uri: `file://${resolveAttachmentPath(
                        editingNode.attachment.thumbnail_path,
                      )}`,
                    }}
                    style={styles.thumbnail}
                  />
                ) : (
                  <Icon source="link-variant" size={80} />
                )
              ) : editingNode.attachment.mime_type.startsWith('video/') ? (
                <Video
                  source={{
                    uri: `file://${resolveAttachmentPath(
                      editingNode.attachment.stored_path,
                    )}`,
                  }}
                  style={styles.thumbnail}
                  controls={false}
                  repeat={false}
                />
              ) : editingNode.attachment.thumbnail_path ||
                (editingNode.attachment.mime_type &&
                  editingNode.attachment.mime_type.startsWith('image/')) ? (
                <Image
                  key={
                    editingNode.attachment.thumbnail_path ||
                    editingNode.attachment.stored_path
                  }
                  source={{
                    uri: `file://${resolveAttachmentPath(
                      editingNode.attachment.thumbnail_path ||
                        editingNode.attachment.stored_path,
                    )}`,
                  }}
                  style={styles.thumbnail}
                />
              ) : (
                <Icon source="file-document-outline" size={80} />
              )}
              <Text style={styles.attachmentText} numberOfLines={1}>
                {editingNode.attachment.filename}
              </Text>
              <View style={styles.attachmentButtons}>
                <Button onPress={() => handleOpenAttachment(editingNode)}>
                  {t('open')}
                </Button>
                <Button
                  onPress={() => handleRemoveAttachment(editingNode)}
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
                  onPress={() => handleAttachFile(editingNode)}
                  style={styles.attachButton}
                >
                  {t('file')}
                </Button>
                <Button
                  icon="image-multiple"
                  mode="outlined"
                  onPress={() => handleAttachImageFromLibrary(editingNode)}
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
          <Button onPress={saveEditor}>{t('save')}</Button>
          <Button mode="outlined" onPress={closeEditor} textColor={'#555'}>
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
