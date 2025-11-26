import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EditorModal from '../../src/components/EditorModal';

// Mock external dependencies
jest.mock('react-native-video', () => 'Video');
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/test/path',
}));

// Mock react-native-paper
jest.mock('react-native-paper', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');

  const Card = ({ children, style }) => <View testID="card" style={style}>{children}</View>;
  Card.Content = ({ children }) => <View>{children}</View>;
  Card.Actions = ({ children }) => <View>{children}</View>;

  return {
    Card,
    Title: ({ children, style }) => <Text style={style}>{children}</Text>,
    Button: ({ children, onPress, icon, mode }) => (
      <TouchableOpacity onPress={onPress} testID={`button-${children}`}>
        <Text>{children}</Text>
        {icon && <Text>{icon}</Text>}
      </TouchableOpacity>
    ),
    Icon: ({ source }) => <Text>{source}</Text>,
    Text: ({ children, style }) => <Text style={style}>{children}</Text>,
    Divider: () => <View />,
    SegmentedButtons: ({ value, onValueChange, buttons }) => (
      <View>
        {buttons.map(b => (
          <TouchableOpacity key={b.value} onPress={() => onValueChange(b.value)}>
            <Text>{b.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
    DefaultTheme: {
      colors: {
        primary: '#6200ee',
        background: '#ffffff',
        surface: '#ffffff',
        error: '#B00020',
        text: '#000000',
        onSurface: '#000000',
        disabled: '#000000',
        placeholder: '#000000',
        backdrop: '#000000',
      }
    }
  };
});

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key }),
}));

// Mock FlowContext
const mockDispatch = jest.fn();
const mockSaveEditor = jest.fn();
const mockCloseEditor = jest.fn();

let mockEditingNode = {
  id: '1',
  title: 'Test Title',
  description: 'Test Desc',
  size: 'medium',
  color: '#ffffff',
  attachment: null,
};

jest.mock('../../src/contexts/FlowContext', () => ({
  useFlowContext: () => ({
    editingNode: mockEditingNode,
    closeEditor: mockCloseEditor,
    saveEditor: mockSaveEditor,
    dispatch: mockDispatch,
  }),
}));

// Mock Props
const mockProps = {
  setColorPickerVisible: jest.fn(),
  setUrlInputVisible: jest.fn(),
  handleAttachFile: jest.fn(),
  handleAttachImageFromLibrary: jest.fn(),
  handleOpenAttachment: jest.fn(),
  handleRemoveAttachment: jest.fn(),
  resolveAttachmentPath: jest.fn(path => path),
};

describe('EditorModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEditingNode = {
      id: '1',
      title: 'Test Title',
      description: 'Test Desc',
      size: 'medium',
      color: '#ffffff',
      attachment: null,
    };
  });

  it('renders correctly when editingNode is present', () => {
    const { getByPlaceholderText, getByText } = render(<EditorModal {...mockProps} />);
    
    expect(getByPlaceholderText('title')).toBeTruthy();
    expect(getByPlaceholderText('description')).toBeTruthy();
    expect(getByText('save')).toBeTruthy();
    expect(getByText('cancel')).toBeTruthy();
  });

  it('renders nothing when editingNode is null', () => {
    mockEditingNode = null;
    const { toJSON } = render(<EditorModal {...mockProps} />);
    expect(toJSON()).toBeNull();
  });

  it('updates title on text change', () => {
    const { getByPlaceholderText } = render(<EditorModal {...mockProps} />);
    const titleInput = getByPlaceholderText('title');

    fireEvent.changeText(titleInput, 'New Title');

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_EDITING_NODE',
      payload: expect.objectContaining({ title: 'New Title' }),
    });
  });

  it('updates description on text change', () => {
    const { getByPlaceholderText } = render(<EditorModal {...mockProps} />);
    const descInput = getByPlaceholderText('description');

    fireEvent.changeText(descInput, 'New Description');

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'UPDATE_EDITING_NODE',
      payload: expect.objectContaining({ description: 'New Description' }),
    });
  });

  it('calls saveEditor on save button press', () => {
    const { getByText } = render(<EditorModal {...mockProps} />);
    fireEvent.press(getByText('save'));
    expect(mockSaveEditor).toHaveBeenCalled();
  });

  it('calls closeEditor on cancel button press', () => {
    const { getByText } = render(<EditorModal {...mockProps} />);
    fireEvent.press(getByText('cancel'));
    expect(mockCloseEditor).toHaveBeenCalled();
  });

  it('opens color picker', () => {
    const { getByText } = render(<EditorModal {...mockProps} />);
    fireEvent.press(getByText('selectColor'));
    expect(mockProps.setColorPickerVisible).toHaveBeenCalledWith(true);
  });

  it('shows attachment options when no attachment exists', () => {
    const { getByText } = render(<EditorModal {...mockProps} />);
    expect(getByText('attach')).toBeTruthy();
    expect(getByText('file')).toBeTruthy();
    expect(getByText('photo')).toBeTruthy();
    expect(getByText('url')).toBeTruthy();
  });

  it('shows attachment details when attachment exists', () => {
    mockEditingNode = {
      ...mockEditingNode,
      attachment: {
        id: 'att1',
        filename: 'test.jpg',
        mime_type: 'image/jpeg',
        stored_path: 'path/to/test.jpg',
      },
    };

    const { getByText } = render(<EditorModal {...mockProps} />);
    
    expect(getByText('test.jpg')).toBeTruthy();
    expect(getByText('open')).toBeTruthy();
    expect(getByText('remove')).toBeTruthy();
    // Attach buttons should be hidden
    expect(() => getByText('attach')).toThrow();
  });

  it('calls handleRemoveAttachment when remove button is pressed', () => {
    mockEditingNode = {
      ...mockEditingNode,
      attachment: {
        id: 'att1',
        filename: 'test.jpg',
        mime_type: 'image/jpeg',
        stored_path: 'path/to/test.jpg',
      },
    };

    const { getByText } = render(<EditorModal {...mockProps} />);
    fireEvent.press(getByText('remove'));
    expect(mockProps.handleRemoveAttachment).toHaveBeenCalledWith(mockEditingNode);
  });
});
