#!/bin/zsh

# ci_post_clone.sh
# Xcode Cloud post-clone script for React Native project
# This script installs npm dependencies and CocoaPods.

set -e

echo "Starting Xcode Cloud post-clone script"

# Navigate to the root directory
cd $CI_PRIMARY_REPOSITORY_PATH

# Install Node.js and npm (if not already installed)
echo "Checking for Node.js and npm..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js via Homebrew..."
    # Install Homebrew if not present
    if ! command -v brew &> /dev/null; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        export PATH="/opt/homebrew/bin:$PATH"
    fi
    brew install node
else
    echo "Node.js already installed: $(node --version)"
fi

# Install CocoaPods (if not already installed)
echo "Checking for CocoaPods..."
if ! command -v pod &> /dev/null; then
    echo "Installing CocoaPods..."
    sudo gem install cocoapods
else
    echo "CocoaPods already installed: $(pod --version)"
fi

# Install Node.js dependencies
echo "Installing npm dependencies..."
npm install

# Navigate to iOS directory and install CocoaPods
echo "Installing CocoaPods dependencies..."
cd ios
pod install

echo "Post-clone script completed successfully"