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
  ImageSVG,
  useSVG,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import OriginalTheme, { OriginalTehme } from '../screens/OriginalTheme';

const CARD_MIN_WIDTH = 150;

const SkiaCard = ({
  node,
  fontMgr,
  paperclipIconSvg,
  isSelected,
  isLinkingMode,
  isLinkSource,
  isEditing,
  pressState,
  isSeeThroughParent,
  showAttachment,
}) => {
  const cardColor = isSelected ? '#E3F2FD' : node.color || 'white';

  const borderColor = useDerivedValue(() => {
    if (pressState.value.id === node.id) {
      if (pressState.value.state === 'confirmed') {
        console.log('Card confirmed:', node.id);
        return OriginalTheme.colors.primary; // Green for confirmed
      }
      return '#60A5FA'; // Blue for pressing
    }
    return isLinkSource ? '#60A5FA' : '#ddd';
  }, [pressState, isLinkSource, node.id]);

  const borderWidth = useDerivedValue(() => {
    if (
      pressState.value.id === node.id &&
      pressState.value.state === 'confirmed'
    ) {
      return 4;
    }
    return isLinkSource ? 4 : 2;
  }, [pressState, isLinkSource, node.id]);

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
    node.attachment?.thumbnail_path && node.attachment.thumbnail_path.length > 0
      ? `file://${node.attachment.thumbnail_path}`
      : node.attachment?.mime_type?.startsWith('image/')
      ? `file://${node.attachment.stored_path}`
      : null,
  );

  const fileIconSvg = useSVG(require('../../assets/icons/file-outline.svg'));
  const linkIconSvg = useSVG(require('../../assets/icons/link-variant.svg'));

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

    let iconSvg = null;
    if (node.attachment.mime_type === 'text/url') {
      iconSvg = linkIconSvg;
    } else {
      iconSvg = fileIconSvg;
    }

    if (iconSvg) {
      return (
        <ImageSVG
          svg={iconSvg}
          x={x}
          y={y}
          width={ICON_SIZE}
          height={ICON_SIZE}
          fit="cover"
        />
      );
    }

    return (
      <ImageSVG
        svg={paperclipIconSvg}
        x={x}
        y={y}
        width={ICON_SIZE}
        height={ICON_SIZE}
        fit="cover"
        color="#333"
      />
    );
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
          strokeWidth={borderWidth}
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
          strokeWidth={borderWidth}
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
