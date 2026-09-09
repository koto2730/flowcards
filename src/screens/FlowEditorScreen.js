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
  Keyboard,
  Vibration,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Canvas,
  Path,
  Group,
  useFonts,
  useFont,
  useSVG,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  useDerivedValue,
  withTiming,
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import {
  updateFlow,
  getFlows,
  getAttachmentByNodeId,
  insertAttachment,
  insertNode,
  updateNode,
  deleteNode,
  deleteEdge,
  deleteAttachment,
} from '../db';
import { pick, types, isCancel } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';
import Video from 'react-native-video';
import { Linking } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
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
import { v4 as uuidv4 } from 'uuid';
import QRScannerModal from '../components/QRScannerModal';
import AudioRecorderModal from '../components/AudioRecorderModal';
import AudioAttachmentPlayer from '../components/AudioAttachmentPlayer';
import { isSafePublicUrl } from '../utils/urlSafety';
import { sanitizeFilename } from '../utils/fileSafety';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const { width, height } = Dimensions.get('window');
const ATTACHMENT_BASE_PATH = RNFS.DocumentDirectoryPath;
const ATTACHMENT_DIR_NAME = 'attachments';
const ATTACHMENT_DIR = `${ATTACHMENT_BASE_PATH}/${ATTACHMENT_DIR_NAME}`;

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
  m4a: 'audio/mp4',
  aac: 'audio/aac',
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

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  const { t } = useTranslation();
  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const [alignModeOpen, setAlignModeOpen] = useState(false);
  const {
    allNodes,
    setAllNodes,
    edges,
    displayNodes,
    fetchData,
    currentParentId,
    handleUpdateNodeData,
    handleUpdateNodePosition,
    addNode,
    addBulkNodes,
    handleDeleteNode,
    handleDoubleClick,
    handleSectionUp,
    navigateToSection,
    linkingState,
    setLinkingState,
    toggleLinkingMode,
    handleCardTap,
    handleDeleteEdge,
    clearNodeSelection,
  } = useFlowData(flowId, isSeeThrough, alignModeOpen, t);

  const [editingNode, setEditingNode] = useState(null);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [showAttachmentsOnCanvas, setShowAttachmentsOnCanvas] = useState(false);
  const [bulkAddModalVisible, setBulkAddModalVisible] = useState(false);
  const [bulkAddText, setBulkAddText] = useState('');
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [audioRecorderVisible, setAudioRecorderVisible] = useState(false);
  // Cut → Paste flow (#38).
  // mode: 'inactive' | 'selecting' (waiting for user to tap a card) | 'pasting' (card chosen, awaiting paste/cancel)
  const [cutState, setCutState] = useState({ mode: 'inactive', cardId: null });

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
  const pressState = useSharedValue({ id: null, state: 'idle' });
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

  const paperclipIconSvg = useSVG(require('../../assets/icons/paperclip.svg'));

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
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setBulkAddModalVisible(true)}
          style={{ marginRight: 16 }}
        >
          <Icon source="plus-box-multiple" size={24} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, flowName]);

  const [pendingEvent, setPendingEvent] = useState(null);

  useEffect(() => {
    if (!pendingEvent) return;

    const { type, nodeId, extra } = pendingEvent;

    const run = async () => {
      if (type === 'tap') {
        // In Cut "selecting" mode, a card tap selects the card for moving
        // and advances to "pasting" mode instead of running the normal tap flow.
        if (cutState.mode === 'selecting') {
          setCutState({ mode: 'pasting', cardId: nodeId });
          return;
        }
        await handleCardTap(nodeId);
      } else if (type === 'doubleTap') {
        // Block entering the cut card itself while in PASTE mode.
        // Since descendants can only be reached by entering the cut
        // card first, this single guard prevents all cycle scenarios.
        if (cutState.mode === 'pasting' && nodeId === cutState.cardId) {
          return;
        }
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
    cutState.mode,
    cutState.cardId,
    handleCardTap,
    handleDoubleClick,
    handleUpdateNodePosition,
    handleDeleteNode,
    handleDeleteEdge,
  ]);

  const panGesture = Gesture.Pan()
    .onStart(event => {
      pressState.value = { id: null, state: 'idle' };
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
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate(event => {
      const newScale = savedScale.value * event.scale;
      if (newScale < 0.1) {
        return;
      }

      const worldFocalX =
        (event.focalX - savedTranslateX.value) / savedScale.value;
      const worldFocalY =
        (event.focalY - savedTranslateY.value) / savedScale.value;

      translateX.value = event.focalX - worldFocalX * newScale;
      translateY.value = event.focalY - worldFocalY * newScale;
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
    // Disable editing while in Cut/Paste flow.
    if (cutState.mode !== 'inactive') return;
    try {
      const attachment = await getAttachmentByNodeId(flowId, hitNode.id);
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
      // Even if fetching attachment fails, open the editor without it
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
    .maxDistance(10)
    .onBegin(event => {
      if (isSeeThrough || linkingState.active) return;
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;
      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode) {
        pressState.value = { id: hitNode.id, state: 'pressing' };
      }
    })
    .onStart(() => {
      if (pressState.value.id) {
        pressState.value = {
          id: pressState.value.id,
          state: 'confirmed',
        };
        runOnJS(Vibration.vibrate)(50);
      }
    })
    .onEnd(event => {
      if (pressState.value.state === 'confirmed') {
        const worldX = (event.x - translateX.value) / scale.value;
        const worldY = (event.y - translateY.value) / scale.value;
        if (!Array.isArray(displayNodes)) return;
        const hitNode = [...displayNodes]
          .reverse()
          .find(node => isPointInCard(node, worldX, worldY));
        if (hitNode) {
          runOnJS(handleNodeLongPress)(hitNode);
        }
      }
    })
    .onFinalize(() => {
      pressState.value = { id: null, state: 'idle' };
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
    longPressGesture,
    Gesture.Simultaneous(panGesture, pinchGesture),
    doubleTapGesture,
    tapGesture,
  );

  const handleAddNode = () => {
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    addNode(position);
  };

  const handleStartCut = () => {
    setCutState({ mode: 'selecting', cardId: null });
  };

  const handleCancelCut = () => {
    setCutState({ mode: 'inactive', cardId: null });
  };

  // True when the current section is the cut card itself or any of its
  // descendants — pasting there would create a cycle in parentId and
  // orphan the subtree.
  const isPasteTargetIllegal = () => {
    if (!cutState.cardId) return false;
    if (currentParentId === cutState.cardId) return true;
    let cursor = currentParentId;
    const seen = new Set();
    while (cursor && cursor !== 'root' && !seen.has(cursor)) {
      seen.add(cursor);
      const node = allNodes.find(n => n.id === cursor);
      if (!node) break;
      if (node.id === cutState.cardId) return true;
      cursor = node.parentId;
    }
    return false;
  };

  const handlePaste = () => {
    if (!cutState.cardId) {
      setCutState({ mode: 'inactive', cardId: null });
      return;
    }
    if (isPasteTargetIllegal()) {
      Alert.alert(t('error'), t('pasteIntoSelfMessage'));
      return;
    }
    // Detect edges that will become cross-section after the move:
    // the moved card is one endpoint, the other endpoint lives in a
    // section other than the destination (currentParentId).
    const affected = edges.filter(e => {
      const involves =
        e.source === cutState.cardId || e.target === cutState.cardId;
      if (!involves) return false;
      const otherId = e.source === cutState.cardId ? e.target : e.source;
      const otherNode = allNodes.find(n => n.id === otherId);
      if (!otherNode) return false;
      return otherNode.parentId !== currentParentId;
    });

    if (affected.length > 0) {
      Alert.alert(
        t('pasteBreaksLinksTitle'),
        t('pasteBreaksLinksMessage', { count: affected.length }),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('ok'), onPress: () => performPaste(affected) },
        ],
      );
      return;
    }
    performPaste([]);
  };

  const performPaste = async edgesToDelete => {
    if (!cutState.cardId) {
      setCutState({ mode: 'inactive', cardId: null });
      return;
    }
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    try {
      // Remove edges that would become cross-section first — errors
      // here are non-fatal (cleanup migration will catch strays).
      for (const e of edgesToDelete) {
        await deleteEdge(e.id).catch(() => {});
      }
      await updateNode(cutState.cardId, {
        parentId: currentParentId,
        x: position.x,
        y: position.y,
      });
      fetchData();
    } catch (e) {
      Alert.alert(t('error'), e.message || String(e));
    } finally {
      setCutState({ mode: 'inactive', cardId: null });
    }
  };

  const parseBulkText = text => {
    const lines = text.split('\n');
    const labels = lines
      .map(line => {
        // Remove bullet characters: ・, -, *, •, ●, ○, ◯, numbers with dots/parentheses
        return line
          .replace(/^[\s]*[・\-\*•●○◯]\s*/, '')
          .replace(/^[\s]*\d+[.)]\s*/, '')
          .trim();
      })
      .filter(label => label.length > 0);
    return labels;
  };

  const handleBulkAdd = () => {
    const labels = parseBulkText(bulkAddText);
    if (labels.length === 0) {
      setBulkAddModalVisible(false);
      setBulkAddText('');
      return;
    }
    const startPosition = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    addBulkNodes(labels, startPosition);
    setBulkAddModalVisible(false);
    setBulkAddText('');
  };

  const handlePressSectionUp = () => {
    const screenCenter = {
      x: (width / 2 - translateX.value) / scale.value,
      y: (height / 2 - translateY.value) / scale.value,
    };
    handleSectionUp(screenCenter);
  };

  const handleAlign = async alignment => {
    const selectedIds = Array.from(linkingState.selectedNodeIds);
    if (selectedIds.length === 0) return;
    if (alignment !== 'spread' && selectedIds.length < 2) return;

    const selectedNodes = allNodes.filter(node =>
      selectedIds.includes(node.id),
    );

    const originalNodesMap = new Map(
      allNodes.map(n => [n.id, JSON.stringify(n.position)]),
    );
    let newNodes = [...allNodes];

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? { ...node, position: { ...node.position, x: minX } }
            : node,
        );
        break;
      }
      case 'center-h': {
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        const maxX = Math.max(
          ...selectedNodes.map(n => n.position.x + n.size.width),
        );
        const center = (minX + maxX) / 2;
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: {
                  ...node.position,
                  x: center - node.size.width / 2,
                },
              }
            : node,
        );
        break;
      }
      case 'right': {
        const maxX = Math.max(
          ...selectedNodes.map(n => n.position.x + n.size.width),
        );
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: { ...node.position, x: maxX - node.size.width },
              }
            : node,
        );
        break;
      }
      case 'top': {
        const minY = Math.min(...selectedNodes.map(n => n.position.y));
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? { ...node, position: { ...node.position, y: minY } }
            : node,
        );
        break;
      }
      case 'center-v': {
        const minY = Math.min(...selectedNodes.map(n => n.position.y));
        const maxY = Math.max(
          ...selectedNodes.map(n => n.position.y + n.size.height),
        );
        const center = (minY + maxY) / 2;
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: {
                  ...node.position,
                  y: center - node.size.height / 2,
                },
              }
            : node,
        );
        break;
      }
      case 'bottom': {
        const maxY = Math.max(
          ...selectedNodes.map(n => n.position.y + n.size.height),
        );
        newNodes = newNodes.map(node =>
          selectedIds.includes(node.id)
            ? {
                ...node,
                position: { ...node.position, y: maxY - node.size.height },
              }
            : node,
        );
        break;
      }
      case 'spread': {
        let tempAllNodes = JSON.parse(JSON.stringify(allNodes));
        const MAX_ITERATIONS = 100;
        let iterations = 0;
        let moved = false;
        const selectedIdsSet = new Set(selectedIds);

        // Step 1: Resolve overlaps between selected nodes
        if (selectedNodes.length > 1) {
          iterations = 0;
          do {
            moved = false;
            const currentSelectedNodes = tempAllNodes.filter(n =>
              selectedIdsSet.has(n.id),
            );
            for (let i = 0; i < currentSelectedNodes.length; i++) {
              for (let j = i + 1; j < currentSelectedNodes.length; j++) {
                const nodeA = currentSelectedNodes[i];
                const nodeB = currentSelectedNodes[j];
                const rectA = { ...nodeA.position, ...nodeA.size };
                const rectB = { ...nodeB.position, ...nodeB.size };

                const overlapX = Math.max(
                  0,
                  Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
                    Math.max(rectA.x, rectB.x),
                );
                const overlapY = Math.max(
                  0,
                  Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
                    Math.max(rectA.y, rectB.y),
                );

                if (overlapX > 0 && overlapY > 0) {
                  moved = true;
                  const centerA = {
                    x: rectA.x + rectA.width / 2,
                    y: rectA.y + rectA.height / 2,
                  };
                  const centerB = {
                    x: rectB.x + rectB.width / 2,
                    y: rectB.y + rectB.height / 2,
                  };
                  let dx = centerB.x - centerA.x;
                  let dy = centerB.y - centerA.y;

                  if (dx === 0 && dy === 0) {
                    dx = (Math.random() - 0.5) * 2;
                    dy = (Math.random() - 0.5) * 2;
                  }

                  const angle = Math.atan2(dy, dx);
                  const moveX = (overlapX / 2) * Math.cos(angle);
                  const moveY = (overlapY / 2) * Math.sin(angle);

                  nodeA.position.x -= moveX;
                  nodeA.position.y -= moveY;
                  nodeB.position.x += moveX;
                  nodeB.position.y += moveY;
                }
              }
            }
            iterations++;
          } while (moved && iterations < MAX_ITERATIONS);
        }

        // Step 2: Resolve overlaps between selected and unselected nodes
        iterations = 0;
        do {
          moved = false;
          const currentSelectedNodes = tempAllNodes.filter(n =>
            selectedIdsSet.has(n.id),
          );
          const unselectedNodes = tempAllNodes.filter(
            n => !selectedIdsSet.has(n.id),
          );

          for (const selectedNode of currentSelectedNodes) {
            for (const unselectedNode of unselectedNodes) {
              const rectA = { ...selectedNode.position, ...selectedNode.size };
              const rectB = {
                ...unselectedNode.position,
                ...unselectedNode.size,
              };

              const overlapX = Math.max(
                0,
                Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
                  Math.max(rectA.x, rectB.x),
              );
              const overlapY = Math.max(
                0,
                Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
                  Math.max(rectA.y, rectB.y),
              );

              if (overlapX > 0 && overlapY > 0) {
                moved = true;
                const centerA = {
                  x: rectA.x + rectA.width / 2,
                  y: rectA.y + rectA.height / 2,
                };
                const centerB = {
                  x: rectB.x + rectB.width / 2,
                  y: rectB.y + rectB.height / 2,
                };
                let dx = centerB.x - centerA.x;
                let dy = centerB.y - centerA.y;

                if (dx === 0 && dy === 0) {
                  dx = (Math.random() - 0.5) * 2;
                  dy = (Math.random() - 0.5) * 2;
                }

                const angle = Math.atan2(dy, dx);
                const moveX = overlapX * Math.cos(angle);
                const moveY = overlapY * Math.sin(angle);

                unselectedNode.position.x += moveX;
                unselectedNode.position.y += moveY;
              }
            }
          }
          iterations++;
        } while (moved && iterations < MAX_ITERATIONS);

        newNodes = tempAllNodes;
        break;
      }
    }

    setAllNodes(newNodes);

    const nodesToUpdate = newNodes.filter(
      node => JSON.stringify(node.position) !== originalNodesMap.get(node.id),
    );

    const updates = nodesToUpdate.map(node =>
      handleUpdateNodePosition(node.id, node.position),
    );

    await Promise.all(updates);
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

  const processAttachment = async (originalUri, fileName, fileType) => {
    if (!fileType || fileType === 'application/octet-stream') {
      const extension = fileName?.split('.').pop()?.toLowerCase();
      const inferredType = extension ? mimeTypeLookup[extension] : null;
      fileType = inferredType || 'application/octet-stream';
    }
    if (!fileName) {
      const extFromMime = Object.keys(mimeTypeLookup).find(
        ext => mimeTypeLookup[ext] === fileType,
      );
      fileName = `file_${Date.now()}.${extFromMime || 'bin'}`;
    }

    const uniqueFileName = `${Date.now()}-${sanitizeFilename(fileName)}`;
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
      node_id: editingNode.id,
      filename: fileName,
      mime_type: fileType,
      original_uri: originalUri,
      stored_path: relativeStoredPath,
      thumbnail_path: relativeThumbnailPath,
    };

    const newNode = { ...editingNode, attachment: newAttachment };
    setEditingNode(newNode);
  };

  const handleAttachFile = async () => {
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
        await processAttachment(res.uri, res.name, res.type);
      }
    } catch (err) {
      if (isCancel(err)) {
        // User cancelled the picker
      } else {
        console.error('Error picking or copying file', err);
      }
    }
  };

  const handleAttachImageFromLibrary = async () => {
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
      await processAttachment(asset.uri, asset.fileName, asset.type);
    }
  };

  const handleAttachImageFromCamera = async () => {
    Keyboard.dismiss();
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(t('error'), t('cameraPermissionDenied'));
      return;
    }
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: false,
    });

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert(t('error'), result.errorMessage || result.errorCode);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      await processAttachment(asset.uri, asset.fileName, asset.type);
    }
  };

  const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleAddNodeFromVideo = async () => {
    setFabMenuOpen(false);
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(t('error'), t('cameraPermissionDenied'));
      return;
    }
    const result = await launchCamera({
      mediaType: 'video',
      videoQuality: 'high',
      saveToPhotos: false,
    });

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert(t('error'), result.errorMessage || result.errorCode);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const extFromUri = (asset.uri || '').split('?')[0].split('.').pop()?.toLowerCase();
      const ext = extFromUri && extFromUri.length <= 4 ? extFromUri : (Platform.OS === 'ios' ? 'mov' : 'mp4');
      const fileName = asset.fileName || `video_${Date.now()}.${ext}`;
      const mimeType = asset.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4');
      const nodeId = uuidv4();
      const position = {
        x: (10 - translateX.value) / scale.value,
        y: (10 - translateY.value) / scale.value,
      };
      let nodeInserted = false;
      try {
        const dirExists = await RNFS.exists(ATTACHMENT_DIR);
        if (!dirExists) {
          await RNFS.mkdir(ATTACHMENT_DIR);
        }

        const uniqueFileName = `${Date.now()}-${sanitizeFilename(fileName)}`;
        const absoluteStoredPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;
        const relativeStoredPath = `${ATTACHMENT_DIR_NAME}/${uniqueFileName}`;

        if (Platform.OS === 'ios') {
          const sourcePath = decodeURIComponent(asset.uri.replace(/^file:\/\//, ''));
          await RNFS.copyFile(sourcePath, absoluteStoredPath);
        } else {
          await RNFS.copyFile(asset.uri, absoluteStoredPath);
        }

        await insertNode({
          id: nodeId,
          flowId,
          parentId: currentParentId,
          label: t('newCard'),
          description: '',
          x: position.x,
          y: position.y,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        });
        nodeInserted = true;

        await insertAttachment({
          node_id: nodeId,
          flow_id: flowId,
          filename: fileName,
          mime_type: mimeType,
          original_uri: asset.uri,
          stored_path: relativeStoredPath,
          thumbnail_path: relativeStoredPath,
        });

        fetchData();
      } catch (e) {
        if (nodeInserted) {
          await deleteNode(nodeId).catch(() => {});
        }
        Alert.alert(t('error'), e.message || String(e));
      }
    }
  };

  const handleAddNodeFromCamera = async () => {
    setFabMenuOpen(false);
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert(t('error'), t('cameraPermissionDenied'));
      return;
    }
    const result = await launchCamera({
      mediaType: 'photo',
      quality: 0.8,
      saveToPhotos: false,
    });

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert(t('error'), result.errorMessage || result.errorCode);
      return;
    }

    if (result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const mimeType = asset.type || 'image/jpeg';
      const nodeId = uuidv4();
      const position = {
        x: (10 - translateX.value) / scale.value,
        y: (10 - translateY.value) / scale.value,
      };
      let nodeInserted = false;
      try {
        const dirExists = await RNFS.exists(ATTACHMENT_DIR);
        if (!dirExists) {
          await RNFS.mkdir(ATTACHMENT_DIR);
        }

        const uniqueFileName = `${Date.now()}-${sanitizeFilename(fileName)}`;
        const absoluteStoredPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;
        const relativeStoredPath = `${ATTACHMENT_DIR_NAME}/${uniqueFileName}`;

        if (Platform.OS === 'ios') {
          const sourcePath = decodeURIComponent(asset.uri.replace(/^file:\/\//, ''));
          await RNFS.copyFile(sourcePath, absoluteStoredPath);
        } else {
          await RNFS.copyFile(asset.uri, absoluteStoredPath);
        }

        await insertNode({
          id: nodeId,
          flowId,
          parentId: currentParentId,
          label: t('newCard'),
          description: '',
          x: position.x,
          y: position.y,
          width: 150,
          height: 85,
          color: '#FFFFFF',
        });
        nodeInserted = true;

        await insertAttachment({
          node_id: nodeId,
          flow_id: flowId,
          filename: fileName,
          mime_type: mimeType,
          original_uri: asset.uri,
          stored_path: relativeStoredPath,
          thumbnail_path: relativeStoredPath,
        });

        fetchData();
      } catch (e) {
        if (nodeInserted) {
          await deleteNode(nodeId).catch(() => {});
        }
        Alert.alert(t('error'), e.message || String(e));
      }
    }
  };

  const handleAudioRecorded = async uri => {
    setAudioRecorderVisible(false);
    if (!uri) return;
    const nodeId = uuidv4();
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    let nodeInserted = false;
    try {
      const dirExists = await RNFS.exists(ATTACHMENT_DIR);
      if (!dirExists) {
        await RNFS.mkdir(ATTACHMENT_DIR);
      }
      const fileName = `audio_${Date.now()}.m4a`;
      const absoluteStoredPath = `${ATTACHMENT_DIR}/${fileName}`;
      const relativeStoredPath = `${ATTACHMENT_DIR_NAME}/${fileName}`;

      const sourcePath = Platform.OS === 'ios'
        ? decodeURIComponent(uri.replace(/^file:\/\//, ''))
        : uri.replace(/^file:\/\//, '');
      await RNFS.copyFile(sourcePath, absoluteStoredPath);

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const label = `${t('audio')} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      await insertNode({
        id: nodeId,
        flowId,
        parentId: currentParentId,
        label,
        description: '',
        x: position.x,
        y: position.y,
        width: 150,
        height: 85,
        color: '#FFFFFF',
      });
      nodeInserted = true;

      await insertAttachment({
        node_id: nodeId,
        flow_id: flowId,
        filename: fileName,
        mime_type: 'audio/mp4',
        original_uri: uri,
        stored_path: relativeStoredPath,
        thumbnail_path: null,
      });

      fetchData();
    } catch (e) {
      if (nodeInserted) {
        await deleteNode(nodeId).catch(() => {});
      }
      Alert.alert(t('error'), e.message || String(e));
    }
  };

  const handleQRScanned = async value => {
    setQrScannerVisible(false);
    try {
      const isUrl = /^https?:\/\//i.test(value);
      const nodeId = uuidv4();
      const position = {
        x: (10 - translateX.value) / scale.value,
        y: (10 - translateY.value) / scale.value,
      };

      const LABEL_MAX = 16;
      const DESC_MAX = 100;

      let nodeLabel = '';
      let nodeDescription = '';

      if (isUrl) {
        nodeLabel = value.slice(0, LABEL_MAX);
      } else if (value.length <= LABEL_MAX) {
        nodeLabel = value;
      } else if (value.length <= DESC_MAX) {
        nodeLabel = value.slice(0, LABEL_MAX);
        nodeDescription = value;
      } else {
        nodeLabel = value.slice(0, LABEL_MAX);
      }

      await insertNode({
        id: nodeId,
        flowId,
        parentId: currentParentId,
        label: nodeLabel,
        description: nodeDescription,
        x: position.x,
        y: position.y,
        width: 150,
        height: 85,
        color: '#FFFFFF',
      });

      if (isUrl) {
        let relativeThumbnailPath = null;
        let previewTitle = null;
        let previewDescription = null;
        let previewImageUrl = null;

        try {
          const previewData = await getLinkPreview(value);
          previewTitle = previewData.title || null;
          previewDescription = previewData.description || null;
          if (
            previewData.images &&
            previewData.images.length > 0 &&
            isSafePublicUrl(previewData.images[0])
          ) {
            previewImageUrl = previewData.images[0];
            const ext = (previewImageUrl.split('.').pop() || 'jpg').split('?')[0];
            const uniqueFileName = `${Date.now()}.${ext}`;
            const absoluteLocalPath = `${ATTACHMENT_DIR}/${uniqueFileName}`;
            await RNFS.downloadFile({ fromUrl: previewImageUrl, toFile: absoluteLocalPath }).promise;
            relativeThumbnailPath = `${ATTACHMENT_DIR_NAME}/${uniqueFileName}`;
          }
        } catch (_) {
          relativeThumbnailPath = null;
          previewImageUrl = null;
        }

        await insertAttachment({
          node_id: nodeId,
          flow_id: flowId,
          filename: previewTitle || value,
          mime_type: 'text/url',
          original_uri: value,
          stored_path: null,
          thumbnail_path: relativeThumbnailPath,
          preview_title: previewTitle,
          preview_description: previewDescription,
          preview_image_url: previewImageUrl,
        });
      } else if (value.length > DESC_MAX) {
        // Very long text → save as .txt file attachment
        const dirExists = await RNFS.exists(ATTACHMENT_DIR);
        if (!dirExists) await RNFS.mkdir(ATTACHMENT_DIR);
        const txtFileName = `qr_${Date.now()}.txt`;
        const absoluteTxtPath = `${ATTACHMENT_DIR}/${txtFileName}`;
        const relativeTxtPath = `${ATTACHMENT_DIR_NAME}/${txtFileName}`;
        await RNFS.writeFile(absoluteTxtPath, value, 'utf8');
        await insertAttachment({
          node_id: nodeId,
          flow_id: flowId,
          filename: txtFileName,
          mime_type: 'text/plain',
          original_uri: null,
          stored_path: relativeTxtPath,
          thumbnail_path: null,
        });
      }

      fetchData();
    } catch (e) {
      Alert.alert(t('error'), e.message || String(e));
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

  const handleSaveUrlAttachment = async () => {
    if (!attachmentUrl) {
      Alert.alert(t('invalidUrl'), t('invalidUrlMessage'));
      return;
    }

    const fullUrl = `https://` + attachmentUrl;

    try {
      const previewData = await getLinkPreview(fullUrl);
      let relative_thumbnail_path = null;
      let preview_image_url = null;

      if (
        previewData.images &&
        previewData.images.length > 0 &&
        isSafePublicUrl(previewData.images[0])
      ) {
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
        node_id: editingNode.id,
        filename: previewData.title || fullUrl,
        mime_type: 'text/url',
        original_uri: fullUrl,
        stored_path: null,
        thumbnail_path: relative_thumbnail_path,
        preview_title: previewData.title,
        preview_description: previewData.description,
        preview_image_url: preview_image_url,
      };

      setEditingNode(prev => ({ ...prev, attachment: newAttachment }));
      setUrlInputVisible(false);
      setAttachmentUrl('');
    } catch (error) {
      console.error('Failed to get link preview:', error);
      Alert.alert(t('previewError'), t('previewErrorMessage'));
    }
  };

  const handleOpenAttachment = () => {
    if (!editingNode?.attachment) return;

    const { mime_type, stored_path, original_uri } = editingNode.attachment;

    if (mime_type === 'text/url' && original_uri) {
      // Re-validate scheme just before dispatching to Linking, in case a
      // non-http(s) URI slipped past earlier filters (or came from an
      // older version's DB row).
      if (!/^https?:\/\//i.test(original_uri)) {
        Alert.alert(t('error'), t('invalidUrlScheme'));
        return;
      }
      Linking.openURL(original_uri).catch(err => {
        console.error('Failed to open URL', err);
        Alert.alert(t('error'), t('cannotOpenUrl'));
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

  const handleRemoveAttachment = async () => {
    if (!editingNode?.attachment) return;

    const { stored_path, thumbnail_path } = editingNode.attachment;

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

  const handleDuplicateNode = () => {
    if (!editingNode) return;
    Alert.alert(
      t('duplicateCard'),
      t('duplicateChildrenNotice'),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('duplicate'), onPress: performDuplicateNode },
      ],
    );
  };

  const performDuplicateNode = async () => {
    if (!editingNode) return;
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    const newNodeId = uuidv4();
    let nodeInserted = false;
    // Track files copied during this run so we can clean them up if a
    // later step (e.g. insertAttachment) throws.
    const copiedAbsPaths = [];
    try {
      const sourceNode = allNodes.find(n => n.id === editingNode.id);
      const sourceData = sourceNode?.data || {};

      await insertNode({
        id: newNodeId,
        flowId,
        parentId: currentParentId,
        label: editingNode.title || sourceData.label || '',
        description: editingNode.description || sourceData.description || '',
        x: position.x,
        y: position.y,
        width: sourceNode?.size?.width || 150,
        height: sourceNode?.size?.height || 85,
        color: editingNode.color || sourceData.color || '#FFFFFF',
      });
      nodeInserted = true;

      // Copy attachment as an independent file/row if present.
      const att = editingNode.attachment;
      if (att) {
        const dirExists = await RNFS.exists(ATTACHMENT_DIR);
        if (!dirExists) await RNFS.mkdir(ATTACHMENT_DIR);

        let newStoredRel = null;
        if (att.stored_path) {
          const srcAbs = `${ATTACHMENT_BASE_PATH}/${att.stored_path}`;
          if (await RNFS.exists(srcAbs)) {
            const baseName = att.stored_path.split('/').pop();
            const newName = `${Date.now()}-${sanitizeFilename(baseName)}`;
            const dstAbs = `${ATTACHMENT_DIR}/${newName}`;
            await RNFS.copyFile(srcAbs, dstAbs);
            copiedAbsPaths.push(dstAbs);
            newStoredRel = `${ATTACHMENT_DIR_NAME}/${newName}`;
          }
        }

        let newThumbRel = null;
        if (att.thumbnail_path && att.thumbnail_path !== att.stored_path) {
          const srcAbs = `${ATTACHMENT_BASE_PATH}/${att.thumbnail_path}`;
          if (await RNFS.exists(srcAbs)) {
            const baseName = att.thumbnail_path.split('/').pop();
            const newName = `${Date.now()}-thumb-${sanitizeFilename(baseName)}`;
            const dstAbs = `${ATTACHMENT_DIR}/${newName}`;
            await RNFS.copyFile(srcAbs, dstAbs);
            copiedAbsPaths.push(dstAbs);
            newThumbRel = `${ATTACHMENT_DIR_NAME}/${newName}`;
          }
        } else if (att.thumbnail_path === att.stored_path) {
          newThumbRel = newStoredRel;
        }

        await insertAttachment({
          node_id: newNodeId,
          flow_id: flowId,
          filename: att.filename,
          mime_type: att.mime_type,
          original_uri: att.original_uri,
          stored_path: newStoredRel,
          thumbnail_path: newThumbRel,
          preview_title: att.preview_title,
          preview_description: att.preview_description,
          preview_image_url: att.preview_image_url,
        });
      }

      fetchData();
      setEditingNode(null);
    } catch (e) {
      if (nodeInserted) {
        await deleteNode(newNodeId).catch(() => {});
      }
      // Roll back any attachment files we copied so we don't leave
      // orphans in the attachments dir.
      for (const p of copiedAbsPaths) {
        await RNFS.unlink(p).catch(() => {});
      }
      Alert.alert(t('error'), e.message || String(e));
    }
  };

  const handleSaveEditingNode = async () => {
    if (!editingNode) return;

    const documentPath = RNFS.DocumentDirectoryPath;
    const convertToRelativePath = path => {
      if (path && path.startsWith(documentPath)) {
        return path.substring(documentPath.length + 1);
      }
      return path;
    };

    try {
      let finalAttachmentState = editingNode.attachment;

      // Handle attachment changes first
      if (editingNode.attachment_deleted && editingNode.deleted_attachment_id) {
        await deleteAttachment(editingNode.deleted_attachment_id);
        if (!editingNode.attachment) {
          finalAttachmentState = null;
        }
      }

      if (editingNode.attachment && !editingNode.attachment.id) {
        // New attachment, insert it
        const insertData = {
          flow_id: flowId,
          node_id: editingNode.id,
          filename: editingNode.attachment.filename,
          mime_type: editingNode.attachment.mime_type,
          original_uri: editingNode.attachment.original_uri,
          stored_path: convertToRelativePath(
            editingNode.attachment.stored_path,
          ),
          preview_title: editingNode.attachment.preview_title,
          preview_description: editingNode.attachment.preview_description,
          preview_image_url: editingNode.attachment.preview_image_url,
          thumbnail_path: convertToRelativePath(
            editingNode.attachment.thumbnail_path,
          ),
        };
        const result = await insertAttachment(insertData);
        finalAttachmentState = {
          ...editingNode.attachment,
          id: result.insertId,
          stored_path: insertData.stored_path,
          thumbnail_path: insertData.thumbnail_path,
        };
      }

      // For existing attachments, ensure paths are relative before saving.
      if (finalAttachmentState && finalAttachmentState.id) {
        finalAttachmentState = {
          ...finalAttachmentState,
          stored_path: convertToRelativePath(finalAttachmentState.stored_path),
          thumbnail_path: convertToRelativePath(
            finalAttachmentState.thumbnail_path,
          ),
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
      await handleUpdateNodeData(flowId, editingNode.id, dataToUpdate, fontMgr);
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

  // Section hierarchy mini-map (#128 → #130).
  // Now shows the real tree of sections (parent nodes that have any
  // descendants) plus the current position, letting the user tap any
  // row to jump to that section.
  const sectionMapItems = useMemo(() => {
    const nodes = allNodes || [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    // A node is a "section" if at least one other node has it as parent.
    const parentIds = new Set();
    for (const n of nodes) {
      if (n.parentId && n.parentId !== 'root') parentIds.add(n.parentId);
    }
    // Always include the currently viewed section so the user's position
    // is visible even if that section has no children yet.
    if (
      currentParentId &&
      currentParentId !== 'root' &&
      byId.has(currentParentId)
    ) {
      parentIds.add(currentParentId);
    }
    // Children lookup limited to section ids only, sorted for stable order.
    const childrenOf = new Map();
    childrenOf.set('root', []);
    for (const id of parentIds) childrenOf.set(id, []);
    for (const n of nodes) {
      if (parentIds.has(n.id)) {
        const parent = n.parentId || 'root';
        if (!childrenOf.has(parent)) childrenOf.set(parent, []);
        childrenOf.get(parent).push(n.id);
      }
    }
    for (const arr of childrenOf.values()) {
      arr.sort((a, b) => {
        const la = byId.get(a)?.label || '';
        const lb = byId.get(b)?.label || '';
        return la.localeCompare(lb);
      });
    }
    // DFS to produce a flat list of { id, depth, label }.
    const out = [];
    const walk = (id, depth) => {
      if (id === 'root') {
        out.push({ id: 'root', depth: 0, label: t('root') });
      } else {
        const node = byId.get(id);
        out.push({
          id,
          depth,
          label: node?.data?.label || node?.label || '',
        });
      }
      const kids = childrenOf.get(id) || [];
      for (const kid of kids) walk(kid, depth + 1);
    };
    walk('root', 0);
    return out;
  }, [allNodes, currentParentId, t]);

  const resolveAttachmentPath = relativePath => {
    if (!relativePath) {
      return null;
    }
    // Check if the path is already an absolute path or a URL
    if (
      relativePath.startsWith('/') ||
      relativePath.startsWith('http') ||
      relativePath.startsWith('file:')
    ) {
      return relativePath;
    }
    return `${ATTACHMENT_BASE_PATH}/${relativePath}`;
  };

  return (
    <PaperProvider theme={OriginalTheme}>
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        {cutState.mode !== 'inactive' && (
          <View style={styles.cutStatusBar} pointerEvents="box-none">
            <Text style={styles.cutStatusText}>
              {cutState.mode === 'selecting'
                ? t('cutSelectCard')
                : t('cutMoving', {
                    name:
                      allNodes.find(n => n.id === cutState.cardId)?.data
                        ?.label ||
                      allNodes.find(n => n.id === cutState.cardId)?.label ||
                      '',
                  })}
            </Text>
          </View>
        )}
        {sectionMapItems.length > 1 && (
          <ScrollView
            style={styles.sectionMapContainer}
            contentContainerStyle={styles.sectionMapContent}
            showsVerticalScrollIndicator={false}
          >
            {sectionMapItems.map(item => {
              const active =
                (item.id === 'root' && currentParentId === 'root') ||
                item.id === currentParentId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.sectionMapRow,
                    { paddingLeft: 4 + item.depth * 8 },
                  ]}
                  onPress={() => {
                    if (item.id === 'root') {
                      navigateToSection('root');
                    } else {
                      navigateToSection(item.id);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.sectionMapCell,
                      active && styles.sectionMapCellActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.sectionMapLabel,
                      active && styles.sectionMapLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label || '—'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        <View
          pointerEvents="box-none"
          style={styles.fabRootContainer}
          zIndex={100}
        >
          {cutState.mode === 'pasting' ? (
            <View style={styles.alignToolsContainer}>
              <FAB
                icon="arrow-up-bold"
                style={styles.alignToolButton}
                onPress={handlePressSectionUp}
                small
              />
              <FAB
                icon="close"
                style={styles.alignToolButton}
                onPress={handleCancelCut}
                small
                label={t('cancel')}
              />
              <FAB
                icon="content-paste"
                style={styles.alignToolButton}
                onPress={handlePaste}
                small
                label={t('paste')}
              />
            </View>
          ) : alignModeOpen ? (
            <View style={styles.alignToolsContainer}>
              <FAB
                icon="format-align-left"
                style={styles.alignToolButton}
                onPress={() => handleAlign('left')}
                small
              />
              <FAB
                icon="format-align-center"
                style={styles.alignToolButton}
                onPress={() => handleAlign('center-h')}
                small
              />
              <FAB
                icon="format-align-right"
                style={styles.alignToolButton}
                onPress={() => handleAlign('right')}
                small
              />
              <FAB
                icon="format-align-top"
                style={styles.alignToolButton}
                onPress={() => handleAlign('top')}
                small
              />
              <FAB
                icon="format-align-middle"
                style={styles.alignToolButton}
                onPress={() => handleAlign('center-v')}
                small
              />
              <FAB
                icon="format-align-bottom"
                style={styles.alignToolButton}
                onPress={() => handleAlign('bottom')}
                small
              />
              <FAB
                icon="arrow-expand-all"
                style={styles.alignToolButton}
                onPress={() => handleAlign('spread')}
                small
              />
              <FAB
                icon="selection-off"
                style={styles.alignToolButton}
                onPress={clearNodeSelection}
                small
              />
              <FAB
                icon="close"
                style={styles.alignToolButton}
                onPress={() => {
                  setAlignModeOpen(false);
                  setLinkingState(prev => ({
                    ...prev,
                    selectedNodeIds: new Set(),
                  }));
                }}
                small
              />
            </View>
          ) : fabMenuOpen ? (
            <View style={styles.fabMenuContainer}>
              {/* Mic + Video + QR row — above card-plus (right-aligned) */}
              <View style={styles.fabMenuQrRow}>
                <FAB
                  icon="microphone"
                  style={styles.alignToolButton}
                  onPress={() => { setFabMenuOpen(false); setAudioRecorderVisible(true); }}
                  small
                  visible={true}
                />
                <FAB
                  icon="video"
                  style={styles.alignToolButton}
                  onPress={handleAddNodeFromVideo}
                  small
                  visible={true}
                />
                <FAB
                  icon="qrcode-scan"
                  style={styles.alignToolButton}
                  onPress={() => { setFabMenuOpen(false); setQrScannerVisible(true); }}
                  small
                  visible={true}
                />
              </View>
              {/* Bottom row: back / camera / add-card */}
              <View style={styles.fabMenuBottomRow}>
                <FAB
                  icon="arrow-left"
                  style={styles.alignToolButton}
                  onPress={() => setFabMenuOpen(false)}
                  small
                  visible={true}
                />
                <FAB
                  icon="camera"
                  style={styles.alignToolButton}
                  onPress={handleAddNodeFromCamera}
                  small
                  visible={true}
                />
                <FAB
                  icon="card-plus-outline"
                  style={styles.alignToolButton}
                  onPress={() => { setFabMenuOpen(false); handleAddNode(); }}
                  small
                  visible={true}
                />
              </View>
            </View>
          ) : (
            <>
              {/* Left column — view toggles on top, nav helpers on bottom */}
              <View style={styles.fabLeftColumn}>
                <View style={[styles.fabGroup, { marginBottom: 8 }]}>
                  <FAB
                    icon={isSeeThrough ? 'eye-off' : 'eye'}
                    style={styles.fab}
                    onPress={() => setIsSeeThrough(s => !s)}
                    disabled={linkingState.active}
                    small
                    visible={true}
                  />
                  <FAB
                    icon="paperclip"
                    style={styles.fab}
                    onPress={() => setShowAttachmentsOnCanvas(s => !s)}
                    color={showAttachmentsOnCanvas ? '#34C759' : undefined}
                    small
                    visible={true}
                  />
                </View>
                <View style={styles.fabGroup}>
                  <FAB
                    icon="magnify"
                    style={styles.fab}
                    small
                    onPress={() => runOnJS(resetScale)()}
                  />
                  <FAB
                    icon="target"
                    style={styles.fab}
                    onPress={() => runOnJS(moveToNearestCard)()}
                    small
                    visible={true}
                  />
                </View>
              </View>

              {/* Right column — align / section-up on top, edit modes on bottom */}
              <View style={styles.fabRightColumn}>
                <View style={[styles.fabGroup, { marginBottom: 8 }]}>
                  <FAB
                    icon="format-align-justify"
                    style={styles.fab}
                    onPress={() => setAlignModeOpen(true)}
                    small
                    visible={true}
                  />
                  <FAB
                    icon="arrow-up-bold"
                    style={styles.fab}
                    onPress={handlePressSectionUp}
                    disabled={fabDisabled}
                    small
                    visible={true}
                  />
                </View>
                <View style={styles.fabGroup}>
                  <FAB
                    icon="content-cut"
                    style={styles.fab}
                    onPress={handleStartCut}
                    disabled={fabDisabled || linkingState.active || isSeeThrough}
                    small
                    visible={true}
                  />
                  <FAB
                    icon="link-variant"
                    style={styles.fab}
                    onPress={toggleLinkingMode}
                    color={linkingState.active ? '#34C759' : undefined}
                    disabled={isSeeThrough}
                    small
                    visible={true}
                  />
                  <FAB
                    icon="plus"
                    style={styles.fab}
                    onPress={() => setFabMenuOpen(true)}
                    disabled={fabDisabled}
                    small
                    visible={true}
                  />
                </View>
              </View>
            </>
          )}
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
                    paperclipIconSvg={paperclipIconSvg}
                    isSelected={linkingState.selectedNodeIds.has(node.id)}
                    isLinkingMode={linkingState.active}
                    isLinkSource={linkingState.sourceNodeId === node.id}
                    isEditing={editingNode && editingNode.id === node.id}
                    isSeeThroughParent={node.isSeeThroughParent}
                    showAttachment={showAttachmentsOnCanvas}
                    pressState={pressState}
                    resolveAttachmentPath={resolveAttachmentPath}
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
              <View style={styles.editingHeader}>
                <Text style={styles.editingHeaderTitle}>{t('editCard')}</Text>
                <View style={styles.editingHeaderButtons}>
                  <TouchableOpacity
                    onPress={handleDuplicateNode}
                    style={styles.duplicateIconButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon source="content-copy" size={22} color="#555" />
                  </TouchableOpacity>
                  <Button
                    mode="outlined"
                    onPress={() => setEditingNode(null)}
                    textColor={'#555'}
                  >
                    {t('cancel')}
                  </Button>
                  <Button mode="contained" onPress={handleSaveEditingNode}>
                    {t('save')}
                  </Button>
                </View>
              </View>
              <Card.Content>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.editingScrollContent}
                >
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
                  onValueChange={value => {
                    Keyboard.dismiss();
                    setEditingNode(prev => ({ ...prev, size: value }));
                  }}
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
                    ) : editingNode.attachment.mime_type.startsWith(
                        'video/',
                      ) ? (
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
                    ) : editingNode.attachment.mime_type &&
                      editingNode.attachment.mime_type.startsWith('audio/') ? (
                      <AudioAttachmentPlayer
                        uri={`file://${resolveAttachmentPath(
                          editingNode.attachment.stored_path,
                        )}`}
                      />
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
                        icon="image-multiple"
                        mode="outlined"
                        onPress={handleAttachImageFromLibrary}
                        style={styles.attachButton}
                      >
                        {t('photo')}
                      </Button>
                      <Button
                        icon="camera"
                        mode="outlined"
                        onPress={handleAttachImageFromCamera}
                        style={styles.attachButton}
                      >
                        {t('camera')}
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
                </ScrollView>
              </Card.Content>
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
            <View style={styles.urlInputWrapper}>
              <Text style={styles.urlInputLabel}>https://</Text>
              <TextInput
                value={attachmentUrl}
                onChangeText={handleUrlInputChange}
                style={styles.urlInputField}
                placeholder="example.com"
                autoCapitalize="none"
                keyboardType="url"
                autoFocus
              />
            </View>
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
          <Modal
            visible={bulkAddModalVisible}
            onDismiss={() => {
              setBulkAddModalVisible(false);
              setBulkAddText('');
            }}
            contentContainerStyle={styles.bulkAddContainer}
          >
            <View style={styles.bulkAddHeader}>
              <Text style={styles.bulkAddTitle}>{t('bulkAddCards')}</Text>
              <View style={styles.bulkAddHeaderButtons}>
                <Button
                  onPress={() => {
                    setBulkAddModalVisible(false);
                    setBulkAddText('');
                  }}
                  textColor={OriginalTheme.colors.secondary}
                >
                  {t('cancel')}
                </Button>
                <Button mode="contained" onPress={handleBulkAdd}>
                  {t('create')}
                </Button>
              </View>
            </View>
            <TextInput
              value={bulkAddText}
              onChangeText={setBulkAddText}
              style={styles.bulkAddTextInput}
              placeholder={t('bulkAddPlaceholder')}
              placeholderTextColor="#999"
              multiline
              numberOfLines={10}
              autoFocus
            />
          </Modal>
        </Portal>
      </SafeAreaView>
      <QRScannerModal
        visible={qrScannerVisible}
        onScan={handleQRScanned}
        onClose={() => setQrScannerVisible(false)}
      />
      <AudioRecorderModal
        visible={audioRecorderVisible}
        onSave={handleAudioRecorded}
        onClose={() => setAudioRecorderVisible(false)}
      />
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
  cutStatusBar: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 193, 7, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 200,
    elevation: 6,
  },
  sectionMapContainer: {
    position: 'absolute',
    right: 4,
    top: 40,
    maxHeight: '50%',
    maxWidth: 180,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    zIndex: 150,
    elevation: 3,
  },
  sectionMapContent: {
    paddingVertical: 4,
    paddingRight: 6,
  },
  sectionMapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  sectionMapCell: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#888',
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginRight: 6,
  },
  sectionMapCellActive: {
    backgroundColor: OriginalTheme.colors.primary,
    borderColor: OriginalTheme.colors.primary,
  },
  sectionMapLabel: {
    fontSize: 11,
    color: '#333',
    flexShrink: 1,
  },
  sectionMapLabelActive: {
    color: OriginalTheme.colors.primary,
    fontWeight: '600',
  },
  cutStatusText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
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
  fabLeftColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
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
  alignToolsContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    width: 220, // 4 FABs per row
    pointerEvents: 'box-none',
  },
  fabMenuContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
  },
  fabMenuQrRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  fabMenuBottomRow: {
    flexDirection: 'row',
  },
  alignToolButton: {
    margin: 4,
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
    maxHeight: '90%',
    padding: 8,
  },
  editingScrollContent: {
    paddingBottom: 16,
  },
  editingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  editingHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  editingHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duplicateIconButton: {
    padding: 4,
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
  bulkAddContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '90%',
    alignSelf: 'center',
  },
  bulkAddHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  bulkAddTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  bulkAddHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulkAddTextInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    minHeight: 200,
    textAlignVertical: 'top',
  },
});

export default FlowEditorScreen;
