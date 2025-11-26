import React from 'react';
import { View, Text, Button } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { FlowProvider, useFlowContext } from '../../src/contexts/FlowContext';
import * as db from '../../src/db';

// Mock dependencies
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/test/path',
  mkdir: jest.fn(),
  exists: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

jest.mock('react-native-get-random-values', () => ({}));

// Mock DB module
jest.mock('../../src/db', () => ({
  getNodes: jest.fn(),
  getEdges: jest.fn(),
  insertNode: jest.fn(),
  updateNode: jest.fn(),
  deleteNode: jest.fn(),
  insertEdge: jest.fn(),
  deleteEdge: jest.fn(),
  getAttachmentByNodeId: jest.fn(),
  insertAttachment: jest.fn(),
  deleteAttachment: jest.fn(),
  updateAttachment: jest.fn(),
  updateAttachmentPaths: jest.fn(),
}));

// Mock utils to avoid complex logic in unit test if needed, but using real ones is fine for integration style.
// keeping them real for now to test data flow fully.

const TestComponent = () => {
  const { 
    allNodes, 
    addNode, 
    deleteNode, 
    updateNodePosition, 
    goIntoNode, 
    goBack,
    currentParentId 
  } = useFlowContext();

  return (
    <View>
      <Text testID="node-count">{allNodes.length}</Text>
      <Text testID="current-parent">{currentParentId}</Text>
      <Button 
        testID="add-node" 
        onPress={() => addNode({ x: 100, y: 100 })} 
        title="Add Node" 
      />
      {allNodes.length > 0 && (
        <>
          <Button 
            testID="delete-node" 
            onPress={() => deleteNode(allNodes[0].id)} 
            title="Delete Node" 
          />
           <Button 
            testID="update-pos" 
            onPress={() => updateNodePosition(allNodes[0].id, { x: 200, y: 200 })} 
            title="Update Pos" 
          />
           <Button 
            testID="go-into" 
            onPress={() => goIntoNode(allNodes[0].id)} 
            title="Go Into" 
          />
        </>
      )}
      <Button testID="go-back" onPress={goBack} title="Go Back" />
    </View>
  );
};

describe('FlowContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default DB mocks
    db.getNodes.mockResolvedValue([]);
    db.getEdges.mockResolvedValue([]);
    db.getAttachmentByNodeId.mockResolvedValue(null);
  });

  it('loads initial data', async () => {
    const mockNodes = [{ id: '1', parent_id: 'root', x: 0, y: 0, width: 100, height: 100, data: '{}', color: '#fff' }];
    db.getNodes.mockResolvedValue(mockNodes);

    const { getByTestId } = render(
      <FlowProvider flowId={1}>
        <TestComponent />
      </FlowProvider>
    );

    await waitFor(() => {
      expect(getByTestId('node-count').children[0]).toBe('1');
    });
    expect(db.getNodes).toHaveBeenCalledWith(1);
  });

  it('adds a node', async () => {
    db.getNodes.mockResolvedValue([]);
    db.insertNode.mockResolvedValue(1); // insert returns id

    const { getByTestId } = render(
      <FlowProvider flowId={1}>
        <TestComponent />
      </FlowProvider>
    );

    await waitFor(() => expect(getByTestId('node-count').children[0]).toBe('0'));

    // Setup getNodes to return the new node after addNode calls loadData
    db.getNodes.mockResolvedValueOnce([
      { id: 'test-uuid', parent_id: 'root', x: 100, y: 100, width: 150, height: 85, data: JSON.stringify({ label: 'New Card' }), color: '#FFFFFF' }
    ]);

    await act(async () => {
      fireEvent.press(getByTestId('add-node'));
    });

    await waitFor(() => {
      expect(db.insertNode).toHaveBeenCalled();
    });
    
    // The second call to getNodes happens inside addNode -> loadData
    expect(db.getNodes).toHaveBeenCalledTimes(2);
  });

  it('deletes a node', async () => {
    const initialNode = { id: '1', parent_id: 'root', x: 0, y: 0, width: 100, height: 100, data: '{}', color: '#fff' };
    db.getNodes.mockResolvedValue([initialNode]);

    const { getByTestId } = render(
      <FlowProvider flowId={1}>
        <TestComponent />
      </FlowProvider>
    );

    await waitFor(() => expect(getByTestId('node-count').children[0]).toBe('1'));

    // Setup getNodes to return empty after delete
    db.getNodes.mockResolvedValueOnce([]);

    await act(async () => {
      fireEvent.press(getByTestId('delete-node'));
    });

    await waitFor(() => {
      expect(db.deleteNode).toHaveBeenCalledWith('1');
    });
  });

  it('updates node position', async () => {
    const initialNode = { id: '1', parent_id: 'root', x: 0, y: 0, width: 100, height: 100, data: '{}', color: '#fff' };
    db.getNodes.mockResolvedValue([initialNode]);

    const { getByTestId } = render(
      <FlowProvider flowId={1}>
        <TestComponent />
      </FlowProvider>
    );

    await waitFor(() => expect(getByTestId('node-count').children[0]).toBe('1'));

    await act(async () => {
      fireEvent.press(getByTestId('update-pos'));
    });

    expect(db.updateNode).toHaveBeenCalledWith('1', { x: 200, y: 200 });
  });

  it('navigates into and out of a node', async () => {
    const initialNode = { id: '1', parent_id: 'root', x: 0, y: 0, width: 100, height: 100, data: '{}', color: '#fff' };
    db.getNodes.mockResolvedValue([initialNode]);

    const { getByTestId } = render(
      <FlowProvider flowId={1}>
        <TestComponent />
      </FlowProvider>
    );

    await waitFor(() => expect(getByTestId('current-parent').children[0]).toBe('root'));

    await act(async () => {
      fireEvent.press(getByTestId('go-into'));
    });

    await waitFor(() => expect(getByTestId('current-parent').children[0]).toBe('1'));

    await act(async () => {
      fireEvent.press(getByTestId('go-back'));
    });

    await waitFor(() => expect(getByTestId('current-parent').children[0]).toBe('root'));
  });
});
