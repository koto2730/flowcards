import React from 'react';
import { render } from '@testing-library/react-native';
import SkiaCard from '../../src/components/Card'; // Card.jsをSkiaCardとしてインポート

describe('SkiaCard', () => {
  // 最小限のnodeオブジェクトを定義
  const mockNode = {
    id: '1',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 100 },
    data: {
      label: 'Test Card',
      description: 'This is a test description.',
      type: 'text',
    },
    color: 'lightblue',
  };

  const defaultProps = {
    node: mockNode,
    fontMgr: {}, // モックされたSkiaのfontMgr
    paperclipIconSvg: {}, // モックされたSVGオブジェクト
    isSelected: false,
    isLinkingMode: false,
    isLinkSource: false,
    isEditing: false,
    pressState: { value: { id: '', state: 'none' } },
    isSeeThroughParent: false,
    showAttachment: false,
    resolveAttachmentPath: jest.fn((path) => path),
  };

  it('renders without crashing with default props', () => {
    // コンポーネントがクラッシュせずにレンダリングされることを確認
    const { toJSON } = render(<SkiaCard {...defaultProps} />);
    expect(toJSON()).toBeDefined();
    // Skiaコンポーネントは内部でViewにモックされているため、ここではnull以外であることを確認するに留める
  });

  it('renders with isSelected prop true', () => {
    const { toJSON } = render(<SkiaCard {...defaultProps} isSelected={true} />);
    expect(toJSON()).toBeDefined();
  });

  it('renders with isEditing prop true', () => {
    const { toJSON } = render(<SkiaCard {...defaultProps} isEditing={true} />);
    expect(toJSON()).toBeDefined();
    // isEditingがtrueの場合、opacityが0.5になるロジックがあるが、
    // SkiaのGroupコンポーネントのopacityプロパティが正しく設定されていることを
    // @testing-library/react-nativeで直接検証するのは困難。
    // Skiaのモックがopacityプロパティを受け取っているかどうかを確認する形になる。
    // （現状のSkiaモックでは、opacityはViewのpropとしては表示されない）
  });

  // 添付ファイルがある場合のテスト（useImage, useSVGなどのモックが機能するか）
  it('renders with an image attachment', () => {
    const nodeWithImage = {
      ...mockNode,
      attachment: {
        mime_type: 'image/jpeg',
        stored_path: '/path/to/image.jpg',
      },
    };
    const { toJSON } = render(
      <SkiaCard {...defaultProps} node={nodeWithImage} showAttachment={true} />
    );
    expect(toJSON()).toBeDefined();
    // useImageフックが呼ばれていることを確認するには、モックのJest関数をassertする必要があるが、
    // レンダリング結果からは直接確認できない。
  });

  // Video attachment testing (if useVideo mock works)
  it('renders with a video attachment thumbnail', () => {
    const nodeWithVideo = {
      ...mockNode,
      attachment: {
        mime_type: 'video/mp4',
        thumbnail_path: '/path/to/video_thumbnail.jpg',
        stored_path: '/path/to/video.mp4',
      },
    };
    const { toJSON } = render(
      <SkiaCard {...defaultProps} node={nodeWithVideo} showAttachment={true} />
    );
    expect(toJSON()).toBeDefined();
  });

  // URL attachment testing (if useSVG mock works for link-variant.svg)
  it('renders with a URL attachment icon', () => {
    const nodeWithUrl = {
      ...mockNode,
      attachment: {
        mime_type: 'text/url',
        stored_path: 'https://example.com',
      },
    };
    const { toJSON } = render(
      <SkiaCard {...defaultProps} node={nodeWithUrl} showAttachment={true} />
    );
    expect(toJSON()).toBeDefined();
  });

});
