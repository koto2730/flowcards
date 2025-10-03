# Xcode Cloud Configuration

This directory contains scripts for Xcode Cloud CI/CD.

## Files

- `ci_post_clone.sh`: Post-clone script that installs npm and CocoaPods dependencies

## Xcode Cloud Setup Checklist

1. ✅ Repository preparation (ci_scripts folder created)
2. ⏳ Scheme sharing (check in Xcode: Product > Scheme > Manage Schemes > FlowCards > Shared)
3. ⏳ Automatic code signing (enable in Xcode project settings)
4. ⏳ Connect repository to Xcode Cloud in App Store Connect

## Notes

- Xcode Cloud will automatically run ci_post_clone.sh after cloning the repository
- Make sure the FlowCards scheme is shared in Xcode
- Enable automatic code signing for easier certificate management