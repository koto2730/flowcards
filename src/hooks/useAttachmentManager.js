import { useState } from 'react';
import { Platform, Keyboard, Alert, Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { pick, types, isCancel } from '@react-native-documents/picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { getLinkPreview } from 'link-preview-js';
import FileViewer from 'react-native-file-viewer';
import { useTranslation } from 'react-i18next';
import {
  ATTACHMENT_BASE_PATH,
  ATTACHMENT_DIR,
  ATTACHMENT_DIR_NAME,
} from '../constants/fileSystem';
import { mimeTypeLookup } from '../utils/mimeUtils';

export const useAttachmentManager = () => {
  const { t } = useTranslation();
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');

  const processAttachment = async (
    originalUri,
    fileName,
    fileType,
    node,
    setNode,
  ) => {
    if (fileType === 'application/octet-stream' && fileName) {
      const extension = fileName.split('.').pop().toLowerCase();
      if (extension) {
        const inferredType = mimeTypeLookup[extension];
        if (inferredType) {
          fileType = inferredType;
        }
      }
    }

    const uniqueFileName = `${Date.now()}-${fileName}`;
    const absoluteStoredPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;
    const relativeStoredPath = `${ATTACHMENT_DIR_NAME}/${uniqueFileName}`;

    if (Platform.OS === 'ios') {
      const sourcePath = decodeURIComponent(
        originalUri.replace(/^file:\/\//, ''),
      );
      await RNFS.copyFile(sourcePath, absoluteStoredPath);
    } else {
      await RNFS.copyFile(originalUri, absoluteStoredPath);
    }

    let relativeThumbnailPath = null;
    if (fileType.startsWith('image/') || fileType.startsWith('video/')) {
      relativeThumbnailPath = relativeStoredPath;
    }

    const newAttachment = {
      node_id: node.id,
      filename: fileName,
      mime_type: fileType,
      original_uri: originalUri,
      stored_path: relativeStoredPath,
      thumbnail_path: relativeThumbnailPath,
    };

    const newNode = { ...node, attachment: newAttachment };
    setNode(newNode);
  };

  const handleAttachFile = async (node, setNode) => {
    Keyboard.dismiss();

    try {
      const result = await pick({
        type: [
          types.images,
          types.audio,
          types.pdf,
          types.doc,
          types.docx,
          types.xls,
          types.xlsx,
          types.ppt,
          types.pptx,
          types.plainText,
        ],
        allowMultiSelection: false,
      });

      if (result && result.length > 0) {
        const res = result[0];
        await processAttachment(res.uri, res.name, res.type, node, setNode);
      }
    } catch (err) {
      if (isCancel(err)) {
        // User cancelled the picker
      } else {
        console.error('Error picking or copying file', err);
      }
    }
  };

  const handleAttachImageFromLibrary = async (node, setNode) => {
    Keyboard.dismiss();
    const result = await launchImageLibrary({
      mediaType: 'mixed',
      quality: 1,
    });

    if (result.didCancel || result.errorCode) {
      console.log('Image picker cancelled or failed', result.errorMessage);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      await processAttachment(
        asset.uri,
        asset.fileName,
        asset.type,
        node,
        setNode,
      );
    }
  };

  const handleUrlInputChange = text => {
    let processedText = text;
    if (processedText.startsWith('https://')) {
      processedText = processedText.substring('https://'.length);
    } else if (processedText.startsWith('http://')) {
      processedText = processedText.substring('http://'.length);
    }
    setAttachmentUrl(processedText);
  };

  const handleSaveUrlAttachment = async (node, setNode) => {
    if (!attachmentUrl) {
      Alert.alert(t('invalidUrl'), t('invalidUrlMessage'));
      return;
    }

    const fullUrl = `https://` + attachmentUrl;

    try {
      const previewData = await getLinkPreview(fullUrl, { fetch });
      let relative_thumbnail_path = null;
      let preview_image_url = null;

      if (previewData.images && previewData.images.length > 0) {
        const imageUrl = previewData.images[0];
        preview_image_url = imageUrl;
        const fileExtension = (imageUrl.split('.').pop() || 'jpg').split(
          '?',
        )[0];
        const uniqueFileName = `${Date.now()}.${fileExtension}`;
        const absoluteLocalPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;
        relative_thumbnail_path = `${ATTACHMENT_DIR_NAME}/${uniqueFileName}`;

        const download = RNFS.downloadFile({
          fromUrl: imageUrl,
          toFile: absoluteLocalPath,
        });

        await download.promise;
      }

      const newAttachment = {
        node_id: node.id,
        filename: previewData.title || fullUrl,
        mime_type: 'text/url',
        original_uri: fullUrl,
        stored_path: null,
        thumbnail_path: relative_thumbnail_path,
        preview_title: previewData.title,
        preview_description: previewData.description,
        preview_image_url: preview_image_url,
      };

      setNode(prev => ({ ...prev, attachment: newAttachment }));
      setUrlInputVisible(false);
      setAttachmentUrl('');
    } catch (error) {
      console.error('Failed to get link preview:', error);
      Alert.alert(t('previewError'), t('previewErrorMessage'));
    }
  };

  const handleOpenAttachment = node => {
    if (!node?.attachment) return;

    const { mime_type, stored_path, original_uri } = node.attachment;

    if (mime_type === 'text/url' && original_uri) {
      Linking.openURL(original_uri).catch(err => {
        console.error('Failed to open URL', err);
        Alert.alert('Error', 'Could not open the URL.');
      });
    } else if (stored_path) {
      const absolutePath = `${ATTACHMENT_BASE_PATH}/${stored_path}`;
      FileViewer.open(absolutePath, {
        showOpenWithDialog: true,
        showAppsSuggestions: true,
      })
        .then(() => {
          // success
        })
        .catch(err => {
          console.error('Failed to open attachment', err);
          Alert.alert(
            'Error',
            'Could not open the attachment. The file might be corrupted or the format is not supported.',
          );
        });
    }
  };

  const handleRemoveAttachment = async (node, setNode) => {
    if (!node?.attachment) return;

    const { stored_path, thumbnail_path } = node.attachment;

    try {
      if (stored_path) {
        const absolutePath = `${ATTACHMENT_BASE_PATH}/${stored_path}`;
        const fileExists = await RNFS.exists(absolutePath);
        if (fileExists) {
          await RNFS.unlink(absolutePath);
        }
      }
      if (thumbnail_path) {
        const absoluteThumbPath = `${ATTACHMENT_BASE_PATH}/${thumbnail_path}`;
        const thumbExists = await RNFS.exists(absoluteThumbPath);
        if (thumbExists) {
          await RNFS.unlink(absoluteThumbPath);
        }
      }

      setNode(prev => ({
        ...prev,
        attachment: null,
        attachment_deleted: true,
        deleted_attachment_id: prev.attachment.id,
      }));
    } catch (err) {
      console.error('Error removing attachment files', err);
    }
  };

  const resolveAttachmentPath = relativePath => {
    if (!relativePath) {
      return null;
    }
    if (
      relativePath.startsWith('/') ||
      relativePath.startsWith('http') ||
      relativePath.startsWith('file:')
    ) {
      return relativePath;
    }
    return `${ATTACHMENT_BASE_PATH}/${relativePath}`;
  };

  return {
    urlInputVisible,
    setUrlInputVisible,
    attachmentUrl,
    setAttachmentUrl,
    handleAttachFile,
    handleAttachImageFromLibrary,
    handleUrlInputChange,
    handleSaveUrlAttachment,
    handleOpenAttachment,
    handleRemoveAttachment,
    resolveAttachmentPath,
  };
};
