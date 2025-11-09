import React, { useMemo, useState, useEffect, use } from 'react';
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
  ImageSVG,
  useSVG,
  useVideo,
  SKImage,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  configureReanimatedLogger,
  ReanimatedLogLevel,
  runOnJS,
} from 'react-native-reanimated';
import OriginalTheme, { OriginalTehme } from '../screens/OriginalTheme';
import RNFS from 'react-native-fs';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

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
  resolveAttachmentPath,
}) => {
  const cardColor = isSelected ? '#E3F2FD' : node.color || 'white';

  const borderColor = useDerivedValue(() => {
    if (pressState.value.id === node.id) {
      if (pressState.value.state === 'confirmed') {
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

  const imagePath = useMemo(() => {
    if (!showAttachment || !node.attachment) {
      return null;
    }
    const { mime_type, thumbnail_path, stored_path } = node.attachment;
    if (
      mime_type?.startsWith('image/') ||
      (mime_type === 'text/url' && thumbnail_path)
    ) {
      const path =
        thumbnail_path && thumbnail_path.length > 0
          ? thumbnail_path
          : stored_path;
      return path ? `file://${resolveAttachmentPath(path)}` : null;
    }
    return null;
  }, [node.attachment, showAttachment, resolveAttachmentPath]);

  const attachmentImage = useImage(imagePath);

  // const videoPath = useMemo(() => {
  //   if (!showAttachment || !node.attachment?.mime_type?.startsWith('video/')) {
  //     return null;
  //   }

  //   const attachment = node.attachment;
  //   let path = null;
  //   if (attachment.thumbnail_path && attachment.thumbnail_path.length > 0) {
  //     path = resolveAttachmentPath(attachment.thumbnail_path);
  //   } else if (attachment.stored_path) {
  //     path = resolveAttachmentPath(attachment.stored_path);
  //   }

  //   const finalPath = path ? `file://${path}` : null;
  //   console.log(`[Debug] Video Path for node ${node.id}:`, {
  //     stored_path: attachment.stored_path,
  //     thumbnail_path: attachment.thumbnail_path,
  //     resolved_path: path,
  //     final_path_for_useVideo: finalPath,
  //   });

  //   return finalPath;
  // }, [node.attachment, showAttachment, resolveAttachmentPath]);

  // const { currentFrame } = useVideo(videoPath);
  const currentFrame = null;
  const videoPath = null;

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
      ontSize: 16,
      fontStyle: { weight: FontWeight.Bold },
    };

    const descriptionStyle = {
      color: descriptionColor,
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 14,
    };

    const urlStyle = {
      color: Skia.Color('blue'),
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 12,
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

    if (node.data.type === 'url' && node.data.url) {
      let urlText = node.data.url;
      if (urlText.length > 40) {
        urlText = urlText.substring(0, 40) + '...';
      }
      builder.pushStyle(urlStyle);
      builder.addText(`
${urlText}`);
      builder.pop();
    }

    const paragraph = builder.build();
    paragraph.layout(layoutWidth);
    return paragraph;
  }, [
    fontMgr,
    node.data.label,
    node.data.description,
    node.data.type,
    node.data.url,
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

    if (videoPath && currentFrame) {
      return (
        <Image
          image={currentFrame}
          x={x}
          y={y}
          width={ICON_SIZE}
          height={ICON_SIZE}
          fit="cover"
        />
      );
    }

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
