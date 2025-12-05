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

  const videoPath = useMemo(() => {
    if (!showAttachment || !node.attachment?.mime_type?.startsWith('video/')) {
      return null;
    }

    const attachment = node.attachment;
    let path = null;
    if (attachment.thumbnail_path && attachment.thumbnail_path.length > 0) {
      path = resolveAttachmentPath(attachment.thumbnail_path);
    } else if (attachment.stored_path) {
      path = resolveAttachmentPath(attachment.stored_path);
    }

    const finalPath = path ? `file://${path}` : null;
    console.log(`[Debug] Video Path for node ${node.id}:`, {
      stored_path: attachment.stored_path,
      thumbnail_path: attachment.thumbnail_path,
      resolved_path: path,
      final_path_for_useVideo: finalPath,
    });

    return finalPath;
  }, [node.attachment, showAttachment, resolveAttachmentPath]);

  const seek = useSharedValue(0); // 0秒から開始
  const paused = useSharedValue(false); // 初期値はfalseで再生開始
  const looping = useSharedValue(false);

  const { currentFrame } = useVideo(videoPath, {
    seek,
    paused,
    looping,
  });

  useEffect(() => {
    if (videoPath && currentFrame) {
      // 動画がロードされ、フレームが利用可能になったら
      const timer = setTimeout(() => {
        runOnJS(() => {
          paused.value = true; // 1秒後に一時停止
        })();
      }, 1000); // 1秒

      return () => clearTimeout(timer);
    }
  }, [videoPath, currentFrame, paused]); // videoPath, currentFrame, paused の変更を監視

  const fileIconSvg = useSVG(require('../../assets/icons/file-outline.svg'));
  const linkIconSvg = useSVG(require('../../assets/icons/link-variant.svg'));

  const cardParagraph = useMemo(() => {
    if (!fontMgr) {
      return null;
    }

    const paragraphStyle = {
      textAlign: TextAlign.Left,
    };

    const textShadow = {
      blurRadius: 4,
      color: Skia.Color('white'),
      offset: { x: 0, y: 0 },
    };

    const titleStyle = {
      color: Skia.Color('black'),
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 16,
      fontStyle: { weight: FontWeight.Bold },
      shadows: [textShadow],
    };

    const descriptionStyle = {
      color: Skia.Color('black'),
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 14,
      shadows: [textShadow],
    };

    const urlStyle = {
      color: Skia.Color('#00008B'), // Dark blue for visibility
      fontFamilies: ['NotoSansJP', 'NotoSansSC'],
      fontSize: 12,
      shadows: [textShadow],
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

    const imgWidth = node.size.width;
    const imgHeight = imgWidth; // Square aspect ratio, or adjust as needed
    const x = node.position.x;
    const y = node.position.y + (node.size.height + marginColumn) - imgHeight;

    if (videoPath && currentFrame) {
      return (
        <Image
          image={currentFrame}
          x={x}
          y={y}
          width={imgWidth}
          height={imgHeight}
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
          width={imgWidth}
          height={imgHeight}
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

    // For SVGs, we might want to keep them smaller or center them, 
    // but the request was about thumbnails (images). 
    // Let's apply similar logic but maybe centered if it's just an icon?
    // The user specifically mentioned "thumbnail", which implies images.
    // If it's an icon, maybe we shouldn't stretch it to full width?
    // Let's keep icons smaller but positioned at bottom right as before, 
    // OR scale them up. User said "thumbnail... 150 width". 
    // Assuming this applies to image thumbnails primarily.
    // If it is an SVG icon (file/link), maybe keeping it as an icon is safer,
    // but let's try to follow the positioning logic for consistency.
    
    // Using original icon logic for non-image attachments to avoid huge ugly icons
    const ICON_SIZE = 48;
    const PADDING = 5;
    const iconX = node.position.x + node.size.width - ICON_SIZE - PADDING;
    const iconY = node.position.y + node.size.height - ICON_SIZE - PADDING;

    if (iconSvg) {
      return (
        <ImageSVG
          svg={iconSvg}
          x={iconX}
          y={iconY}
          width={ICON_SIZE}
          height={ICON_SIZE}
          fit="cover"
        />
      );
    }

    return (
      <ImageSVG
        svg={paperclipIconSvg}
        x={iconX}
        y={iconY}
        width={ICON_SIZE}
        height={ICON_SIZE}
        fit="cover"
        color="#333"
      />
    );
  };

  const clipRect = useMemo(
    () =>
      Skia.XYWHRect(
        node.position.x,
        node.position.y,
        node.size.width,
        node.size.height + marginColumn,
      ),
    [node.position.x, node.position.y, node.size.width, node.size.height],
  );

  return (
    <Group opacity={isEditing ? 0.5 : 1.0}>
      <Group clip={clipRect}>
        <Rect
          x={node.position.x}
          y={node.position.y}
          width={node.size.width}
          height={node.size.height + marginColumn}
          color={cardColor}
        />
        {renderAttachment()}
        {cardParagraph && (
          <Paragraph
            paragraph={cardParagraph}
            x={node.position.x + marginRow}
            y={titleY}
            width={layoutWidth}
          />
        )}
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
      </Group>
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
