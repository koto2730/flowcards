import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  updateFlow,
  getFlows,
  getAttachmentByNodeId,
  insertAttachment,
  deleteAttachment,
  updateNode,
  insertNode,
} from '../db';
import RNFS from 'react-native-fs';
import { Provider as PaperProvider } from 'react-native-paper';
import OriginalTheme from './OriginalTheme';
import SkiaCard from '../components/Card';
import FloatingActionButtons from '../components/FloatingActionButtons';
import EditorModal from '../components/EditorModal';
import ColorPickerModal from '../components/ColorPickerModal';
import UrlInputModal from '../components/UrlInputModal';
import CanvasRenderer from '../components/CanvasRenderer';
import {
  getCenter,
  getHandlePosition,
  CalcSkiaEdgeStroke,
  CalcSkiaInteractionEdgeStroke,
  isPointInCard,
  isPointInDeleteButton,
  processNodes,
  doRectsOverlap,
  getRect,
} from '../utils/flowUtils';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { useAttachmentManager } from '../hooks/useAttachmentManager';
import { useTranslation } from 'react-i18next';
import { useGestures } from '../hooks/useGestures';
import { getTextColorForBackground } from '../utils/colorUtils';
import { ATTACHMENT_DIR } from '../constants/fileSystem';

import { FlowProvider, useFlowContext } from '../contexts/FlowContext';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const { width, height } = Dimensions.get('window');

const FlowEditorContent = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  const { t } = useTranslation();

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

  const {
    allNodes,
    edges,
    linkingState,
    setLinkingState,
    isDataLoaded,
    addNode,
    deleteNode,
    updateNodePosition,
    updateNodeData,
    addEdge,
    deleteEdge,
    dispatch,
    openEditor,
    editingNode,
    currentParentId,
    parentIdHistory,
    goIntoNode,
    goBack,
  } = useFlowContext();

  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const [alignModeOpen, setAlignModeOpen] = useState(false);

  const displayNodes = useMemo(() => {
    if (!Array.isArray(allNodes)) {
      return [];
    }
    const baseNodes = allNodes.filter(node => node.parentId === currentParentId);

    if (!isSeeThrough) {
      return baseNodes.map(n => ({ ...n, zIndex: 1 }));
    }

    const PADDING = 20;
    const TITLE_HEIGHT = 40;
    const CARD_SPACING = 20;

    const workingNodes = JSON.parse(JSON.stringify(baseNodes));
    const allNodesCopy = JSON.parse(JSON.stringify(allNodes));

    const initialCenters = new Map();
    workingNodes.forEach(node => {
      initialCenters.set(node.id, {
        x: node.position.x + node.size.width / 2,
        y: node.position.y + node.size.height / 2,
      });
    });

    const childrenByParent = new Map();
    const originalNodesMap = new Map();

    workingNodes.forEach(node => {
      originalNodesMap.set(node.id, JSON.parse(JSON.stringify(node)));
      const children = allNodesCopy.filter(n => n.parentId === node.id);
      if (children.length > 0) {
        const minX = Math.min(...children.map(c => c.position.x));
        const minY = Math.min(...children.map(c => c.position.y));

        const arrangedChildren = children.map(child => ({
          ...child,
          position: {
            x: node.position.x + PADDING + (child.position.x - minX),
            y: node.position.y + TITLE_HEIGHT + (child.position.y - minY),
          },
        }));

        const maxChildX = Math.max(...arrangedChildren.map(c => c.position.x - node.position.x + c.size.width));
        const maxChildY = Math.max(...arrangedChildren.map(c => c.position.y - node.position.y + c.size.height));

        node.size = {
          width: Math.max(node.size.width, maxChildX + PADDING),
          height: Math.max(node.size.height, maxChildY + PADDING),
        };
        node.isSeeThroughParent = true;
        node.zIndex = 1;
        childrenByParent.set(node.id, arrangedChildren);
      } else {
        node.isSeeThroughParent = false;
        node.zIndex = 1;
      }
    });

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
      changed = false;
      iterations++;
      for (let i = 0; i < workingNodes.length; i++) {
        for (let j = i + 1; j < workingNodes.length; j++) {
          const nodeA = workingNodes[i];
          const nodeB = workingNodes[j];
          if (doRectsOverlap(getRect(nodeA), getRect(nodeB))) {
            changed = true;
            const overlapX = Math.min(nodeA.position.x + nodeA.size.width, nodeB.position.x + nodeB.size.width) - Math.max(nodeA.position.x, nodeB.position.x);
            const overlapY = Math.min(nodeA.position.y + nodeA.size.height, nodeB.position.y + nodeB.size.height) - Math.max(nodeA.position.y, nodeB.position.y);
            const initialCenterA = initialCenters.get(nodeA.id);
            const initialCenterB = initialCenters.get(nodeB.id);
            const initialDx = initialCenterB.x - initialCenterA.x;
            const initialDy = initialCenterB.y - initialCenterA.y;
            if (overlapX < overlapY) {
              const move = (overlapX + CARD_SPACING) / 2;
              if (initialDx > 0) {
                nodeA.position.x -= move;
                nodeB.position.x += move;
              } else {
                nodeA.position.x += move;
                nodeB.position.x -= move;
              }
            } else {
              const move = (overlapY + CARD_SPACING) / 2;
              if (initialDy > 0) {
                nodeA.position.y -= move;
                nodeB.position.y += move;
              } else {
                nodeA.position.y += move;
                nodeB.position.y -= move;
              }
            }
          }
        }
      }
    }

    const finalNodes = [...workingNodes];
    workingNodes.forEach(adjustedParent => {
      if (childrenByParent.has(adjustedParent.id)) {
        const originalParent = originalNodesMap.get(adjustedParent.id);
        const children = childrenByParent.get(adjustedParent.id);
        const dx = adjustedParent.position.x - originalParent.position.x;
        const dy = adjustedParent.position.y - originalParent.position.y;
        const adjustedChildren = children.map(child => ({
          ...child,
          position: { x: child.position.x + dx, y: child.position.y + dy },
          zIndex: 10,
        }));
        finalNodes.push(...adjustedChildren);
      }
    });

    return finalNodes;
  }, [allNodes, currentParentId, isSeeThrough]);

  const {
    translateX,
    translateY,
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    context,
    origin_x,
    origin_y,
    skiaTransform,
    skiaOrigin,
    resetScale,
    moveToNearestCard,
  } = useCanvasTransform(displayNodes);

  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [showAttachmentsOnCanvas, setShowAttachmentsOnCanvas] = useState(false);

  const {
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
  } = useAttachmentManager();

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
    });
  }, [navigation, flowName]);

  const [pendingEvent, setPendingEvent] = useState(null);

  const handleCardTap = useCallback(
    async nodeId => {
      if (linkingState.active) {
        const { startNode } = linkingState;
        if (!startNode) {
          setLinkingState({ ...linkingState, startNode: nodeId });
        } else if (startNode !== nodeId) {
          await addEdge(startNode, nodeId);
          setLinkingState({ ...linkingState, startNode: null });
        }
      } else {
        const newSelectedIds = new Set(linkingState.selectedNodeIds);
        if (newSelectedIds.has(nodeId)) {
          newSelectedIds.delete(nodeId);
        } else {
          newSelectedIds.add(nodeId);
        }
        setLinkingState({ ...linkingState, selectedNodeIds: newSelectedIds });
      }
    },
    [linkingState, addEdge, setLinkingState],
  );

  const handleDeleteEdge = useCallback(
    async edgeId => {
      await deleteEdge(edgeId);
    },
    [deleteEdge],
  );

  useEffect(() => {
    if (!pendingEvent) return;

    const { type, nodeId, extra } = pendingEvent;

    const run = async () => {
      if (type === 'tap') {
        await handleCardTap(nodeId);
      } else if (type === 'doubleTap') {
        goIntoNode(nodeId);
      } else if (type === 'dragEnd') {
        await updateNodePosition(nodeId, extra?.newPosition);
      } else if (type === 'delete') {
        await deleteNode(nodeId);
      } else if (type === 'edgeTap') {
        await handleDeleteEdge(nodeId);
      }
    };

    run();
    setPendingEvent(null);
  }, [
    pendingEvent,
    handleCardTap,
    goIntoNode,
    updateNodePosition,
    deleteNode,
    handleDeleteEdge,
  ]);

  const handleNodeLongPress = useCallback(
    hitNode => {
      openEditor(hitNode.id);
    },
    [openEditor],
  );

  const { composedGesture, pressState } = useGestures({
    translateX,
    translateY,
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    context,
    origin_x,
    origin_y,
    displayNodes,
    edges,
    linkingState,
    isSeeThrough,
    setPendingEvent,
    handleNodeLongPress,
    dispatch,
  });

  const handlePressSectionUp = useCallback(async () => {
    if (isSeeThrough || linkingState.active) return;
    if (parentIdHistory.length > 0) {
      goBack();
    } else {
      const screenCenter = {
        x: (width / 2 - translateX.value) / scale.value,
        y: (height / 2 - translateY.value) / scale.value,
      };
      if (displayNodes.length === 0) return;

      const newParentId = uuidv4();
      const newParentNode = {
        id: newParentId,
        flowId: flowId,
        parentId: 'root',
        label: t('newSection'),
        description: t('grouped'),
        x: screenCenter.x - 150 / 2,
        y: screenCenter.y - 85 / 2,
        width: 150,
        height: 85,
      };

      try {
        await insertNode(newParentNode);
        const childrenIds = displayNodes.map(n => n.id);
        await Promise.all(
          childrenIds.map(id => updateNode(id, { parentId: newParentId })),
        );
        await addNode(newParentNode.position, 'root'); // Re-fetch data
      } catch (error) {
        console.error('Failed to create section:', error);
      }
    }
  }, [isSeeThrough, linkingState.active, parentIdHistory, goBack, displayNodes, translateX, translateY, scale, flowId, t, addNode]);

  const handleAlign = useCallback(async (alignment) => {
    const selectedIds = Array.from(linkingState.selectedNodeIds);
    if (selectedIds.length < 2) return;

    const selectedNodes = allNodes.filter(node => selectedIds.includes(node.id));
    let newNodes = [...allNodes];
    const originalPositions = new Map(newNodes.map(n => [n.id, { ...n.position }]));

    switch (alignment) {
      case 'top': {
        const minY = Math.min(...selectedNodes.map(n => n.position.y));
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, y: minY } } : n);
        break;
      }
      case 'middle': {
        const avgY = selectedNodes.reduce((sum, n) => sum + n.position.y + n.size.height / 2, 0) / selectedNodes.length;
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, y: avgY - n.size.height / 2 } } : n);
        break;
      }
      case 'bottom': {
        const maxY = Math.max(...selectedNodes.map(n => n.position.y + n.size.height));
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, y: maxY - n.size.height } } : n);
        break;
      }
      case 'left': {
        const minX = Math.min(...selectedNodes.map(n => n.position.x));
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, x: minX } } : n);
        break;
      }
      case 'center': {
        const avgX = selectedNodes.reduce((sum, n) => sum + n.position.x + n.size.width / 2, 0) / selectedNodes.length;
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, x: avgX - n.size.width / 2 } } : n);
        break;
      }
      case 'right': {
        const maxX = Math.max(...selectedNodes.map(n => n.position.x + n.size.width));
        newNodes = newNodes.map(n => selectedIds.includes(n.id) ? { ...n, position: { ...n.position, x: maxX - n.size.width } } : n);
        break;
      }
      case 'spread_h': {
        const sortedNodes = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
        const minX = sortedNodes[0].position.x;
        const maxX = sortedNodes[sortedNodes.length - 1].position.x + sortedNodes[sortedNodes.length - 1].size.width;
        const totalWidth = sortedNodes.reduce((sum, n) => sum + n.size.width, 0);
        const spacing = (maxX - minX - totalWidth) / (sortedNodes.length - 1);
        let currentX = minX;
        const nodeMap = new Map(newNodes.map(n => [n.id, n]));
        sortedNodes.forEach(node => {
          const nodeToUpdate = nodeMap.get(node.id);
          if (nodeToUpdate) {
            nodeToUpdate.position.x = currentX;
            currentX += nodeToUpdate.size.width + spacing;
          }
        });
        newNodes = Array.from(nodeMap.values());
        break;
      }
      case 'spread_v': {
        const sortedNodes = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
        const minY = sortedNodes[0].position.y;
        const maxY = sortedNodes[sortedNodes.length - 1].position.y + sortedNodes[sortedNodes.length - 1].size.height;
        const totalHeight = sortedNodes.reduce((sum, n) => sum + n.size.height, 0);
        const spacing = (maxY - minY - totalHeight) / (sortedNodes.length - 1);
        let currentY = minY;
        const nodeMap = new Map(newNodes.map(n => [n.id, n]));
        sortedNodes.forEach(node => {
          const nodeToUpdate = nodeMap.get(node.id);
          if (nodeToUpdate) {
            nodeToUpdate.position.y = currentY;
            currentY += nodeToUpdate.size.height + spacing;
          }
        });
        newNodes = Array.from(nodeMap.values());
        break;
      }
      default:
        break;
    }

    dispatch({ type: 'SET_NODES', payload: newNodes });

    const updates = newNodes
      .filter(n => {
        const originalPos = originalPositions.get(n.id);
        return selectedIds.includes(n.id) && originalPos && (n.position.x !== originalPos.x || n.position.y !== originalPos.y);
      })
      .map(node => updateNodePosition(node.id, node.position));

    await Promise.all(updates);
  }, [linkingState.selectedNodeIds, allNodes, dispatch, updateNodePosition]);


  const handleAddNode = () => {
    const position = {
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
    };
    addNode(position);
  };

  const fabDisabled = isSeeThrough || linkingState.active || !!editingNode;

  if (!isDataLoaded || !fontMgr) {
    return null; // Or a loading indicator
  }

  return (
    <PaperProvider theme={OriginalTheme}>
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        <FloatingActionButtons
          alignModeOpen={alignModeOpen}
          setAlignModeOpen={setAlignModeOpen}
          handleAlign={handleAlign}
          isSeeThrough={isSeeThrough}
          setIsSeeThrough={setIsSeeThrough}
          showAttachmentsOnCanvas={showAttachmentsOnCanvas}
          setShowAttachmentsOnCanvas={setShowAttachmentsOnCanvas}
          handlePressSectionUp={handlePressSectionUp}
          resetScale={resetScale}
          moveToNearestCard={moveToNearestCard}
          fabDisabled={fabDisabled}
        />
        <CanvasRenderer
          composedGesture={composedGesture}
          skiaTransform={skiaTransform}
          skiaOrigin={skiaOrigin}
          displayNodes={displayNodes}
          fontMgr={fontMgr}
          paperclipIconSvg={paperclipIconSvg}
          editingNode={editingNode}
          showAttachmentsOnCanvas={showAttachmentsOnCanvas}
          pressState={pressState}
          resolveAttachmentPath={resolveAttachmentPath}
        />
        <EditorModal
          setColorPickerVisible={setColorPickerVisible}
          setUrlInputVisible={setUrlInputVisible}
          handleAttachFile={() => handleAttachFile(editingNode, (node) => dispatch({ type: 'UPDATE_EDITING_NODE', payload: node }))}
          handleAttachImageFromLibrary={() =>
            handleAttachImageFromLibrary(editingNode, (node) => dispatch({ type: 'UPDATE_EDITING_NODE', payload: node }))
          }
          handleOpenAttachment={() => handleOpenAttachment(editingNode)}
          handleRemoveAttachment={() =>
            handleRemoveAttachment(editingNode, (node) => dispatch({ type: 'UPDATE_EDITING_NODE', payload: node }))
          }
          resolveAttachmentPath={resolveAttachmentPath}
        />
        <ColorPickerModal
          visible={colorPickerVisible}
          onClose={() => setColorPickerVisible(false)}
          node={editingNode}
          onColorChange={color => {
            dispatch({
              type: 'UPDATE_EDITING_NODE',
              payload: { ...editingNode, color },
            });
            setColorPickerVisible(false);
          }}
        />
        <UrlInputModal
          visible={urlInputVisible}
          onClose={() => {
            setUrlInputVisible(false);
            setAttachmentUrl('');
          }}
          attachmentUrl={attachmentUrl}
          onUrlChange={handleUrlInputChange}
          onSave={() => handleSaveUrlAttachment(editingNode, (node) => dispatch({ type: 'UPDATE_EDITING_NODE', payload: node }))}
        />
      </SafeAreaView>
    </PaperProvider>
  );
};

const FlowEditorScreen = props => {
  return (
    <FlowProvider flowId={props.route.params.flowId}>
      <FlowEditorContent {...props} />
    </FlowProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ... other styles
});

export default FlowEditorScreen;