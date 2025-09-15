import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Path, Skia, Group } from '@shopify/react-native-skia';
import Card from '../components/Card';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  useDerivedValue,
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
import { FAB, Provider as PaperProvider } from 'react-native-paper';
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

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
  const [allNodes, setAllNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [parentIdHistory, setParentIdHistory] = useState([]);
  const [isSeeThrough, setIsSeeThrough] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [linkingState, setLinkingState] = useState({
    active: false,
    sourceNodeId: null,
  });

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const context = useSharedValue({ x: 0, y: 0 });

  useEffect(() => {
    const loadPosition = async () => {
      try {
        const flows = await getFlows();
        const currentFlow = flows.find(f => f.id === flowId);
        if (currentFlow && currentFlow.lastPosition) {
          const position = JSON.parse(currentFlow.lastPosition);
          translateX.value = position.x;
          translateY.value = position.y;
          runOnJS(setPanOffset)({ x: position.x, y: position.y });
        }
      } catch (error) {
        console.error('Failed to load last position:', error);
      }
    };
    loadPosition();
  }, [flowId, translateX, translateY]);

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

  const fetchData = useCallback(async () => {
    try {
      const nodesData = await getNodes(flowId);
      const edgesData = await getEdges(flowId);

      const formattedNodes = nodesData.map(n => ({
        id: n.id,
        parentId: n.parentId,
        data: { label: n.label, description: n.description },
        position: { x: n.x, y: n.y },
        size: { width: n.width, height: n.height },
      }));
      setAllNodes(formattedNodes);
      setEdges(edgesData);
    } catch (error) {
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

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate(event => {
      translateX.value = context.value.x + event.translationX;
      translateY.value = context.value.y + event.translationY;
    })
    .onEnd(() => {
      runOnJS(setPanOffset)({ x: translateX.value, y: translateY.value });
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate(event => {
      const oldScale = scale.value;
      const newScale = savedScale.value * event.scale;
      if (newScale < 0.1) {
        return;
      }
      scale.value = newScale;

      if (oldScale > 0) {
        const scaleRatio = newScale / oldScale;
        translateX.value =
          event.focalX - (event.focalX - translateX.value) * scaleRatio;
        translateY.value =
          event.focalY - (event.focalY - translateY.value) * scaleRatio;
      }
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const displayNodes = useMemo(() => {
    const baseNodes = allNodes.filter(
      node => node.parentId === currentParentId,
    );

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

    return finalNodes;
  }, [allNodes, currentParentId, isSeeThrough, edges]);

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

  const onDragEnd = useCallback(
    async (nodeId, newPosition) => {
      if (isSeeThrough) return;
      try {
        await updateNode(nodeId, { x: newPosition.x, y: newPosition.y });
        setAllNodes(nds =>
          nds.map(node =>
            node.id === nodeId ? { ...node, position: newPosition } : node,
          ),
        );
      } catch (error) {
        console.error('Failed to update node position:', error);
      }
    },
    [isSeeThrough],
  );

  const handleDeleteNode = useCallback(
    async nodeId => {
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
    },
    [allNodes, fetchData],
  );

  const handleUpdateNode = useCallback(async (nodeId, newData) => {
    try {
      await updateNode(nodeId, {
        label: newData.title,
        description: newData.description,
      });
      setAllNodes(nds =>
        nds.map(node =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: newData.title,
                  description: newData.description,
                },
              }
            : node,
        ),
      );
    } catch (error) {
      console.error('Failed to update node data:', error);
    }
  }, []);

  const handleDoubleClick = useCallback(
    nodeId => {
      if (isSeeThrough) return;
      const node = allNodes.find(n => n.id === nodeId);
      if (node) {
        setParentIdHistory(history => [...history, currentParentId]);
        setCurrentParentId(nodeId);
      }
    },
    [allNodes, currentParentId, isSeeThrough],
  );

  const handleSectionUp = async () => {
    if (parentIdHistory.length > 0) {
      const newHistory = [...parentIdHistory];
      const lastParentId = newHistory.pop();
      setParentIdHistory(newHistory);
      setCurrentParentId(lastParentId);
    } else {
      if (displayNodes.length === 0) return;

      const newParentId = uuidv4();
      const newParentNode = {
        id: newParentId,
        flowId: flowId,
        parentId: 'root',
        label: '新しいセクション',
        description: 'グループ化されました',
        x: 100,
        y: 100,
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

  const handleDeleteEdge = useCallback(async edgeId => {
    try {
      await deleteEdge(edgeId);
      setEdges(eds => eds.filter(edge => edge.id !== edgeId));
    } catch (error) {
      console.error('Failed to delete edge:', error);
    }
  }, []);

  const getClosestHandle = (sourceNode, targetNode) => {
    const sourceCenter = getCenter(sourceNode);
    const targetCenter = getCenter(targetNode);

    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    let candidateHandles = [];
    if (Math.abs(dy) > Math.abs(dx)) {
      candidateHandles = ['handleTop', 'handleBottom'];
    } else {
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

  const checkForEdgeTap = useCallback(
    point => {
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
            runOnJS(handleDeleteEdge)(edge.id);
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
            runOnJS(handleDeleteEdge)(edge.id);
            return;
          }
        }
      }
    },
    [displayNodes, edges, handleDeleteEdge],
  );

  const tapGesture = Gesture.Tap().onEnd((event, success) => {
    if (success) {
      const worldX = (event.x - translateX.value) / scale.value;
      const worldY = (event.y - translateY.value) / scale.value;
      runOnJS(checkForEdgeTap)({ x: worldX, y: worldY });
    }
  });

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

  const fabDisabled = linkingState.active;

  return (
    <PaperProvider theme={OriginalTheme}>
      <SafeAreaView
        style={styles.container}
        edges={['bottom', 'left', 'right']}
      >
        <View pointerEvents="box-none" style={styles.fabContainer} zIndex={100}>
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
        <GestureDetector
          gesture={linkingState.active ? tapGesture : composedGesture}
        >
          <View style={styles.flowArea}>
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              {renderEdges()}
            </Canvas>
            <Animated.View style={animatedStyle}>
              {displayNodes.map(node => (
                <Card
                  key={node.id}
                  node_id={node.id}
                  title={node.data.label}
                  description={node.data.description}
                  position={node.position}
                  size={node.size}
                  onDragEnd={onDragEnd}
                  onDelete={handleDeleteNode}
                  onUpdate={handleUpdateNode}
                  onDoubleClick={handleDoubleClick}
                  onCardTap={handleCardTap}
                  isLinkingMode={linkingState.active}
                  isLinkSource={linkingState.sourceNodeId === node.id}
                  isSeeThrough={isSeeThrough}
                  zIndex={node.zIndex}
                />
              ))}
            </Animated.View>
          </View>
        </GestureDetector>
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
    backgroundColor: OriginalTheme.colors.secondary,
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
});

export default FlowEditorScreen;
