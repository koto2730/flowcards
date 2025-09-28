import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TextInput,
  Button,
  KeyboardAvoidingView,
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
import { updateFlow, getFlows } from '../db';
import { Divider, FAB, Provider as PaperProvider } from 'react-native-paper';
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

const { width, height } = Dimensions.get('window');

const FlowEditorScreen = ({ route, navigation }) => {
  const { flowId, flowName } = route.params;
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
  } = useFlowData(flowId, isSeeThrough);

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
        runOnJS(setEditingNode)({
          id: hitNode.id,
          title: hitNode.data.label,
          description: hitNode.data.description,
        });
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

  const handleSaveEditingNode = () => {
    if (editingNode) {
      handleUpdateNodeData(editingNode.id, {
        title: editingNode.title,
        description: editingNode.description,
      });
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
