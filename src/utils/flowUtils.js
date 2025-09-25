import { Skia } from '@shopify/react-native-skia';

export const getRect = node => ({
  x: node.position.x,
  y: node.position.y,
  width: node.size.width,
  height: node.size.height,
});

export const getCenter = node => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2,
});

export const doRectsOverlap = (rect1, rect2) => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

export const getHandlePosition = (node, handleName) => {
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

export const CalcSkiaEdgeStroke = ({ edge, sourceNode, targetNode }) => {
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

  if (edge.type === 'bidirectional') {
    const startAngle = Math.atan2(c1y - startY, c1x - startX);
    const sx1 = startX + arrowSize * Math.cos(startAngle - arrowAngle);
    const sy1 = startY + arrowSize * Math.sin(startAngle - arrowAngle);
    skPath.moveTo(startX, startY);
    skPath.lineTo(sx1, sy1);
    const sx2 = startX + arrowSize * Math.cos(startAngle + arrowAngle);
    const sy2 = startY + arrowSize * Math.sin(startAngle + arrowAngle);
    skPath.moveTo(startX, startY);
    skPath.lineTo(sx2, sy2);
  }

  return skPath;
};

export const CalcSkiaInteractionEdgeStroke = ({ edge, sourceNode, targetNode }) => {
  const sourcePos = getHandlePosition(sourceNode, edge.sourceHandle);
  const targetPos = getHandlePosition(targetNode, edge.targetHandle);
  const skPath = Skia.Path.Make();
  skPath.moveTo(sourcePos.x, sourcePos.y);
  skPath.lineTo(targetPos.x, targetPos.y);
  return skPath;
};

// --- カードのヒット判定関数 ---
export const isPointInCard = (node, x, y) => {
  'worklet';
  return (
    x >= node.position.x &&
    x <= node.position.x + node.size.width &&
    y >= node.position.y &&
    y <= node.position.y + node.size.height
  );
};

export const isPointInDeleteButton = (node, x, y) => {
  'worklet';
  const deleteButtonRadius = 11;
  const deleteButtonCenterX = node.position.x + node.size.width;
  const deleteButtonCenterY = node.position.y;

  const dx = x - deleteButtonCenterX;
  const dy = y - deleteButtonCenterY;
  return dx * dx + dy * dy <= deleteButtonRadius * deleteButtonRadius;
};

export const getClosestHandle = (sourceNode, targetNode) => {
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