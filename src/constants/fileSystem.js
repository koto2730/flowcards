import RNFS from 'react-native-fs';

export const ATTACHMENT_BASE_PATH = RNFS.DocumentDirectoryPath;
export const ATTACHMENT_DIR_NAME = 'attachments';
export const ATTACHMENT_DIR = `${ATTACHMENT_BASE_PATH}/${ATTACHMENT_DIR_NAME}`;
