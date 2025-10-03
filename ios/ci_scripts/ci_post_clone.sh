#!/bin/sh

# ci_post_clone.shgit
# Xcode Cloud post-clone script for React Native project
# This script installs npm dependencies and CocoaPods.

set -e

echo "Starting Xcode Cloud post-clone script"

# Navigate to the root directory
cd $CI_PRIMARY_REPOSITORY_PATH

# Install Node.js dependencies
echo "Installing npm dependencies..."
npm install

# Navigate to iOS directory and install CocoaPods
echo "Installing CocoaPods dependencies..."
cd ios
pod install

echo "Post-clone script completed successfully"