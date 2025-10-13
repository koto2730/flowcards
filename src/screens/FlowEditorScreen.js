import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TextInput,
  PermissionsAndroid,
  Alert,
  KeyboardAvoidingView,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Path, Group, useFonts } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  updateFlow,
  getFlows,
  getAttachmentByNodeId,
  insertAttachment,
  deleteAttachment,
} from '../db';
import { pick, types, isCancel } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { createThumbnail } from 'react-native-create-thumbnail';
import { Linking } from 'react-native';
import {
  Divider,
  FAB,
  Provider as PaperProvider,
  SegmentedButtons,
  Icon,
  Card,
  Title,
  Button,
  Modal,
  Portal,
  Text,
} from 'react-native-paper';
import OriginalTheme from './OriginalTheme';
import SkiaCard from '../components/Card';
import {
  getCenter,
  getHandlePosition,
  CalcSkiaEdgeStroke,
  CalcSkiaInteractionEdgeStroke,
  isPointInCard,
  isPointInDeleteButton,
} from '../utils/flowUtils';
import { useFlowData } from '../hooks/useFlowData';
import ColorPalette from 'react-native-color-palette';
import { useTranslation } from 'react-i18next';
import { getLinkPreview } from 'link-preview-js';
import FileViewer from 'react-native-file-viewer';

const { width, height } = Dimensions.get('window');
const ATTACHMENT_DIR = `${RNFS.ExternalDirectoryPath}/attachments`;

const mimeTypeLookup = {
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  json: 'application/json',
};

const getTextColorForBackground = hexColor => {
  if (!hexColor) return 'black';
  const color = hexColor.startsWith('#') ? hexColor.substring(1) : hexColor;
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 186 ? 'black' : 'white';
};

const requestStoragePermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    let permissionsToRequest;
    if (Platform.Version >= 33) {
      permissionsToRequest = [
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      ];
    } else {
      permissionsToRequest = [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ];
    }

    const statuses = await PermissionsAndroid.requestMultiple(
      permissionsToRequest,
    );

    const allGranted = Object.values(statuses).every(
      status => status === PermissionsAndroid.RESULTS.GRANTED,
    );

    if (allGranted) {
      return true;
    } else {
      Alert.alert(
        'Permission Denied',
        'Storage permission is required to attach files.',
      );
      return false;
    }
  } catch (err) {
    console.warn(err);
    return false;
  }
};

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  const { t } = useTranslation();
  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const {
    allNodes,
    setAllNodes,
    edges,
    displayNodes,
    handleUpdateNodeData,
    handleUpdateNodePosition,
    addNode,
    handleDeleteNode,
    handleDoubleClick,
    handleSectionUp,
    linkingState,
    toggleLinkingMode,
    handleCardTap,
    handleDeleteEdge,
  } = useFlowData(flowId, isSeeThrough, t);

  const [editingNode, setEditingNode] = useState(null);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [showAttachmentsOnCanvas, setShowAttachmentsOnCanvas] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const context = useSharedValue({ x: 0, y: 0 });
  const origin_x = useSharedValue(0);
  const origin_y = useSharedValue(0);

  const activeNodeId = useSharedValue(null);
  const dragStartOffset = useSharedValue({ x: 0, y: 0 });
  const nodePosition = useSharedValue({ x: 0, y: 0 });

  const fontMgr = useFonts({
    NotoSansJP: [
      require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Regular.ttf'),
      require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Bold.ttf'),
    ],
    NotoSansSC: [
      require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf'),
      require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Bold.ttf'),
    ],
  });

  useEffect(() => {
    const ensureDirExists = async () => {
      await RNFS.mkdir(ATTACHMENT_DIR);
    };
    ensureDirExists();
  }, []);

  useEffect(() => {
    const loadPosition = async () => {
      try {
        const flows = await getFlows();
        const currentFlow = flows.find(f => f.id === flowId);
        if (currentFlow && currentFlow.lastPosition) {
          const position = JSON.parse(currentFlow.lastPosition);
          translateX.value = position.x;
          translateY.value = position.y;
          savedTranslateX.value = position.x;
          savedTranslateY.value = position.y;
        }
      } catch (error) {
        console.error('Failed to load last position:', error);
      }
    };
    loadPosition();
  }, [flowId, translateX, translateY, savedTranslateX, savedTranslateY]);

  useEffect(() => {
    return () => {
      const savePosition = async () => {
        try {
          const position = {
            x: translateX.value,
            y: translateY.value,
          };
          await updateFlow(flowId, { lastPosition: JSON.stringify(position) });
        } catch (error) {
          console.error('Failed to save last position:', error);
        }
      };
      savePosition();
    };
  }, [flowId, translateX, translateY]);

  useEffect(() => {
    navigation.setOptions({
      title: flowName || 'Flow',
      headerStyle: { backgroundColor: OriginalTheme.colors.primary },
      headerTintColor: '#fff',
    });
  }, [navigation, flowName]);

  const [pendingEvent, setPendingEvent] = useState(null);

  useEffect(() => {
    if (!pendingEvent) return;

    const { type, nodeId, extra } = pendingEvent;

    const run = async () => {
      if (type === 'tap') {
        await handleCardTap(nodeId);
      } else if (type === 'doubleTap') {
        handleDoubleClick(nodeId);
      } else if (type === 'dragEnd') {
        await handleUpdateNodePosition(nodeId, extra?.newPosition);
      } else if (type === 'delete') {
        await handleDeleteNode(nodeId);
      } else if (type === 'edgeTap') {
        await handleDeleteEdge(nodeId);
      }
    };

    run();
    setPendingEvent(null);
  }, [
    pendingEvent,
    handleCardTap,
    handleDoubleClick,
    handleUpdateNodePosition,
    handleDeleteNode,
    handleDeleteEdge,
  ]);

  const panGesture = Gesture.Pan()
    .onStart(event => {
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;
      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode && !isSeeThrough) {
        activeNodeId.value = hitNode.id;
        dragStartOffset.value = {
          x: worldX - hitNode.position.x,
          y: worldY - hitNode.position.y,
        };
        nodePosition.value = hitNode.position;
      } else {
        activeNodeId.value = null;
      }
    })
    .onUpdate(event => {
      if (event.numberOfPointers > 1) {
        return;
      }
      if (activeNodeId.value) {
        const worldX = (event.x - translateX.value) / scale.value;
        const worldY = (event.y - translateY.value) / scale.value;
        const newPosition = {
          x: worldX - dragStartOffset.value.x,
          y: worldY - dragStartOffset.value.y,
        };
        nodePosition.value = newPosition;
        const newAllNodes = allNodes.map(n =>
          n.id === activeNodeId.value ? { ...n, position: newPosition } : n,
        );
        runOnJS(setAllNodes)(newAllNodes);
      } else {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      }
    })
    .onEnd(() => {
      if (activeNodeId.value) {
        runOnJS(setPendingEvent)({
          type: 'dragEnd',
          nodeId: activeNodeId.value,
          extra: { newPosition: nodePosition.value },
        });
        activeNodeId.value = null;
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    })
    .enabled(!linkingState.active);

  const pinchGesture = Gesture.Pinch()
    .onStart(event => {
      savedScale.value = scale.value;
      context.value = { focalX: event.focalX, focalY: event.focalY };
      origin_x.value = (event.focalX - translateX.value) / scale.value;
      origin_y.value = (event.focalY - translateY.value) / scale.value;
    })
    .onUpdate(event => {
      const newScale = savedScale.value * event.scale;
      if (newScale < 0.1) {
        return;
      }
      scale.value = newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .enabled(!linkingState.active);

  const checkForEdgeTap = point => {
    'worklet';
    const TAP_THRESHOLD = 15;

    const displayNodeIds = new Set(displayNodes.map(n => n.id));
    const relevantEdges = edges.filter(
      edge =>
        displayNodeIds.has(edge.source) && displayNodeIds.has(edge.target),
    );

    for (const edge of relevantEdges) {
      const sourceNode = displayNodes.find(n => n.id === edge.source);
      const targetNode = displayNodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) continue;

      const p1 = getHandlePosition(sourceNode, edge.sourceHandle);
      const p2 = getHandlePosition(targetNode, edge.targetHandle);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const l2 = dx * dx + dy * dy;

      if (l2 === 0) {
        const dist = Math.sqrt(
          Math.pow(point.x - p1.x, 2) + Math.pow(point.y - p1.y, 2),
        );
        if (dist < TAP_THRESHOLD) {
          return edge.id;
        }
      } else {
        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const closestPoint = {
          x: p1.x + t * dx,
          y: p1.y + t * dy,
        };
        const dist = Math.sqrt(
          Math.pow(point.x - closestPoint.x, 2) +
            Math.pow(point.y - closestPoint.y, 2),
        );
        if (dist < TAP_THRESHOLD) {
          return edge.id;
        }
      }
    }
  };

  const tapGesture = Gesture.Tap().onEnd((event, success) => {
    if (isSeeThrough) return;
    if (success) {
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;

      const nodeToDelete = [...displayNodes]
        .reverse()
        .find(node => isPointInDeleteButton(node, worldX, worldY));
      if (nodeToDelete) {
        runOnJS(setPendingEvent)({
          type: 'delete',
          nodeId: nodeToDelete.id,
        });
        return;
      }

      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode) {
        runOnJS(setPendingEvent)({
          type: 'tap',
          nodeId: hitNode.id,
        });
      } else {
        if (linkingState.active) {
          const edgeId = checkForEdgeTap({ x: worldX, y: worldY });
          if (edgeId) {
            runOnJS(setPendingEvent)({
              type: 'edgeTap',
              nodeId: edgeId,
            });
          }
        }
      }
    }
  });

  const handleNodeLongPress = async hitNode => {
    try {
      const attachment = await getAttachmentByNodeId(hitNode.id);
      setEditingNode({
        id: hitNode.id,
        title: hitNode.data.label,
        description: hitNode.data.description,
        size: hitNode.data.size || 'medium',
        color: hitNode.data.color || '#FFFFFF',
        attachment: attachment,
      });
    } catch (e) {
      console.error('Failed to fetch attachment', e);
      setEditingNode({
        id: hitNode.id,
        title: hitNode.data.label,
        description: hitNode.data.description,
        size: hitNode.data.size || 'medium',
        color: hitNode.data.color || '#FFFFFF',
        attachment: null,
      });
    }
  };

  const longPressGesture = Gesture.LongPress()
    .minDuration(800)
    .onStart(event => {
      if (isSeeThrough || linkingState.active) return;
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;
      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode) {
        runOnJS(handleNodeLongPress)(hitNode);
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (isSeeThrough || linkingState.active) return;
      if (success) {
        const worldX = (event.x - translateX.value) / scale.value;
        const worldY = (event.y - translateY.value) / scale.value;
        if (!Array.isArray(displayNodes)) return;
        const hitNode = [...displayNodes]
          .reverse()
          .find(node => isPointInCard(node, worldX, worldY));
        if (hitNode) {
          runOnJS(setPendingEvent)({
            type: 'doubleTap',
            nodeId: hitNode.id,
          });
        }
      }
    });

  const skiaTransform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  const skiaOrigin = useDerivedValue(() => ({
    x: origin_x.value,
    y: origin_y.value,
  }));

  const composedGesture = Gesture.Exclusive(
    Gesture.Simultaneous(panGesture, pinchGesture),
    doubleTapGesture,
    longPressGesture,
    tapGesture,
  );

  const handleAddNode = () => {
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    addNode(position);
  };

  const handlePressSectionUp = () => {
    const screenCenter = {
      x: (width / 2 - translateX.value) / scale.value,
      y: (height / 2 - translateY.value) / scale.value,
    };
    handleSectionUp(screenCenter);
  };

  const renderEdges = () => {
    const displayNodeIds = new Set(displayNodes.map(n => n.id));
    const relevantEdges = edges.filter(
      edge =>
        displayNodeIds.has(edge.source) && displayNodeIds.has(edge.target),
    );

    return relevantEdges.map(edge => {
      const sourceNode = displayNodes.find(n => n.id === edge.source);
      const targetNode = displayNodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const interactionPath = CalcSkiaInteractionEdgeStroke({
        edge,
        sourceNode,
        targetNode,
      });
      const path = CalcSkiaEdgeStroke({ edge, sourceNode, targetNode });

      return (
        <Group key={edge.id + '_group'}>
          <Path
            path={interactionPath}
            style="stroke"
            strokeWidth={15}
            color="transparent"
          />
          <Path path={path} style="stroke" strokeWidth={2} color="black" />
        </Group>
      );
    });
  };

  const handleAttachFile = async () => {
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) return;

    try {
      const result = await pick({
        type: [types.allFiles],
        allowMultiSelection: false,
      });

      if (result && result.length > 0) {
        const res = result[0];
        const originalUri = res.uri;
        const fileName = res.name;
        let fileType = res.type;

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
        const storedPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;

        if (Platform.OS === 'ios') {
          const sourcePath = decodeURIComponent(
            originalUri.replace(/^file:\/\//, ''),
          );
          await RNFS.copyFile(sourcePath, storedPath);
        } else {
          await RNFS.copyFile(originalUri, storedPath);
        }

        let thumbnailPath = null;
        if (fileType.startsWith('video/')) {
          const thumbnailRes = await createThumbnail({
            url: storedPath,
            timeStamp: 1000, // 1 second
          });
          thumbnailPath = thumbnailRes.path;
        } else if (!fileType.startsWith('image/')) {
          const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-file-icon.svg`;
          await RNFS.copyFileAssets(
            'icons/file-outline.svg',
            iconThumbnailPath,
          );
          thumbnailPath = iconThumbnailPath;
        } else if (!fileType.startsWith('image/')) {
          const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-file-icon.svg`;
          await RNFS.copyFileAssets(
            'icons/file-outline.svg',
            iconThumbnailPath,
          );
          thumbnailPath = iconThumbnailPath;
        } else if (!fileType.startsWith('image/')) {
          const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-file-icon.svg`;
          await RNFS.copyFileAssets(
            'icons/file-outline.svg',
            iconThumbnailPath,
          );
          thumbnailPath = iconThumbnailPath;
        } else if (
          !fileType.startsWith('image/') &&
          !fileType.startsWith('video/')
        ) {
          const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-file-icon.svg`;
          await RNFS.copyFileAssets(
            'icons/file-outline.svg',
            iconThumbnailPath,
          );
          thumbnailPath = iconThumbnailPath;
        }

        const newAttachment = {
          node_id: editingNode.id,
          filename: fileName,
          mime_type: fileType,
          original_uri: originalUri,
          stored_path: storedPath,
          thumbnail_path: thumbnailPath,
        };

        setEditingNode(prev => ({ ...prev, attachment: newAttachment }));
      }
    } catch (err) {
      if (isCancel(err)) {
        // User cancelled the picker
      } else {
        console.error('Error picking or copying file', err);
      }
    }
  };

  const handleSaveUrlAttachment = async () => {
    if (
      !attachmentUrl ||
      (!attachmentUrl.startsWith('http://') &&
        !attachmentUrl.startsWith('https://'))
    ) {
      Alert.alert(t('invalidUrl'), t('invalidUrlMessage'));
      return;
    }

    try {
      const previewData = await getLinkPreview(attachmentUrl);
      let thumbnail_path = null;
      let preview_image_url = null;

      if (previewData.images && previewData.images.length > 0) {
        const imageUrl = previewData.images[0];
        preview_image_url = imageUrl;
        // Basic extension extraction, might not be perfect
        const fileExtension = (imageUrl.split('.').pop() || 'jpg').split(
          '?',
        )[0];
        const localPath = `${ATTACHMENT_DIR}/${Date.now()}.${fileExtension}`;

        const download = RNFS.downloadFile({
          fromUrl: imageUrl,
          toFile: localPath,
        });

        await download.promise;
        thumbnail_path = localPath;
      } else {
        const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-link-icon.svg`;
        await RNFS.copyFileAssets('icons/link-variant.svg', iconThumbnailPath);
        thumbnail_path = iconThumbnailPath;
      }

      const newAttachment = {
        node_id: editingNode.id,
        filename: previewData.title || attachmentUrl,
        mime_type: 'text/url',
        original_uri: attachmentUrl,
        stored_path: null,
        thumbnail_path: thumbnail_path,
        preview_title: previewData.title,
        preview_description: previewData.description,
        preview_image_url: preview_image_url,
      };

      setEditingNode(prev => ({ ...prev, attachment: newAttachment }));
    } catch (error) {
      console.error('Could not get link preview', error);
      const iconThumbnailPath = `${ATTACHMENT_DIR}/${Date.now()}-link-icon.svg`;
      await RNFS.copyFileAssets('icons/link-variant.svg', iconThumbnailPath);
      // Fallback to saving just the URL
      const newAttachment = {
        node_id: editingNode.id,
        filename: attachmentUrl,
        mime_type: 'text/url',
        original_uri: attachmentUrl,
        stored_path: null,
        thumbnail_path: iconThumbnailPath,
      };
      setEditingNode(prev => ({ ...prev, attachment: newAttachment }));
    } finally {
      setUrlInputVisible(false);
      setAttachmentUrl('');
    }
  };

  const handleOpenAttachment = () => {
    if (!editingNode?.attachment) return;

    const { mime_type, stored_path, original_uri } = editingNode.attachment;

    if (mime_type === 'text/url' && original_uri) {
      Linking.openURL(original_uri).catch(err => {
        console.error('Failed to open URL', err);
        Alert.alert('Error', 'Could not open the URL.');
      });
    } else if (stored_path) {
      FileViewer.open(stored_path, { showOpenWithDialog: true })
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

  const handleRemoveAttachment = async () => {
    if (!editingNode?.attachment) return;

    const { stored_path, thumbnail_path } = editingNode.attachment;

    try {
      if (stored_path) {
        const fileExists = await RNFS.exists(stored_path);
        if (fileExists) {
          await RNFS.unlink(stored_path);
        }
      }
      if (thumbnail_path) {
        const thumbExists = await RNFS.exists(thumbnail_path);
        if (thumbExists) {
          await RNFS.unlink(thumbnail_path);
        }
      }

      setEditingNode(prev => ({
        ...prev,
        attachment: null,
        attachment_deleted: true,
        deleted_attachment_id: prev.attachment.id,
      }));
    } catch (err) {
      console.error('Error removing attachment files', err);
    }
  };

  const handleSaveEditingNode = async () => {
    if (!editingNode) return;

    try {
      let finalAttachmentState = editingNode.attachment;

      // Handle attachment changes first
      if (editingNode.attachment_deleted && editingNode.deleted_attachment_id) {
        await deleteAttachment(editingNode.deleted_attachment_id);
        finalAttachmentState = null;
      } else if (editingNode.attachment && !editingNode.attachment.id) {
        // New attachment, insert it
        const result = await insertAttachment(editingNode.attachment);
        finalAttachmentState = {
          ...editingNode.attachment,
          id: result.insertId,
        };
      }

      // Then, update the node data
      const dataToUpdate = {
        title: editingNode.title,
        description: editingNode.description,
        size: editingNode.size,
        color: editingNode.color,
        attachment: finalAttachmentState,
      };
      await handleUpdateNodeData(editingNode.id, dataToUpdate, fontMgr);
    } catch (err) {
      console.error('Failed to save node or attachment', err);
    } finally {
      setEditingNode(null);
    }
  };

  const fabDisabled = isSeeThrough || linkingState.active || !!editingNode;

  const resetScale = () => {
    'worklet';
    scale.value = withTiming(1, { duration: 300 });
    translateX.value = withTiming(0, { duration: 300 });
    translateY.value = withTiming(0, { duration: 300 });
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const moveToNearestCard = () => {
    'worklet';
    if (displayNodes.length === 0) return;

    const screenCenterX = (width / 2 - translateX.value) / scale.value;
    const screenCenterY = (height / 2 - translateY.value) / scale.value;

    let closestNode = null;
    let minDistance = Infinity;

    displayNodes.forEach(node => {
      const nodeCenter = getCenter(node);
      const distance = Math.sqrt(
        Math.pow(nodeCenter.x - screenCenterX, 2) +
          Math.pow(nodeCenter.y - screenCenterY, 2),
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestNode = node;
      }
    });

    if (closestNode) {
      const nodeCenter = getCenter(closestNode);
      const newTranslateX = width / 2 - nodeCenter.x * scale.value;
      const newTranslateY = height / 2 - nodeCenter.y * scale.value;

      translateX.value = withTiming(newTranslateX, { duration: 300 });
      translateY.value = withTiming(newTranslateY, { duration: 300 });
      savedTranslateX.value = newTranslateX;
      savedTranslateY.value = newTranslateY;
    }
  };

  return (
    <PaperProvider theme={OriginalTheme}>
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        <View
          pointerEvents="box-none"
          style={styles.fabRootContainer}
          zIndex={100}
        >
          {/* Global Group (Bottom Left) */}
          <View style={styles.fabGroup}>
            {/* 6: Reset Zoom */}
            <FAB
              icon="magnify"
              style={styles.fab}
              small
              onPress={() => runOnJS(resetScale)()}
            />
            {/* 7: Pan/Move mode */}
            <FAB
              icon="target"
              style={styles.fab}
              onPress={() => runOnJS(moveToNearestCard)()}
              small
              visible={true}
            />
          </View>

          {/* Right Groups */}
          <View style={styles.fabRightColumn}>
            {/* Reference Group (Top Right) */}
            <View style={[styles.fabGroup, { marginBottom: 8 }]}>
              {/* 4: Show Attachments */}
              <FAB
                icon="paperclip"
                style={styles.fab}
                onPress={() => setShowAttachmentsOnCanvas(s => !s)}
                color={showAttachmentsOnCanvas ? '#34C759' : undefined}
                small
                visible={true}
              />
              {/* 5: See-through Mode */}
              <FAB
                icon={isSeeThrough ? 'eye-off' : 'eye'}
                style={styles.fab}
                onPress={() => setIsSeeThrough(s => !s)}
                disabled={linkingState.active}
                small
                visible={true}
              />
            </View>

            {/* Edit Group (Bottom Right) */}
            <View style={styles.fabGroup}>
              {/* 3: Section Up */}
              <FAB
                icon="arrow-up-bold"
                style={styles.fab}
                onPress={handlePressSectionUp}
                disabled={fabDisabled}
                small
                visible={true}
              />
              {/* 2: Link Line Mode */}
              <FAB
                icon="link-variant"
                style={styles.fab}
                onPress={toggleLinkingMode}
                color={linkingState.active ? '#34C759' : undefined}
                disabled={isSeeThrough}
                small
                visible={true}
              />
              {/* 1: Add Card */}
              <FAB
                icon="plus"
                style={styles.fab}
                onPress={handleAddNode}
                disabled={fabDisabled}
                small
                visible={true}
              />
            </View>
          </View>
        </View>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.flowArea}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Group transform={skiaTransform} origin={skiaOrigin}>
                {displayNodes.map(node => (
                  <SkiaCard
                    key={node.id}
                    node={node}
                    fontMgr={fontMgr}
                    isSelected={linkingState.sourceNodeId === node.id}
                    isLinkingMode={linkingState.active}
                    isLinkSource={linkingState.sourceNodeId === node.id}
                    isEditing={editingNode && editingNode.id === node.id}
                    isSeeThroughParent={node.isSeeThroughParent}
                    showAttachment={showAttachmentsOnCanvas}
                  />
                ))}
                {renderEdges()}
              </Group>
            </Canvas>
          </View>
        </GestureDetector>
        {editingNode && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.editingOverlay}
          >
            <Card style={styles.editingContainer}>
              <Card.Content>
                <TextInput
                  value={editingNode.title}
                  onChangeText={text =>
                    setEditingNode(prev => ({ ...prev, title: text }))
                  }
                  style={styles.input}
                  placeholder={t('title')}
                  autoFocus
                  maxLength={16}
                />
                <TextInput
                  value={editingNode.description}
                  onChangeText={text =>
                    setEditingNode(prev => ({ ...prev, description: text }))
                  }
                  style={styles.input}
                  placeholder={t('description')}
                  multiline
                  maxLength={100}
                  editable={editingNode.size !== 'small'}
                />
                <SegmentedButtons
                  value={editingNode.size}
                  onValueChange={value =>
                    setEditingNode(prev => ({ ...prev, size: value }))
                  }
                  buttons={[
                    { value: 'small', label: t('sizeSmall') },
                    { value: 'medium', label: t('sizeMedium') },
                    { value: 'large', label: t('sizeLarge') },
                  ]}
                  style={styles.sizeSelectionContainer}
                />
                <TouchableOpacity
                  style={[
                    styles.colorButton,
                    { backgroundColor: editingNode.color },
                  ]}
                  onPress={() => setColorPickerVisible(true)}
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
                            uri: `file://${editingNode.attachment.thumbnail_path}`,
                          }}
                          style={styles.thumbnail}
                        />
                      ) : (
                        <Icon source="link-variant" size={80} />
                      )
                    ) : editingNode.attachment.thumbnail_path ||
                      (editingNode.attachment.mime_type &&
                        editingNode.attachment.mime_type.startsWith(
                          'image/',
                        )) ? (
                      <Image
                        key={
                          editingNode.attachment.thumbnail_path ||
                          editingNode.attachment.stored_path
                        }
                        source={{
                          uri: editingNode.attachment.thumbnail_path
                            ? `file://${editingNode.attachment.thumbnail_path}`
                            : `file://${editingNode.attachment.stored_path}`,
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
                      <Button onPress={handleOpenAttachment}>
                        {t('open')}
                      </Button>
                      <Button
                        onPress={handleRemoveAttachment}
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
                        onPress={handleAttachFile}
                        style={styles.attachButton}
                      >
                        {t('file')}
                      </Button>
                      <Button
                        icon="web"
                        mode="outlined"
                        onPress={() => setUrlInputVisible(true)}
                        style={styles.attachButton}
                      >
                        {t('url')}
                      </Button>
                    </View>
                  </View>
                )}
              </Card.Content>
              <Card.Actions style={styles.buttonContainer}>
                <Button onPress={handleSaveEditingNode}>{t('save')}</Button>
                <Button
                  mode="outlined"
                  onPress={() => setEditingNode(null)}
                  textColor={'#555'}
                >
                  {t('cancel')}
                </Button>
              </Card.Actions>
            </Card>
          </KeyboardAvoidingView>
        )}
        <Portal>
          <Modal
            visible={colorPickerVisible}
            onDismiss={() => setColorPickerVisible(false)}
            contentContainerStyle={styles.colorPickerContainer}
          >
            {editingNode && (
              <ColorPalette
                onChange={color => {
                  setEditingNode(prev => ({ ...prev, color: color }));
                  setColorPickerVisible(false);
                }}
                value={editingNode.color}
                colors={[
                  '#FCA5A5',
                  '#F87171',
                  '#FDBA74',
                  '#FB923C',
                  '#FDE047',
                  '#FACC15',
                  '#86EFAC',
                  '#4ADE80',
                  '#5EEAD4',
                  '#2DD4BF',
                  '#93C5FD',
                  '#60A5FA',
                  '#A5B4FC',
                  '#818CF8',
                  '#C4B5FD',
                  '#A78BFA',
                  '#D1D5DB',
                  '#9CA3AF',
                  '#6B7280',
                  '#FFFFFF',
                ]}
                title={t('selectCardColor')}
                icon={<Text>✔</Text>}
              />
            )}
          </Modal>
          <Modal
            visible={urlInputVisible}
            onDismiss={() => setUrlInputVisible(false)}
            contentContainerStyle={styles.urlInputContainer}
          >
            <TextInput
              value={attachmentUrl}
              onChangeText={setAttachmentUrl}
              style={styles.input}
              placeholder="https://example.com"
              autoCapitalize="none"
              autoFocus
            />
            <View style={styles.buttonContainer}>
              <Button onPress={handleSaveUrlAttachment}>{t('save')}</Button>
              <Button
                onPress={() => {
                  setUrlInputVisible(false);
                  setAttachmentUrl('');
                }}
                textColor={OriginalTheme.colors.secondary}
              >
                {t('cancel')}
              </Button>
            </View>
          </Modal>
        </Portal>
      </SafeAreaView>
    </PaperProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flowArea: {
    flex: 1,
  },
  fabRootContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
  fabRightColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  fabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  fab: {
    marginHorizontal: 4,
    backgroundColor: OriginalTheme.colors.primary,
  },
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
  colorPickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  colorPickerContainer: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  urlInputContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    alignSelf: 'center',
  },
  scaleIndicatorText: {
    color: 'black',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
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
  },
  attachButton: {
    width: '45%',
  },
  thumbnail: {
    width: 100,
    height: 100,
    resizeMode: 'cover',
    marginBottom: 10,
    borderRadius: 5,
  },
});

export default FlowEditorScreen;
