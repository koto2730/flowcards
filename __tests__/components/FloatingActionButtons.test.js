import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import FloatingActionButtons from '../../src/components/FloatingActionButtons';
import { useFlowContext } from '../../src/contexts/FlowContext';

// FlowContextのモック
jest.mock('../../src/contexts/FlowContext', () => ({
  useFlowContext: jest.fn(),
}));

// FABのモック: アイコン名をtestIDとして使う
jest.mock('react-native-paper', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    FAB: ({ icon, onPress, testID, disabled }) => (
      <TouchableOpacity 
        onPress={onPress} 
        testID={testID || `fab-${icon}`}
        disabled={disabled}
      >
        <Text>{icon}</Text>
      </TouchableOpacity>
    ),
  };
});

// ReanimatedのrunOnJSモック
jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn) => fn,
}));

// OriginalThemeのモック
jest.mock('../../src/screens/OriginalTheme', () => ({
  colors: { primary: 'blue' },
}));

describe('FloatingActionButtons', () => {
  const mockSetAlignModeOpen = jest.fn();
  const mockHandleAlign = jest.fn();
  const mockSetIsSeeThrough = jest.fn();
  const mockSetShowAttachmentsOnCanvas = jest.fn();
  const mockHandlePressSectionUp = jest.fn();
  const mockResetScale = jest.fn();
  const mockMoveToNearestCard = jest.fn();
  
  const mockAddNode = jest.fn();
  const mockSetLinkingState = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    useFlowContext.mockReturnValue({
      linkingState: { active: false, selectedNodeIds: new Set() },
      setLinkingState: mockSetLinkingState,
      addNode: mockAddNode,
    });
  });

  it('should render normal mode buttons when alignModeOpen is false', () => {
    const { getByTestId } = render(
      <FloatingActionButtons
        alignModeOpen={false}
        setAlignModeOpen={mockSetAlignModeOpen}
        handleAlign={mockHandleAlign}
        isSeeThrough={false}
        setIsSeeThrough={mockSetIsSeeThrough}
        showAttachmentsOnCanvas={false}
        setShowAttachmentsOnCanvas={mockSetShowAttachmentsOnCanvas}
        handlePressSectionUp={mockHandlePressSectionUp}
        resetScale={mockResetScale}
        moveToNearestCard={mockMoveToNearestCard}
        fabDisabled={false}
      />
    );

    // Check Add button (plus)
    fireEvent.press(getByTestId('fab-plus'));
    expect(mockAddNode).toHaveBeenCalled();

    // Check Reset Scale (magnify)
    fireEvent.press(getByTestId('fab-magnify'));
    expect(mockResetScale).toHaveBeenCalled();
    
    // Check Align Open (format-align-justify)
    fireEvent.press(getByTestId('fab-format-align-justify'));
    expect(mockSetAlignModeOpen).toHaveBeenCalledWith(true);
  });

  it('should render align tools when alignModeOpen is true', () => {
    const { getByTestId, queryByTestId } = render(
      <FloatingActionButtons
        alignModeOpen={true}
        setAlignModeOpen={mockSetAlignModeOpen}
        handleAlign={mockHandleAlign}
        isSeeThrough={false}
        setIsSeeThrough={mockSetIsSeeThrough}
        showAttachmentsOnCanvas={false}
        setShowAttachmentsOnCanvas={mockSetShowAttachmentsOnCanvas}
        handlePressSectionUp={mockHandlePressSectionUp}
        resetScale={mockResetScale}
        moveToNearestCard={mockMoveToNearestCard}
        fabDisabled={false}
      />
    );

    // Check align left button
    fireEvent.press(getByTestId('fab-format-align-left'));
    expect(mockHandleAlign).toHaveBeenCalledWith('left');

    // Check normal buttons are hidden (e.g., plus button)
    expect(queryByTestId('fab-plus')).toBeNull();

    // Close align mode
    fireEvent.press(getByTestId('fab-close'));
    expect(mockSetAlignModeOpen).toHaveBeenCalledWith(false);
  });
});
