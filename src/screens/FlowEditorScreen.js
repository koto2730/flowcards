import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Alert,
  TextInput,
  Button,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Canvas,
  Path,
  Skia,
  Group,
  Text,
  Rect,
  useFont,
  Circle,
  DashPathEffect,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  getNodes,
  getEdges,
  insertNode,
  updateNode,
  deleteNode,
  insertEdge,
  deleteEdge,
  updateFlow,
  getFlows,
} from '../db';
import { Divider, FAB, Provider as PaperProvider } from 'react-native-paper';
import OriginalTheme from './OriginalTheme'; // 既存のテーマをインポート

const CARD_MIN_SIZE = { width: 150, height: 70 };
const { width, height } = Dimensions.get('window');

const getRect = node => ({
  x: node.position.x,
  y: node.position.y,
  width: node.size.width,
  height: node.size.height,
});

const getCenter = node => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2,
});

const doRectsOverlap = (rect1, rect2) => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

const getHandlePosition = (node, handleName) => {
  'worklet';
  const { x, y } = node.position;
  const { width, height } = node.size;
  if (!node || !node.position || !node.size) {
    return { x: 0, y: 0 }; // ← 防御的にデフォルト値
  }
  switch (handleName) {
    case 'handleTop':
      return { x: x + width / 2, y: y };
    case 'handleBottom':
      return { x: x + width / 2, y: y + height };
    case 'handleLeft':
      return { x: x, y: y + height / 2 };
    case 'handleRight':
      return { x: x + width, y: y + height / 2 };
    default:
      return { x, y };
  }
};

const CalcSkiaEdgeStroke = ({ edge, sourceNode, targetNode }) => {
  const sourcePos = getHandlePosition(sourceNode, edge.sourceHandle);
  const targetPos = getHandlePosition(targetNode, edge.targetHandle);

  const startX = sourcePos.x;
  const startY = sourcePos.y;
  const endX = targetPos.x;
  const endY = targetPos.y;

  const dx = endX - startX;
  const dy = endY - startY;
  const curvature = 0.5;
  let c1x, c1y, c2x, c2y;

  if (edge.sourceHandle === 'handleRight') {
    c1x = startX + Math.abs(dx) * curvature;
    c1y = startY;
  } else if (edge.sourceHandle === 'handleLeft') {
    c1x = startX - Math.abs(dx) * curvature;
    c1y = startY;
  } else if (edge.sourceHandle === 'handleTop') {
    c1x = startX;
    c1y = startY - Math.abs(dy) * curvature;
  } else {
    c1x = startX;
    c1y = startY + Math.abs(dy) * curvature;
  }

  if (edge.targetHandle === 'handleRight') {
    c2x = endX + Math.abs(dx) * curvature;
    c2y = endY;
  } else if (edge.targetHandle === 'handleLeft') {
    c2x = endX - Math.abs(dx) * curvature;
    c2y = endY;
  } else if (edge.targetHandle === 'handleTop') {
    c2x = endX;
    c2y = endY - Math.abs(dy) * curvature;
  } else {
    c2x = endX;
    c2y = endY + Math.abs(dy) * curvature;
  }

  const skPath = Skia.Path.Make();
  skPath.moveTo(startX, startY);
  skPath.cubicTo(c1x, c1y, c2x, c2y, endX, endY);

  // Arrowhead
  const angle = Math.atan2(endY - c2y, endX - c2x);
  const arrowSize = 10;
  const arrowAngle = Math.PI / 6;

  const x1 = endX - arrowSize * Math.cos(angle - arrowAngle);
  const y1 = endY - arrowSize * Math.sin(angle - arrowAngle);
  skPath.moveTo(endX, endY);
  skPath.lineTo(x1, y1);

  const x2 = endX - arrowSize * Math.cos(angle + arrowAngle);
  const y2 = endY - arrowSize * Math.sin(angle + arrowAngle);
  skPath.moveTo(endX, endY);
  skPath.lineTo(x2, y2);

  return skPath;
};

const CalcSkiaInteractionEdgeStroke = ({ edge, sourceNode, targetNode }) => {
  const sourcePos = getHandlePosition(sourceNode, edge.sourceHandle);
  const targetPos = getHandlePosition(targetNode, edge.targetHandle);
  const skPath = Skia.Path.Make();
  skPath.moveTo(sourcePos.x, sourcePos.y);
  skPath.lineTo(targetPos.x, targetPos.y);
  return skPath;
};

// --- カードのヒット判定関数 ---
const isPointInCard = (node, x, y) => {
  'worklet';
  return (
    x >= node.position.x &&
    x <= node.position.x + node.size.width &&
    y >= node.position.y &&
    y <= node.position.y + node.size.height
  );
};

const isPointInDeleteButton = (node, x, y) => {
  'worklet';
  const deleteButtonRadius = 11;
  const deleteButtonCenterX = node.position.x + node.size.width;
  const deleteButtonCenterY = node.position.y;

  const dx = x - deleteButtonCenterX;
  const dy = y - deleteButtonCenterY;
  return dx * dx + dy * dy <= deleteButtonRadius * deleteButtonRadius;
};

// --- SkiaCardのイベント実装（Card.jsの内容を参考に） ---
const SkiaCard = ({
  node,
  fontTitleJP,
  fontDescriptionJP,
  fontTitleSC,
  fontDescriptionSC,
  isSelected,
  isLinkingMode,
  isLinkSource,
  isEditing,
  isSeeThroughParent,
}) => {
  const cardColor = isSelected ? '#E3F2FD' : 'white';
  const borderColor = isLinkSource ? '#34C759' : '#ddd';
  const titleColor = 'black';
  const descriptionColor = '#555';
  const deleteButtonColor = 'red';

  const deleteButtonRadius = 11;
  const deleteButtonX = node.position.x + node.size.width;
  const deleteButtonY = node.position.y;

  const crossPath = Skia.Path.Make();
  crossPath.moveTo(deleteButtonX - 5, deleteButtonY - 5);
  crossPath.lineTo(deleteButtonX + 5, deleteButtonY + 5);
  crossPath.moveTo(deleteButtonX + 5, deleteButtonY - 5);
  crossPath.lineTo(deleteButtonX - 5, deleteButtonY + 5);

  const borderPath = Skia.Path.Make();
  borderPath.addRect(
    Skia.XYWHRect(
      node.position.x,
      node.position.y,
      node.size.width,
      node.size.height,
    ),
  );

  return (
    <Group opacity={isEditing ? 0.5 : 1.0}>
      <Rect
        x={node.position.x}
        y={node.position.y}
        width={node.size.width}
        height={node.size.height}
        color={cardColor}
      />
      {isSeeThroughParent ? (
        <Path
          path={borderPath}
          style="stroke"
          strokeWidth={2}
          color={borderColor}
        >
          <DashPathEffect intervals={[4, 4]} />
        </Path>
      ) : (
        <Rect
          x={node.position.x}
          y={node.position.y}
          width={node.size.width}
          height={node.size.height}
          strokeWidth={2}
          style="stroke"
          strokeColor={borderColor}
        />
      )}
      {fontTitleJP && fontDescriptionJP && fontTitleSC && fontDescriptionSC && (
        <>
          <Text
            font={fontTitleJP}
            x={node.position.x + 10}
            y={node.position.y + 20}
            text={node.data.label ?? ''}
            color={titleColor}
          />
          <Text
            font={fontTitleSC}
            x={node.position.x + 10}
            y={node.position.y + 20}
            text={node.data.label ?? ''}
            color={titleColor}
          />
          {node.data.description && (
            <>
              <Text
                font={fontDescriptionJP}
                x={node.position.x + 10}
                y={node.position.y + 40}
                text={node.data.description}
                color={descriptionColor}
                maxWidth={node.size.width - 20}
              />
              <Text
                font={fontDescriptionSC}
                x={node.position.x + 10}
                y={node.position.y + 40}
                text={node.data.description}
                color={descriptionColor}
                maxWidth={node.size.width - 20}
              />
            </>
          )}
        </>
      )}
      <Group>
        <Circle
          cx={deleteButtonX}
          cy={deleteButtonY}
          r={deleteButtonRadius}
          color={deleteButtonColor}
        />
        <Path path={crossPath} style="stroke" strokeWidth={2} color="white" />
      </Group>
    </Group>
  );
};

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  // --- allNodesの防御 ---
  const [allNodes, setAllNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [parentIdHistory, setParentIdHistory] = useState([]);
  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const [linkingState, setLinkingState] = useState({
    active: false,
    sourceNodeId: null,
  });
  const [editingNode, setEditingNode] = useState(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const context = useSharedValue({ x: 0, y: 0 });
  const origin_x = useSharedValue(0);
  const origin_y = useSharedValue(0);

  // --- カード操作用のShared Values ---
  // アクティブな（操作対象の）カードID
  const activeNodeId = useSharedValue(null);
  // カードのドラッグ開始時の相対位置
  const dragStartOffset = useSharedValue({ x: 0, y: 0 });
  // カードの現在の位置
  const nodePosition = useSharedValue({ x: 0, y: 0 });

  const fontTitleJP = useFont(
    require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Bold.ttf'),
    16,
  );
  const fontDescriptionJP = useFont(
    require('../../assets/fonts/Noto_Sans_JP/static/NotoSansJP-Regular.ttf'),
    14,
  );
  const fontTitleSC = useFont(
    require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Bold.ttf'),
    16,
  );
  const fontDescriptionSC = useFont(
    require('../../assets/fonts/Noto_Sans_SC/static/NotoSansSC-Regular.ttf'),
    14,
  );

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

  // fetchDataなどでsetAllNodesする際に必ず配列を渡す
  const fetchData = useCallback(async () => {
    try {
      const nodesData = await getNodes(flowId);
      const edgesData = await getEdges(flowId);

      const formattedNodes = Array.isArray(nodesData)
        ? nodesData.map(n => ({
            id: n.id,
            parentId: n.parentId,
            data: { label: n.label ?? '', description: n.description ?? '' },
            position: { x: n.x, y: n.y },
            size: { width: n.width, height: n.height },
          }))
        : [];
      setAllNodes(Array.isArray(formattedNodes) ? formattedNodes : []);
      setEdges(Array.isArray(edgesData) ? edgesData : []);
    } catch (error) {
      setAllNodes([]); // ← 失敗時も空配列
      setEdges([]); // ← 失敗時も空配列
      console.error('Failed to fetch data:', error);
      Alert.alert('Error', 'Failed to load flow data.');
    }
  }, [flowId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    navigation.setOptions({
      title: flowName || 'Flow',
      headerStyle: { backgroundColor: OriginalTheme.colors.primary },
      headerTintColor: '#fff',
    });
  }, [navigation, flowName]);

  // setAllNodesを使う全ての箇所で防御
  const handleUpdateNode = async (nodeId, newData) => {
    try {
      await updateNode(nodeId, {
        label: newData.title,
        description: newData.description,
      });
      setAllNodes(nds =>
        Array.isArray(nds)
          ? nds.map(node =>
              node.id === nodeId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      label: newData.title ?? '',
                      description: newData.description ?? '',
                    },
                  }
                : node,
            )
          : [],
      );
    } catch (error) {
      console.error('Failed to update node data:', error);
    }
  };

  const onDragEnd = async (nodeId, newPosition) => {
    if (isSeeThrough) return;
    try {
      await updateNode(nodeId, { x: newPosition.x, y: newPosition.y });
      setAllNodes(nds =>
        Array.isArray(nds)
          ? nds.map(node =>
              node.id === nodeId ? { ...node, position: newPosition } : node,
            )
          : [],
      );
    } catch (error) {
      console.error('Failed to update node position:', error);
    }
  };

  // displayNodesのuseMemoも防御
  const displayNodes = useMemo(() => {
    // --- allNodesが配列でない場合、クラッシュを避けるために空配列を返す ---
    if (!Array.isArray(allNodes)) {
      return [];
    }
    const baseNodes = allNodes.filter(
      node => node.parentId === currentParentId,
    );

    if (!isSeeThrough) {
      const newMap = baseNodes.map(n => ({ ...n, zIndex: 1 }));
      return Array.isArray(newMap) ? newMap : [];
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

    const topLevelNodes = [];
    const childrenByParent = new Map();
    const originalNodesMap = new Map();

    workingNodes.forEach(node => {
      originalNodesMap.set(node.id, JSON.parse(JSON.stringify(node)));
      const children = allNodesCopy.filter(n => n.parentId === node.id);
      if (children.length > 0) {
        const minX = Math.min(...children.map(c => c.position.x));
        const minY = Math.min(...children.map(c => c.position.y));

        const arrangedChildren = children.map(child => {
          const newX = node.position.x + PADDING + (child.position.x - minX);
          const newY =
            node.position.y + TITLE_HEIGHT + (child.position.y - minY);
          return {
            ...child,
            position: { x: newX, y: newY },
          };
        });

        const maxChildX = Math.max(
          ...arrangedChildren.map(
            c => c.position.x - node.position.x + c.size.width,
          ),
        );
        const maxChildY = Math.max(
          ...arrangedChildren.map(
            c => c.position.y - node.position.y + c.size.height,
          ),
        );

        const calculatedParentWidth = Math.max(
          node.size.width,
          maxChildX + PADDING,
        );
        const calculatedParentHeight = Math.max(
          node.size.height,
          maxChildY + PADDING,
        );

        node.size = {
          width: calculatedParentWidth,
          height: calculatedParentHeight,
        };
        node.isSeeThroughParent = true;
        node.zIndex = 1;
        childrenByParent.set(node.id, arrangedChildren);
      } else {
        node.isSeeThroughParent = false;
        node.zIndex = 1;
      }
      topLevelNodes.push(node);
    });

    let changed = true;
    const MAX_ITERATIONS = 100;
    let iterations = 0;

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      for (let i = 0; i < topLevelNodes.length; i++) {
        for (let j = i + 1; j < topLevelNodes.length; j++) {
          const nodeA = topLevelNodes[i];
          const nodeB = topLevelNodes[j];

          if (doRectsOverlap(getRect(nodeA), getRect(nodeB))) {
            changed = true;

            const overlapX =
              Math.min(
                nodeA.position.x + nodeA.size.width,
                nodeB.position.x + nodeB.size.width,
              ) - Math.max(nodeA.position.x, nodeB.position.x);
            const overlapY =
              Math.min(
                nodeA.position.y + nodeA.size.height,
                nodeB.position.y + nodeB.size.height,
              ) - Math.max(nodeA.position.y, nodeB.position.y);

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

    const finalNodes = [...topLevelNodes];

    topLevelNodes.forEach(adjustedParent => {
      if (childrenByParent.has(adjustedParent.id)) {
        const originalParent = originalNodesMap.get(adjustedParent.id);
        const children = childrenByParent.get(adjustedParent.id);

        const dx = adjustedParent.position.x - originalParent.position.x;
        const dy = adjustedParent.position.y - originalParent.position.y;

        const adjustedChildren = children.map(child => ({
          ...child,
          position: {
            x: child.position.x + dx,
            y: child.position.y + dy,
          },
          zIndex: 10,
        }));
        finalNodes.push(...adjustedChildren);
      }
    });

    return Array.isArray(finalNodes) ? finalNodes : [];
  }, [allNodes, currentParentId, isSeeThrough, edges]);

  // --- 1. worklet関数を通常関数に変更し、内部でPromise処理に統一 ---
  // --- 2. runOnJSで呼ぶように修正（runOnJSはPromiseを返さないように） ---

  // 例：handleDeleteNode
  const handleDeleteNode = async nodeId => {
    const nodesToRemove = new Set();
    const findChildren = id => {
      nodesToRemove.add(id);
      allNodes.forEach(n => {
        if (n.parentId === id) {
          findChildren(n.id);
        }
      });
    };
    findChildren(nodeId);

    try {
      await Promise.all(Array.from(nodesToRemove).map(id => deleteNode(id)));
      fetchData();
    } catch (error) {
      console.error('Failed to delete node(s):', error);
    }
  };

  const getClosestHandle = (sourceNode, targetNode) => {
    const sourceCenter = getCenter(sourceNode);
    const targetCenter = getCenter(targetNode);

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    let candidateHandles = [];
    if (Math.abs(dy) > Math.abs(dx)) {
      // 主に垂直方向
      candidateHandles = ['handleTop', 'handleBottom'];
    } else {
      // 主に水平方向
      candidateHandles = ['handleLeft', 'handleRight'];
    }

    let minDistance = Infinity;
    let closestHandle = null;

    candidateHandles.forEach(handleName => {
      const handlePos = getHandlePosition(sourceNode, handleName);
      const distance = Math.sqrt(
        Math.pow(handlePos.x - targetCenter.x, 2) +
          Math.pow(handlePos.y - targetCenter.y, 2),
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestHandle = handleName;
      }
    });
    return closestHandle;
  };

  // 例：handleDoubleClick
  const handleDoubleClick = nodeId => {
    if (isSeeThrough || linkingState.active) return;
    const node = allNodes.find(n => n.id === nodeId);
    if (node) {
      setParentIdHistory(history => [...history, currentParentId]);
      setCurrentParentId(nodeId);
    }
  };

  // 例：handleSectionUp
  const handleSectionUp = async () => {
    if (isSeeThrough || linkingState.active) return;
    if (parentIdHistory.length > 0) {
      const newHistory = [...parentIdHistory];
      const lastParentId = newHistory.pop();
      setParentIdHistory(newHistory);
      setCurrentParentId(lastParentId);
    } else {
      if (displayNodes.length === 0) return;

      const newParentId = uuidv4();
      const screenCenterX = (width / 2 - translateX.value) / scale.value;
      const screenCenterY = (height / 2 - translateY.value) / scale.value;

      const newParentNode = {
        id: newParentId,
        flowId: flowId,
        parentId: 'root',
        label: '新しいセクション',
        description: 'グループ化されました',
        x: screenCenterX - CARD_MIN_SIZE.width / 2,
        y: screenCenterY - CARD_MIN_SIZE.height / 2,
        width: CARD_MIN_SIZE.width,
        height: CARD_MIN_SIZE.height,
      };

      try {
        await insertNode(newParentNode);
        const childrenIds = displayNodes.map(n => n.id);
        await Promise.all(
          childrenIds.map(id => updateNode(id, { parentId: newParentId })),
        );
        fetchData();
      } catch (error) {
        console.error('Failed to create section:', error);
      }
    }
  };

  // 例：handleDeleteEdge
  const handleDeleteEdge = async edgeId => {
    try {
      await deleteEdge(edgeId);
      setEdges(eds => eds.filter(edge => edge.id !== edgeId));
    } catch (error) {
      console.error('Failed to delete edge:', error);
    }
  };

  // 例：handleCardTap
  const handleCardTap = async nodeId => {
    if (!linkingState.active) return;

    if (!linkingState.sourceNodeId) {
      setLinkingState({ active: true, sourceNodeId: nodeId });
    } else {
      if (linkingState.sourceNodeId === nodeId) {
        setLinkingState({ active: true, sourceNodeId: null });
        return;
      }

      const sourceNode = allNodes.find(n => n.id === linkingState.sourceNodeId);
      const targetNode = allNodes.find(n => n.id === nodeId);

      if (sourceNode && targetNode) {
        const existingEdge = edges.find(
          edge =>
            (edge.source === linkingState.sourceNodeId &&
              edge.target === nodeId) ||
            (edge.source === nodeId &&
              edge.target === linkingState.sourceNodeId),
        );

        if (!existingEdge) {
          const sourceHandle = getClosestHandle(sourceNode, targetNode);
          const targetHandle = getClosestHandle(targetNode, sourceNode);

          const newEdge = {
            id: uuidv4(),
            flowId: flowId,
            source: linkingState.sourceNodeId,
            target: nodeId,
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            type: 'default',
          };
          try {
            await insertEdge(newEdge);
            setEdges(eds => [...eds, newEdge]);
          } catch (error) {
            console.error('Failed to add edge:', error);
          }
        }
        setLinkingState({ active: true, sourceNodeId: null });
      }
    }
  };

  const toggleLinkingMode = () => {
    setLinkingState(prev => ({ active: !prev.active, sourceNodeId: null }));
  };

  // --- イベント管理用のstate ---
  const [pendingEvent, setPendingEvent] = useState(null);
  // pendingEvent: { type: 'tap'|'doubleTap'|'dragEnd'|'longPress'|'delete', nodeId, extra }

  useEffect(() => {
    if (!pendingEvent) return;

    const { type, nodeId, extra } = pendingEvent;

    const run = async () => {
      if (type === 'tap') {
        await handleCardTap(nodeId);
      } else if (type === 'doubleTap') {
        handleDoubleClick(nodeId);
      } else if (type === 'dragEnd') {
        await onDragEnd(nodeId, extra?.newPosition);
      } else if (type === 'delete') {
        await handleDeleteNode(nodeId);
      }
    };

    run();
    setPendingEvent(null);
  }, [pendingEvent]);

  const panGesture = Gesture.Pan()
    .onStart(event => {
      const worldX = Number.isFinite(event.x - translateX.value)
        ? (event.x - translateX.value) / scale.value
        : 0;
      const worldY = Number.isFinite(event.y - translateY.value)
        ? (event.y - translateY.value) / scale.value
        : 0;
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
        // ドラッグ終了イベントをキック
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
      translateX.value = context.value.focalX - origin_x.value * newScale;
      translateY.value = context.value.focalY - origin_y.value * newScale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .enabled(!linkingState.active);

  const tapGesture = Gesture.Tap().onEnd((event, success) => {
    if (success) {
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;

      // 削除ボタン
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

      // カードタップ
      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode) {
        runOnJS(setPendingEvent)({
          type: 'tap',
          nodeId: hitNode.id,
        });
      } else {
        // エッジタップ（必要なら追加）
        if (linkingState.active) {
          runOnJS(checkForEdgeTap)({ x: worldX, y: worldY });
        }
      }
    }
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(800)
    .onStart(event => {
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      if (!Array.isArray(displayNodes)) return;
      const hitNode = [...displayNodes]
        .reverse()
        .find(node => isPointInCard(node, worldX, worldY));
      if (hitNode) {
        runOnJS(setEditingNode)({
          id: hitNode.id,
          title: hitNode.data.label,
          description: hitNode.data.description,
        });
      }
    });

  // ダブルタップ（GestureHandlerでDoubleTapは独立して扱う必要あり）
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
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
    { translateX: Number.isFinite(translateX.value) ? translateX.value : 0 },
    { translateY: Number.isFinite(translateY.value) ? translateY.value : 0 },
    { scale: Number.isFinite(scale.value) ? scale.value : 1 },
  ]);

  const skiaOrigin = useDerivedValue(() => ({
    x: Number.isFinite(origin_x.value) ? origin_x.value : 0,
    y: Number.isFinite(origin_y.value) ? origin_y.value : 0,
  }));

  const composedGesture = Gesture.Exclusive(
    Gesture.Simultaneous(panGesture, pinchGesture),
    doubleTapGesture,
    longPressGesture,
    tapGesture,
  );

  const addCard = async () => {
    const newNodeData = {
      id: uuidv4(),
      flowId: flowId,
      parentId: currentParentId,
      label: '新しいカード',
      description: '',
      x: (10 - translateX.value) / scale.value,
      y: (10 - translateY.value) / scale.value,
      width: CARD_MIN_SIZE.width,
      height: CARD_MIN_SIZE.height,
    };
    try {
      await insertNode(newNodeData);
      fetchData();
    } catch (error) {
      console.error('Failed to add node:', error);
    }
  };

  const checkForEdgeTap = point => {
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
          handleDeleteEdge(edge.id);
          return;
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
          handleDeleteEdge(edge.id);
          return;
        }
      }
    }
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
          {/* Path for interaction (wider, transparent) */}
          <Path
            path={interactionPath}
            style="stroke"
            strokeWidth={15}
            color="transparent"
          />
          {/* Visible path */}
          <Path path={path} style="stroke" strokeWidth={2} color="black" />
        </Group>
      );
    });
  };

  const handleSaveEditingNode = () => {
    if (editingNode) {
      handleUpdateNode(editingNode.id, {
        title: editingNode.title,
        description: editingNode.description,
      });
      setEditingNode(null);
    }
  };

  const fabDisabled = isSeeThrough || linkingState.active || !!editingNode;

  const resetScale = () => {
    'worklet';
    const newScale = 1;
    const newTranslateX = width / 2 - (width / 2 - translateX.value);
    const newTranslateY = height / 2 - (height / 2 - translateY.value);

    scale.value = withTiming(newScale, { duration: 300 });
    translateX.value = withTiming(newTranslateX, { duration: 300 });
    translateY.value = withTiming(newTranslateY, { duration: 300 });
    savedScale.value = newScale;
    savedTranslateX.value = newTranslateX;
    savedTranslateY.value = newTranslateY;
  };

  const scaleText = useDerivedValue(() => {
    return `${Math.round(scale.value)}`;
  });

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
            icon={isSeeThrough ? 'eye' : 'eye-off'}
            style={[styles.fab, styles.fabEye]}
            onPress={() => setIsSeeThrough(s => !s)}
            disabled={linkingState.active}
            small
            visible={true}
          />
          <FAB
            icon="arrow-up-bold"
            style={[styles.fab, styles.fabTop]}
            onPress={handleSectionUp}
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
            onPress={addCard}
            disabled={fabDisabled}
            small
            visible={true}
          />
        </View>
        <GestureDetector gesture={composedGesture}>
          <View style={styles.flowArea}>
            <Canvas style={StyleSheet.absoluteFill}>
              <Group transform={skiaTransform} origin={skiaOrigin}>
                {renderEdges()}
                {displayNodes.map(node => (
                  <SkiaCard
                    key={node.id}
                    node={node}
                    fontTitleJP={fontTitleJP}
                    fontDescriptionJP={fontDescriptionJP}
                    fontTitleSC={fontTitleSC}
                    fontDescriptionSC={fontDescriptionSC}
                    isSelected={linkingState.sourceNodeId === node.id}
                    isLinkingMode={linkingState.active}
                    isLinkSource={linkingState.sourceNodeId === node.id}
                    isEditing={editingNode && editingNode.id === node.id}
                    isSeeThroughParent={node.isSeeThroughParent}
                  />
                ))}
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
                placeholder="Title"
                autoFocus
              />
              <TextInput
                value={editingNode.description}
                onChangeText={text =>
                  setEditingNode(prev => ({ ...prev, description: text }))
                }
                style={styles.input}
                placeholder="Description"
                multiline
              />
              <View style={styles.buttonContainer}>
                <Button title="保存" onPress={handleSaveEditingNode} />
                <Button
                  title="キャンセル"
                  onPress={() => setEditingNode(null)}
                  color="gray"
                />
              </View>
            </View>
          </KeyboardAvoidingView>
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
});

export default FlowEditorScreen;
