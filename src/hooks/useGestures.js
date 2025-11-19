import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import {
  isPointInCard,
  isPointInDeleteButton,
  getHandlePosition,
} from '../utils/flowUtils';

export const useGestures = ({
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
}) => {
  const activeNodeId = useSharedValue(null);
  const pressState = useSharedValue({ id: null, state: 'idle' });
  const dragStartOffset = useSharedValue({ x: 0, y: 0 });
  const nodePosition = useSharedValue({ x: 0, y: 0 });

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
        runOnJS(dispatch)({
          type: 'UPDATE_NODE_POSITION_IMMEDIATE',
          payload: { nodeId: activeNodeId.value, position: newPosition },
        });
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

  return { composedGesture, pressState };
};