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
  deleteAttachment,
} from '../db';
import RNFS from 'react-native-fs';
import Video from 'react-native-video';
import {
  Divider,
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
import FloatingActionButtons from '../components/FloatingActionButtons';
import {
  getCenter,
  getHandlePosition,
  CalcSkiaEdgeStroke,
  CalcSkiaInteractionEdgeStroke,
  isPointInCard,
  isPointInDeleteButton,
} from '../utils/flowUtils';
import { useFlowData } from '../hooks/useFlowData';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { useAttachmentManager } from '../hooks/useAttachmentManager';
import ColorPalette from 'react-native-color-palette';
import { useTranslation } from 'react-i18next';
import { getTextColorForBackground } from '../utils/colorUtils';
import { ATTACHMENT_DIR } from '../constants/fileSystem';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const { width, height } = Dimensions.get('window');

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
    handleUpdateNodeData,
    handleUpdateNodePosition,
    addNode,
    handleDeleteNode,
    handleDoubleClick,
    handleSectionUp,
    linkingState,
    setLinkingState,
    toggleLinkingMode,
    handleCardTap,
    handleDeleteEdge,
    clearNodeSelection,
  } = useFlowData(flowId, isSeeThrough, alignModeOpen, t);

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

  const [editingNode, setEditingNode] = useState(null);
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
  } = useAttachmentManager(editingNode, setEditingNode);

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
      // Start a timer to confirm the long press
      setTimeout(() => {
        if (pressState.value.id) {
          pressState.value = {
            id: pressState.value.id,
            state: 'confirmed',
          };
        }
      }, 800);
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
      node =>
        JSON.stringify(node.position) !== originalNodesMap.get(node.id),
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
          clearNodeSelection={clearNodeSelection}
          linkingState={linkingState}
          toggleLinkingMode={toggleLinkingMode}
          isSeeThrough={isSeeThrough}
          setIsSeeThrough={setIsSeeThrough}
          showAttachmentsOnCanvas={showAttachmentsOnCanvas}
          setShowAttachmentsOnCanvas={setShowAttachmentsOnCanvas}
          handlePressSectionUp={handlePressSectionUp}
          handleAddNode={handleAddNode}
          resetScale={resetScale}
          moveToNearestCard={moveToNearestCard}
          fabDisabled={fabDisabled}
          setLinkingState={setLinkingState}
        />
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
});

export default FlowEditorScreen;