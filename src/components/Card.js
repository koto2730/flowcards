import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Button,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';

const Card = ({
  title,
  description,
  position = { x: 0, y: 0 },
  size,
  onDragEnd,
  onDelete,
  onUpdate,
  onCardTap,
  onDoubleClick,
  isSeeThroughParent,
  isSeeThroughActive,
  isLinkingMode,
  isLinkSource,
  zIndex,
  node_id,
}) => {
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);
  const context = useSharedValue({ x: 0, y: 0 });

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [editedDescription, setEditedDescription] = useState(description);

  useEffect(() => {
    translateX.value = position.x;
    translateY.value = position.y;
  }, [position]);

  useEffect(() => {
    setEditedTitle(title);
    setEditedDescription(description);
  }, [title, description]);

  const handleLongPress = () => {
    if (!isEditing) {
      runOnJS(setIsEditing)(true);
    }
  };

  const singleTapGesture = Gesture.Tap().onEnd(() => {
    if (onCardTap) {
      runOnJS(onCardTap)(node_id);
    }
  });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (onDoubleClick) {
        runOnJS(onDoubleClick)(node_id);
      }
    })
    .enabled(!isSeeThroughActive && !isLinkingMode);

  const longPressGesture = Gesture.LongPress()
    .onStart(handleLongPress)
    .enabled(!isSeeThroughParent && !isLinkingMode);

  const panGestureCard = Gesture.Pan()
    .onStart(() => {
      context.value = { x: translateX.value, y: translateY.value };
    })
    .onUpdate(event => {
      translateX.value = context.value.x + event.translationX;
      translateY.value = context.value.y + event.translationY;
    })
    .onEnd(() => {
      if (onDragEnd) {
        runOnJS(onDragEnd)(node_id, {
          x: translateX.value,
          y: translateY.value,
        });
      }
    })
    .enabled(!isEditing && !isSeeThroughActive && !isLinkingMode);

  const composedGesture = Gesture.Exclusive(
    panGestureCard,
    doubleTapGesture,
    singleTapGesture,
    longPressGesture,
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const handleDelete = () => onDelete && onDelete(node_id);
  const handleUpdate = () => {
    setIsEditing(false);
    onUpdate &&
      onUpdate(node_id, { title: editedTitle, description: editedDescription });
  };

  const containerStyles = [
    styles.cardContainer,
    { zIndex },
    animatedStyle,
    isSeeThroughParent && styles.seeThroughParent,
    isLinkSource && styles.linkSource,
    size && { width: size.width, height: size.height },
  ];

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={containerStyles}>
        {isSeeThroughParent ? (
          <View style={styles.seeThroughTitleContainer}>
            <Text style={styles.title}>{title}</Text>
          </View>
        ) : isEditing ? (
          <View>
            <TextInput
              value={editedTitle}
              onChangeText={setEditedTitle}
              style={[styles.title, styles.input]}
              autoFocus
            />
            <TextInput
              value={editedDescription}
              onChangeText={setEditedDescription}
              style={[styles.description, styles.input]}
              multiline
            />
            <Button title="保存" onPress={handleUpdate} />
          </View>
        ) : (
          <View style={styles.touchableArea}>
            <Text style={styles.title}>{title}</Text>
            {description && (
              <Text style={styles.description}>{description}</Text>
            )}
          </View>
        )}
        {!isSeeThroughParent && (
          <>
            <TouchableOpacity
              onPress={handleDelete}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteButtonText}>X</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    backgroundColor: 'white',
    minWidth: 150,
    minHeight: 70,
    padding: 10,
  },
  linkSource: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  seeThroughParent: {
    backgroundColor: 'rgba(200, 200, 200, 0.2)',
    borderColor: '#999',
    borderStyle: 'dashed',
    padding: 0,
  },
  seeThroughTitleContainer: {
    position: 'absolute',
    top: -30,
    left: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  touchableArea: {
    flex: 1,
  },
  deleteButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: 'red',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  description: {
    fontSize: 12,
    color: '#555',
    marginTop: 5,
  },
  input: {
    borderBottomWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 2,
  },
});

export default Card;
