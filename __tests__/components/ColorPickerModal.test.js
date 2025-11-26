import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ColorPickerModal from '../../src/components/ColorPickerModal';

// react-native-color-palette のモック
// 操作可能なコンポーネントとしてモック化する
jest.mock('react-native-color-palette', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return (props) => (
    <View testID="color-palette">
      <Text>{props.title}</Text>
      {props.colors.map((color) => (
        <TouchableOpacity
          key={color}
          testID={`color-${color}`}
          onPress={() => props.onChange(color)}
        >
          <Text>{color}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
});

describe('ColorPickerModal', () => {
  const mockNode = {
    id: '1',
    color: '#FFFFFF',
  };
  const mockOnClose = jest.fn();
  const mockOnColorChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null if node is not provided', () => {
    const { toJSON } = render(
      <ColorPickerModal
        visible={true}
        onClose={mockOnClose}
        node={null}
        onColorChange={mockOnColorChange}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('should render correctly when visible and node is provided', () => {
    const { getByTestId, getByText } = render(
      <ColorPickerModal
        visible={true}
        onClose={mockOnClose}
        node={mockNode}
        onColorChange={mockOnColorChange}
      />
    );

    // モックしたColorPaletteが表示されているか確認
    expect(getByTestId('color-palette')).toBeTruthy();
    // タイトルが表示されているか確認 (i18nモックがキーを返す前提: selectCardColor)
    expect(getByText('selectCardColor')).toBeTruthy();
  });

  it('should call onColorChange when a color is selected', () => {
    const { getByTestId } = render(
      <ColorPickerModal
        visible={true}
        onClose={mockOnClose}
        node={mockNode}
        onColorChange={mockOnColorChange}
      />
    );

    // 特定の色 (#FCA5A5) をタップ
    const colorButton = getByTestId('color-#FCA5A5');
    fireEvent.press(colorButton);

    expect(mockOnColorChange).toHaveBeenCalledWith('#FCA5A5');
    expect(mockOnColorChange).toHaveBeenCalledTimes(1);
  });

  // React Native PaperのModalは通常、Portalを介してレンダリングされるため、
  // onDismissのテストは環境によっては難しい場合があるが、
  // jest.setup.jsでPortalやModalが単純なコンポーネントとしてモックされていれば可能。
  // 今回はPaperのModal自体がモックされていると仮定（setupファイルを見た限り、文字列'Modal'になっている可能性が高い）。
  // setup.jsでは: Modal: 'Modal' となっている。
  // 文字列コンポーネントの場合、fireEventでイベントを発火できない可能性がある。
  // そのため、Modalもここで詳細にモックするか、呼び出しを確認する方法を変える。
});
