import React, { useMemo } from 'react';
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

    const builder = Skia.ParagraphBuilder.Make(paragraphStyle, fontMgr).pushStyle(
      titleStyle,
    );
    builder.addText(node.data.label ?? '');
    builder.pop();

    if (node.data.description && cardSize !== 'small') {
      let descriptionText = node.data.description;
      if (cardSize === 'medium' && descriptionText.length > 8) {
        descriptionText = descriptionText.substring(0, 8) + '...';
      }
      builder.pushStyle(descriptionStyle);
      builder.addText(`\n${descriptionText}`);
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
      {cardParagraph && (
        <Paragraph 
          paragraph={cardParagraph}
          x={node.position.x + marginRow}
          y={titleY}
          width={layoutWidth}
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
