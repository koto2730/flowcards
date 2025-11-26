import { renderHook, act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { useCanvasTransform } from '../../src/hooks/useCanvasTransform';

// flowUtilsのgetCenterをモック
jest.mock('../../src/utils/flowUtils', () => ({
  getCenter: jest.fn((node) => ({
    x: node.position.x + node.size.width / 2,
    y: node.position.y + node.size.height / 2,
  })),
}));

describe('useCanvasTransform', () => {
  const mockNodes = [
    {
      id: '1',
      position: { x: 100, y: 100 },
      size: { width: 100, height: 100 },
    },
    {
      id: '2',
      position: { x: 500, y: 500 },
      size: { width: 100, height: 100 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // 画面サイズを固定: 375 x 812
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 812, scale: 2, fontScale: 2 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useCanvasTransform([]));

    expect(result.current.translateX.value).toBe(0);
    expect(result.current.translateY.value).toBe(0);
    expect(result.current.scale.value).toBe(1);
  });

  it('should reset scale and translation when resetScale is called', () => {
    const { result } = renderHook(() => useCanvasTransform([]));

    // 値を手動変更
    act(() => {
      result.current.translateX.value = 100;
      result.current.translateY.value = 100;
      result.current.scale.value = 2;
    });

    expect(result.current.translateX.value).toBe(100);
    expect(result.current.scale.value).toBe(2);

    // リセット実行
    act(() => {
      result.current.resetScale();
      jest.runAllTimers(); // アニメーション完了まで進める
    });

    expect(result.current.translateX.value).toBe(0);
    expect(result.current.translateY.value).toBe(0);
    expect(result.current.scale.value).toBe(1);
  });

  it('should move to the nearest card when moveToNearestCard is called', () => {
    const { result } = renderHook(() => useCanvasTransform(mockNodes));

    // 初期状態: 0,0 -> 画面中心は (187.5, 406)
    // node1中心: (150, 150) -> 距離は近い
    // node2中心: (550, 550) -> 距離は遠い

    act(() => {
      result.current.moveToNearestCard();
      jest.runAllTimers();
    });

    // 期待値計算:
    // CenterX = width / 2 - nodeCenter.x * scale
    // CenterY = height / 2 - nodeCenter.y * scale
    // scale = 1
    // expectedX = 187.5 - 150 = 37.5
    // expectedY = 406 - 150 = 256

    expect(result.current.translateX.value).toBe(37.5);
    expect(result.current.translateY.value).toBe(256);
  });
});
