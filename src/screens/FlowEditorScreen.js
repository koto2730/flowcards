import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TextInput,
  Button,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TouchableOpacity,
  Text,
  Image,
  PermissionsAndroid,
  Alert,
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
import { updateFlow, getFlows, getAttachmentByNodeId, insertAttachment, deleteAttachment } from '../db';
import DocumentPicker from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import { createThumbnail } from 'react-native-create-thumbnail';
import { Linking } from 'react-native';
import {
  Divider,
  FAB,
  Provider as PaperProvider,
  SegmentedButtons,
}
from 'react-native-paper';
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

const { width, height } = Dimensions.get('window');
const ATTACHMENT_DIR = `${RNFS.DocumentDirectoryPath}/attachments`;

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
      permissionsToRequest = [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];
    }

    const statuses = await PermissionsAndroid.requestMultiple(permissionsToRequest);
    
    const allGranted = Object.values(statuses).every(
      status => status === PermissionsAndroid.RESULTS.GRANTED
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
      }
      else {
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
      const res = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      });

      const originalUri = res.uri;
      const fileName = res.name;
      const fileType = res.type;

      const uniqueFileName = `${Date.now()}-${fileName}`;
      const storedPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;

      await RNFS.copyFile(originalUri, storedPath);

      let thumbnailPath = null;
      if (fileType.startsWith('video/')) {
        const thumbnailRes = await createThumbnail({
          url: storedPath,
          timeStamp: 1000, // 1 second
        });
        thumbnailPath = thumbnailRes.path;
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
    } catch (err) {
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker
      } else {
        console.error('Error picking or copying file', err);
      }
    }
  };

  const handleOpenAttachment = () => {
    if (editingNode?.attachment?.stored_path) {
      Linking.openURL(`file://${editingNode.attachment.stored_path}`);
    }
  };

  const handleRemoveAttachment = async () => {
    if (!editingNode?.attachment) return;

    const { id, stored_path, thumbnail_path } = editingNode.attachment;

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

      setEditingNode(prev => ({ ...prev, attachment: null, attachment_deleted: true }));
    } catch (err) {
      console.error('Error removing attachment files', err);
    }
  };


  const handleSaveEditingNode = async () => {
    if (!editingNode) return;

    try {
      // Handle attachment changes first
      if (editingNode.attachment_deleted && editingNode.attachment?.id) {
        await deleteAttachment(editingNode.attachment.id);
      } else if (editingNode.attachment && !editingNode.attachment.id) {
        // New attachment, insert it
        await insertAttachment(editingNode.attachment);
      }

      // Then, update the node data
      const dataToUpdate = {
        title: editingNode.title,
        description: editingNode.description,
        size: editingNode.size,
        color: editingNode.color,
      };
      await handleUpdateNodeData(editingNode.id, dataToUpdate, fontMgr);
    } catch (err) {
      console.error('Failed to save node or attachment', err);
    }
    finally {
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
        <View pointerEvents="box-none" style={styles.fabContainer} zIndex={100}>
          <FAB
            icon="magnify"
            style={[styles.fab, styles.fabScale]}
            small
            onPress={() => runOnJS(resetScale)()}
          />
          <FAB
            icon="target"
            style={[styles.fab, styles.fabMove]}
            onPress={() => runOnJS(moveToNearestCard)()}
            small
            visible={true}
          />
          <Divider style={{ height: 32, marginHorizontal: 4 }} />
          <FAB
            icon={isSeeThrough ? 'eye-off' : 'eye'}
            style={[styles.fab, styles.fabEye]}
            onPress={() => setIsSeeThrough(s => !s)}
            disabled={linkingState.active}
            small
            visible={true}
          />
          <FAB
            icon="arrow-up-bold"
            style={[styles.fab, styles.fabTop]}
            onPress={handlePressSectionUp}
            disabled={fabDisabled}
            small
            visible={true}
          />
          <FAB
            icon="link-variant"
            style={[styles.fab, styles.fabMiddle]}
            onPress={toggleLinkingMode}
            color={linkingState.active ? '#34C759' : undefined}
            disabled={isSeeThrough}
            small
            visible={true}
          />
          <FAB
            icon="plus"
            style={[styles.fab, styles.fabBottom]}
            onPress={handleAddNode}
            disabled={fabDisabled}
            small
            visible={true}
          />
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
            <View style={styles.editingContainer}>
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
                   <Image
                    source={{
                      uri: editingNode.attachment.thumbnail_path
                        ? `file://${editingNode.attachment.thumbnail_path}`
                        : `file://${editingNode.attachment.stored_path}`,
                    }}
                    style={styles.thumbnail}
                  />
                  <Text style={styles.attachmentText} numberOfLines={1}>
                    {editingNode.attachment.filename}
                  </Text>
                  <View style={styles.attachmentButtons}>
                    <Button title={t('open')} onPress={handleOpenAttachment} />
                    <Button title={t('remove')} onPress={handleRemoveAttachment} color="red" />
                  </View>
                </View>
              ) : (
                <Button
                  title={t('attachFile')}
                  onPress={handleAttachFile}
                />
              )}

              <Divider style={{ marginVertical: 10 }} />

              <View style={styles.buttonContainer}>
                <Button title={t('save')} onPress={handleSaveEditingNode} />
                <Button
                  title={t('cancel')}
                  onPress={() => setEditingNode(null)}
                  color="gray"
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
        {colorPickerVisible && (
          <Modal
            transparent={true}
            animationType="fade"
            visible={colorPickerVisible}
            onRequestClose={() => setColorPickerVisible(false)}
          >
            <View style={styles.colorPickerOverlay}>
              <View style={styles.colorPickerContainer}>
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
              </View>
            </View>
          </Modal>
        )}
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
  fabContainer: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fab: {
    marginHorizontal: 4,
  },
  fabEye: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  fabTop: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  fabMiddle: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  fabBottom: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  editingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editingContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  input: {
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
  bottomLeftControls: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scaleIndicatorText: {
    color: 'black',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  fabMove: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  fabScale: {
    backgroundColor: OriginalTheme.colors.primary,
  },
  attachmentContainer: {
    alignItems: 'center',
  },
  attachmentText: {
    marginBottom: 10,
  },
  attachmentButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '60%',
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
