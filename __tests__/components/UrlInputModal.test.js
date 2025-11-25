import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View, Text, TextInput } from 'react-native'; // Import from react-native
import UrlInputModal from '../../src/components/UrlInputModal';

// Mock react-native-paper components
jest.mock('react-native-paper', () => {
  // Obtain View and Text from 'react-native' using require inside the mock factory
  const { View, Text, TextInput } = require('react-native'); // Require here

  const RNP_Modal = ({ children, visible, onDismiss, contentContainerStyle, testID }) => {
    if (!visible) return null;
    return (
      <View testID={testID} style={contentContainerStyle}>
        {children}
      </View>
    );
  };

  const RNP_Button = ({ children, onPress, testID, textColor, disabled }) => (
    <Text
      testID={testID}
      onPress={onPress}
      style={textColor ? { color: textColor } : {}}
      disabled={disabled}
    >
      {children}
    </Text>
  );

  const RNP_Portal = ({ children }) => children;

  const RNP_Text = ({ children, testID, style }) => <Text testID={testID} style={style}>{children}</Text>;

  return {
    Modal: RNP_Modal,
    Button: RNP_Button,
    Portal: RNP_Portal,
    Text: RNP_Text,
    DefaultTheme: { // DefaultThemeをモック
      colors: { // 必要なcolorsプロパティを定義
        primary: 'mockPrimary',
        secondary: 'mockSecondary',
        tertiary: 'mockTertiary',
        background: 'mockBackground',
        surface: 'mockSurface',
        onSurface: 'mockOnSurface',
        onSurfaceVariant: 'mockOnSurfaceVariant',
      },
    },
  };
});

// Mock useTranslation from react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: key => key, // Simply return the key as the translation
    i18n: {
      changeLanguage: () => new Promise(() => {}),
    },
  }),
}));

describe('UrlInputModal', () => {
  const mockOnClose = jest.fn();
  const mockOnUrlChange = jest.fn();
  const mockOnSave = jest.fn();
  const defaultProps = {
    visible: false,
    onClose: mockOnClose,
    attachmentUrl: '',
    onUrlChange: mockOnUrlChange,
    onSave: mockOnSave,
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should not be visible when visible prop is false', () => {
    const { queryByTestId } = render(<UrlInputModal {...defaultProps} />);
    expect(queryByTestId('url-input-modal')).toBeNull();
  });

  it('should be visible when visible prop is true and display the correct URL', () => {
    const testUrl = 'https://test.com';
    const { getByTestId, getByDisplayValue, getByText } = render(
      <UrlInputModal {...defaultProps} visible={true} attachmentUrl={testUrl} />
    );

    expect(getByTestId('url-input-modal')).toBeDefined();
    expect(getByDisplayValue(testUrl)).toBeDefined();
    expect(getByText('save')).toBeDefined();
    expect(getByText('cancel')).toBeDefined();
  });

  it('should call onUrlChange when the TextInput value changes', () => {
    const { getByPlaceholderText } = render(
      <UrlInputModal {...defaultProps} visible={true} />
    );
    const inputField = getByPlaceholderText('example.com');
    fireEvent.changeText(inputField, 'new-url.com');
    expect(mockOnUrlChange).toHaveBeenCalledWith('new-url.com');
  });

  it('should call onSave when the Save button is pressed', () => {
    const { getByText } = render(<UrlInputModal {...defaultProps} visible={true} />);
    const saveButton = getByText('save');
    fireEvent.press(saveButton);
    expect(mockOnSave).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the Cancel button is pressed', () => {
    const { getByText } = render(<UrlInputModal {...defaultProps} visible={true} />);
    const cancelButton = getByText('cancel');
    fireEvent.press(cancelButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when the modal is dismissed (onDismiss)', () => {
    const { getByTestId } = render(<UrlInputModal {...defaultProps} visible={true} />);
    const modal = getByTestId('url-input-modal');
    fireEvent(modal, 'onDismiss'); // Simulate onDismiss event
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
