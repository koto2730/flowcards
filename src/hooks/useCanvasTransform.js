import { useSharedValue, useDerivedValue, withTiming } from 'react-native-reanimated';
import { Dimensions } from 'react-native';
import { getCenter } from '../utils/flowUtils';

const { width, height } = Dimensions.get('window');

export const useCanvasTransform = (displayNodes) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const context = useSharedValue({ x: 0, y: 0 });
  const origin_x = useSharedValue(0);
  const origin_y = useSharedValue(0);

  const skiaTransform = useDerivedValue(() => [
    { translateX: translateX.value },
    { translateY: translateY.value },
    { scale: scale.value },
  ]);

  const skiaOrigin = useDerivedValue(() => ({
    x: origin_x.value,
    y: origin_y.value,
  }));

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

  return {
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
  };
};
