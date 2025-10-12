import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  Skia,
  Group,
  Rect,
  Path,
  Circle,
  DashPathEffect,
  Paragraph,
  TextAlign,
  FontWeight,
  useImage,
  Image,
  useFont,
} from '@shopify/react-native-skia';

const CARD_MIN_WIDTH = 150;

const SkiaCard = ({
  node,
  fontMgr,
  isSelected,
  isLinkingMode,
  isLinkSource,
  isEditing,
  isSeeThroughParent,
  showAttachment,
}) => {
  const cardColor = isSelected ? '#E3F2FD' : node.color || 'white';
  const borderColor = isLinkSource ? '#34C759' : '#ddd';
  const titleColor = Skia.Color('black');
  const descriptionColor = Skia.Color('#555');
  const deleteButtonColor = 'red';

  const marginRow = 10;
  const marginColumn = 5;

  const deleteButtonRadius = 11;
  const deleteButtonX = node.position.x + node.size.width;
  const deleteButtonY = node.position.y;

  const crossPath = Skia.Path.Make();
  crossPath.moveTo(deleteButtonX - 5, deleteButtonY - 5);
  crossPath.lineTo(deleteButtonX + 5, deleteButtonY + 5);
  crossPath.moveTo(deleteButtonX + 5, deleteButtonY - 5);
  crossPath.lineTo(deleteButtonX - 5, deleteButtonY + 5);

  const borderPath = Skia.Path.Make();
  borderPath.addRect(
    Skia.XYWHRect(
      node.position.x,
      node.position.y,
      node.size.width,
      node.size.height,
    ),
  );

  const cardSize = node.data.size || 'medium';
  const layoutWidth = (node.size.width || CARD_MIN_WIDTH) - marginRow * 2;

  const attachmentImage = useImage(
    node.attachment?.thumbnail_path ||
      (node.attachment?.mime_type?.startsWith('image/') &&
        node.attachment?.stored_path)
      ? `file://${
          node.attachment.thumbnail_path || node.attachment.stored_path
        }`
      : null,
  );

  const iconFont = useFont(
    Platform.OS === 'ios'
      ? require('../../ios/Fonts/MaterialCommunityIcons.ttf')
      : 'MaterialCommunityIcons',
    24,
  );

  const paperclipIconFont = useFont(
    Platform.OS === 'ios'
      ? require('../../ios/Fonts/MaterialCommunityIcons.ttf')
      : 'MaterialCommunityIcons',
    16,
  );

  const paperclipIconPath = useMemo(() => {
    if (!paperclipIconFont || !node.attachment) return null;
    const iconChar = String.fromCodePoint(0xf03e2); // paperclip
    const path = paperclipIconFont.getPath(iconChar, 0, 0);
    if (path) {
      const bounds = path.getBounds();
      const scale = 16 / bounds.height;
      const matrix = Skia.Matrix();
      matrix.preScale(scale, scale);
      path.transform(matrix);
    }
    return path;
  }, [paperclipIconFont, node.attachment]);

  const attachmentIconPath = useMemo(() => {
    if (!iconFont || !node.attachment) return null;
    let iconChar;
    if (node.attachment.mime_type === 'text/url') {
      iconChar = String.fromCodePoint(0xf033b); // link-variant
    } else {
      iconChar = String.fromCodePoint(0xf021a); // file-outline
    }
    const path = iconFont.getPath(iconChar, 0, 0);
    if (path) {
      const bounds = path.getBounds();
      const scale = 24 / bounds.height;
      const matrix = Skia.Matrix();
      matrix.preScale(scale, scale);
      path.transform(matrix);
    }
    return path;
  }, [iconFont, node.attachment]);

  const cardParagraph = useMemo(() => {
    if (!fontMgr) {
      return null;
    }

    const paragraphStyle = {
      textAlign: TextAlign.Left,
    };

    const titleStyle = {
      color: titleColor,
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 16,
      fontStyle: { weight: FontWeight.Bold },
    };

    const descriptionStyle = {
      color: descriptionColor,
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 14,
    };

    const builder = Skia.ParagraphBuilder.Make(
      paragraphStyle,
      fontMgr,
    ).pushStyle(titleStyle);
    builder.addText(node.data.label ?? '');
    builder.pop();

    if (node.data.description && cardSize !== 'small') {
      let descriptionText = node.data.description;
      if (cardSize === 'medium' && descriptionText.length > 8) {
        descriptionText = descriptionText.substring(0, 8) + '...';
      }
      builder.pushStyle(descriptionStyle);
      builder.addText(`
${descriptionText}`);
      builder.pop();
    }

    const paragraph = builder.build();
    paragraph.layout(layoutWidth);
    return paragraph;
  }, [
    fontMgr,
    node.data.label,
    node.data.description,
    layoutWidth,
    titleColor,
    descriptionColor,
    cardSize,
  ]);

  const titleY = node.position.y + marginRow;

  const renderAttachment = () => {
    if (!showAttachment || !node.attachment) return null;

    const ICON_SIZE = 48;
    const PADDING = 5;
    const x = node.position.x + node.size.width - ICON_SIZE - PADDING;
    const y = node.position.y + node.size.height - ICON_SIZE - PADDING;

    if (attachmentImage) {
      return (
        <Image
          image={attachmentImage}
          x={x}
          y={y}
          width={ICON_SIZE}
          height={ICON_SIZE}
          fit="cover"
        />
      );
    }

    if (attachmentIconPath) {
      const transform = [
        { translateX: x },
        { translateY: y + ICON_SIZE - PADDING },
      ];
      return (
        <Path path={attachmentIconPath} color="#666" transform={transform} />
      );
    }

    return null;
  };

  return (
    <Group opacity={isEditing ? 0.5 : 1.0}>
      <Rect
        x={node.position.x}
        y={node.position.y}
        width={node.size.width}
        height={node.size.height + marginColumn}
        color={cardColor}
      />
      {isSeeThroughParent ? (
        <Path
          path={borderPath}
          style="stroke"
          strokeWidth={2}
          color={borderColor}
        >
          <DashPathEffect intervals={[4, 4]} />
        </Path>
      ) : (
        <Rect
          x={node.position.x}
          y={node.position.y}
          width={node.size.width}
          height={node.size.height + marginColumn}
          strokeWidth={2}
          style="stroke"
          color={borderColor}
        />
      )}
      {renderAttachment()}
      {cardParagraph && (
        <Paragraph
          paragraph={cardParagraph}
          x={node.position.x + marginRow}
          y={titleY}
          width={layoutWidth}
        />
      )}
      {paperclipIconPath && (
        <Path
          path={paperclipIconPath}
          color="#333"
          transform={[
            { translateX: node.position.x + node.size.width - 22 },
            { translateY: node.position.y + 6 },
          ]}
        />
      )}
      <Group>
        <Circle
          cx={deleteButtonX}
          cy={deleteButtonY}
          r={deleteButtonRadius}
          color={deleteButtonColor}
        />
        <Path path={crossPath} style="stroke" strokeWidth={2} color="white" />
      </Group>
    </Group>
  );
};

export default SkiaCard;
