import React from 'react';
import {
  Skia,
  Group,
  Text,
  Rect,
  Path,
  Circle,
  DashPathEffect,
} from '@shopify/react-native-skia';

const SkiaCard = ({
  node,
  fontTitleJP,
  fontDescriptionJP,
  fontTitleSC,
  fontDescriptionSC,
  isSelected,
  isLinkingMode,
  isLinkSource,
  isEditing,
  isSeeThroughParent,
}) => {
  const cardColor = isSelected ? '#E3F2FD' : 'white';
  const borderColor = isLinkSource ? '#34C759' : '#ddd';
  const titleColor = 'black';
  const descriptionColor = '#555';
  const deleteButtonColor = 'red';

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

  return (
    <Group opacity={isEditing ? 0.5 : 1.0}>
      <Rect
        x={node.position.x}
        y={node.position.y}
        width={node.size.width}
        height={node.size.height}
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
          height={node.size.height}
          strokeWidth={2}
          style="stroke"
          color={borderColor}
        />
      )}
      {fontTitleJP && fontDescriptionJP && fontTitleSC && fontDescriptionSC && (
        <>
          <Text
            font={fontTitleJP}
            x={node.position.x + 10}
            y={node.position.y + 20}
            text={node.data.label ?? ''}
            color={titleColor}
          />
          <Text
            font={fontTitleSC}
            x={node.position.x + 10}
            y={node.position.y + 20}
            text={node.data.label ?? ''}
            color={titleColor}
          />
          {node.data.description && (
            <>
              <Text
                font={fontDescriptionJP}
                x={node.position.x + 10}
                y={node.position.y + 40}
                text={node.data.description}
                color={descriptionColor}
                maxWidth={node.size.width - 20}
              />
              <Text
                font={fontDescriptionSC}
                x={node.position.x + 10}
                y={node.position.y + 40}
                text={node.data.description}
                color={descriptionColor}
                maxWidth={node.size.width - 20}
              />
            </>
          )}
        </>
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