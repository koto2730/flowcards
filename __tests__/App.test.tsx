/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

describe('App', () => {
  let consoleErrorSpy;

  beforeAll(() => {
    // console.error の元の実装を保存し、モックに置き換える
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    // テスト後に元の実装に戻す
    consoleErrorSpy.mockRestore();
  });

  test('renders correctly', async () => {
    await ReactTestRenderer.act(() => {
      ReactTestRenderer.create(<App />);
    });
  });
});
