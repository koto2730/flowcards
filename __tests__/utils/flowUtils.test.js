import {
  getRect,
  getCenter,
  doRectsOverlap,
  isPointInCard,
  isPointInDeleteButton,
  getHandlePosition,
} from '../../src/utils/flowUtils';

describe('flowUtils', () => {
  const mockNode = {
    id: '1',
    position: { x: 100, y: 100 },
    size: { width: 50, height: 30 },
  };

  describe('getRect', () => {
    it('should return the correct rectangle object for a given node', () => {
      const rect = getRect(mockNode);
      expect(rect).toEqual({ x: 100, y: 100, width: 50, height: 30 });
    });
  });

  describe('getCenter', () => {
    it('should return the correct center coordinates for a given node', () => {
      const center = getCenter(mockNode);
      expect(center).toEqual({ x: 125, y: 115 });
    });
  });

  describe('doRectsOverlap', () => {
    const rect1 = { x: 0, y: 0, width: 10, height: 10 };
    
    it('should return true if rectangles overlap', () => {
      const rect2 = { x: 5, y: 5, width: 10, height: 10 };
      expect(doRectsOverlap(rect1, rect2)).toBe(true);
    });

    it('should return false if rectangles do not overlap', () => {
      const rect2 = { x: 11, y: 11, width: 10, height: 10 };
      expect(doRectsOverlap(rect1, rect2)).toBe(false);
    });

    it('should return false if rectangles touch at an edge', () => {
      const rect2 = { x: 10, y: 5, width: 10, height: 10 };
      expect(doRectsOverlap(rect1, rect2)).toBe(false);
    });
  });

  describe('isPointInCard', () => {
    it('should return true if the point is inside the card', () => {
      expect(isPointInCard(mockNode, 125, 115)).toBe(true);
    });

    it('should return false if the point is outside the card', () => {
      expect(isPointInCard(mockNode, 50, 50)).toBe(false);
      expect(isPointInCard(mockNode, 160, 130)).toBe(false);
    });

    it('should return true if the point is on the card border', () => {
      expect(isPointInCard(mockNode, 100, 100)).toBe(true); // Top-left
      expect(isPointInCard(mockNode, 150, 130)).toBe(true); // Bottom-right (inclusive)
    });
  });

  describe('isPointInDeleteButton', () => {
    // Delete button is at node.position.x + node.size.width, node.position.y
    // Radius is 11
    const deleteButtonCenterX = mockNode.position.x + mockNode.size.width; // 100 + 50 = 150
    const deleteButtonCenterY = mockNode.position.y; // 100

    it('should return true if the point is inside the delete button', () => {
      expect(isPointInDeleteButton(mockNode, deleteButtonCenterX, deleteButtonCenterY)).toBe(true); // Center
      expect(isPointInDeleteButton(mockNode, deleteButtonCenterX + 5, deleteButtonCenterY)).toBe(true); // Within radius
    });

    it('should return false if the point is outside the delete button', () => {
      expect(isPointInDeleteButton(mockNode, deleteButtonCenterX + 12, deleteButtonCenterY)).toBe(false); // Outside radius
      expect(isPointInDeleteButton(mockNode, 50, 50)).toBe(false); // Far away
    });
  });

  describe('getHandlePosition', () => {
    it('should return correct position for handleTop', () => {
      expect(getHandlePosition(mockNode, 'handleTop')).toEqual({ x: 125, y: 100 });
    });

    it('should return correct position for handleBottom', () => {
      expect(getHandlePosition(mockNode, 'handleBottom')).toEqual({ x: 125, y: 130 });
    });

    it('should return correct position for handleLeft', () => {
      expect(getHandlePosition(mockNode, 'handleLeft')).toEqual({ x: 100, y: 115 });
    });

    it('should return correct position for handleRight', () => {
      expect(getHandlePosition(mockNode, 'handleRight')).toEqual({ x: 150, y: 115 });
    });

    it('should return default position if handleName is unknown', () => {
      expect(getHandlePosition(mockNode, 'unknownHandle')).toEqual({ x: 100, y: 100 });
    });

    it('should return default position if node is invalid', () => {
      expect(getHandlePosition(null, 'handleTop')).toEqual({ x: 0, y: 0 });
      expect(getHandlePosition(undefined, 'handleTop')).toEqual({ x: 0, y: 0 });
      expect(getHandlePosition({}, 'handleTop')).toEqual({ x: 0, y: 0 });
      expect(getHandlePosition({ position: {} }, 'handleTop')).toEqual({ x: 0, y: 0 });
      expect(getHandlePosition({ size: {} }, 'handleTop')).toEqual({ x: 0, y: 0 });
    });
  });
});
