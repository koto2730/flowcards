# Test Scenario Template

Please copy and use this file when conducting tests.
Check the checkbox after completing each item.

## 1. Flow Management Features (List Screen)

### 1.1. Create New Flow
- [ ] Tap the "Create New Flow" button on the flow list screen.
- [ ] Confirm that a new flow is added to the list and the editor screen is displayed.
- [ ] Confirm that the default flow name is displayed.

### 1.2. Rename Flow
- [ ] Long-press an existing flow on the flow list screen (or tap the edit icon) and select the rename option.
- [ ] Enter a new flow name and save it.
- [ ] Confirm that the flow name is updated on the flow list screen.

### 1.3. Delete Flow
- [ ] Long-press an existing flow on the flow list screen (or tap the delete icon) and select the delete option.
- [ ] Confirm that a confirmation dialog is displayed.
- [ ] Confirm the deletion and verify that the flow is removed from the list.

### 1.4. Display Flow List
- [ ] Confirm that the flow list screen is displayed correctly when the app starts.
- [ ] Confirm that all flows are displayed in the list if multiple flows have been created.
- [ ] Confirm that scrolling operates smoothly.

### 1.5. Export Flow
- [ ] Select the flow you want to export on the flow list screen.
- [ ] Select "Zip format" from the export menu.
- [ ] Confirm that a Zip file is generated and a share menu is displayed.
- [ ] Select "Canvas format (JSON)" from the export menu.
- [ ] Select Obsidian and confirm that the Canvas file is saved.

### 1.6. Multi-select and Batch Delete Flows
- [ ] Enter multi-select mode on the flow list screen.
- [ ] Select multiple flows.
- [ ] Tap the "Batch Delete" button.
- [ ] Confirm that a confirmation dialog is displayed.
- [ ] Confirm the deletion and verify that all selected flows are removed from the list.

### 1.7. Sort Flows
- [ ] Open the sort options on the flow list screen.
- [ ] Select a sort criterion such as "By Creation Date", "By Update Date", or "By Name".
- [ ] Confirm that the display order of flows changes according to the selected criterion.
- [ ] Confirm that switching between ascending/descending order functions correctly.

### 1.8. Search Flows
- [ ] Tap the search bar on the flow list screen.
- [ ] Enter part of a flow name.
- [ ] Confirm that only flows containing the entered string are displayed in the list.
- [ ] Confirm that a message is displayed correctly when there are no search results.
- [ ] Confirm that all flows are displayed again when the search bar is cleared.

## 2. Card Operation Features (Editor Screen)

### 2.1. Create New Card
- [ ] Tap the "Create New Card" button (or tap an empty space on the screen) on the flow editor screen.
- [ ] Confirm that a new card is added to the screen.
- [ ] Confirm that the default card title is displayed.

### 2.2. Edit Card Content
- [ ] Tap a card to enter edit mode.
- [ ] Enter a title and description, then save.
- [ ] Confirm that the updated title and description are displayed on the card.

### 2.3. Card Attachment (URL)
- [ ] On the card edit screen, select "Add URL".
- [ ] Enter a valid URL and save.
- [ ] Confirm that a link icon and URL are displayed on the card.
- [ ] Confirm that tapping the link launches the browser.
- [ ] Confirm that the attached URL can be deleted.

### 2.4. Card Attachment (Image)
- [ ] On the card edit screen, select "Add Image".
- [ ] Select an image from the camera or gallery.
- [ ] Confirm that an image thumbnail is displayed on the card.
- [ ] Confirm that tapping the thumbnail displays the image in full screen.
- [ ] Confirm that the attached image can be deleted.

### 2.5. Card Attachment (Video)
- [ ] On the card edit screen, select "Add Video".
- [ ] Select a video from the gallery.
- [ ] Confirm that a video thumbnail is displayed on the card.
- [ ] Confirm that tapping the thumbnail plays the video.
- [ ] Confirm that the attached video can be deleted.

### 2.6. Card Attachment (Other Files)
- [ ] On the card edit screen, select "Add File".
- [ ] Select a file (PDF, text file, etc.) from the document picker.
- [ ] Confirm that the file name and icon are displayed on the card.
- [ ] Confirm that tapping opens the file in the corresponding app.
- [ ] Confirm that the attached file can be deleted.

### 2.7. Move Card
- [ ] Long-press and drag a card to move it to another position on the screen.
- [ ] Confirm that the card moves smoothly and is fixed at the released position.

### 2.8. Change Card Style
- [ ] Select a card and open the style edit menu.
- [ ] Confirm that changing the card's background color is reflected immediately.
- [ ] Confirm that changing the card's size (width/height) is reflected immediately.
- [ ] Confirm that the changed style is saved and maintained after re-display.

### 2.9. Delete Card
- [ ] Long-press a card (or tap the delete icon) and select the delete option.
- [ ] Confirm that a confirmation dialog is displayed.
- [ ] Confirm the deletion and verify that the card is removed from the screen.

## 3. Arrow (Connection) Operation Features

### 3.1. Create Unidirectional Arrow
- [ ] Tap the starting card, then tap the ending card you want to connect.
- [ ] Confirm that a unidirectional arrow is drawn correctly from the starting point to the ending point.

### 3.2. Change to Bidirectional Arrow
- [ ] With an existing unidirectional arrow, tap the cards again in reverse order (ending → starting).
- [ ] Confirm that the arrow becomes bidirectional.

### 3.3. Delete Arrow
- [ ] Tap an existing arrow.
- [ ] Confirm that the arrow is removed from the screen.

## 4. UI Operation Features (Editor Screen)

### 4.1. Zoom In/Out
- [ ] Perform pinch-in/pinch-out gestures on the flow editor screen.
- [ ] Confirm that the screen zooms in/out smoothly.
- [ ] Confirm that cards and arrows are displayed correctly after zooming.

### 4.2. Pan (Screen Movement)
- [ ] Perform a drag gesture on the flow editor screen.
- [ ] Confirm that the screen moves smoothly.
- [ ] Confirm that cards and arrows are displayed correctly after movement.

### 4.3. Alignment Function
- [ ] Select multiple cards.
- [ ] Select "Align Left", "Align Center", "Align Right", etc., from the alignment menu.
- [ ] Confirm that the selected cards are aligned as specified.
- [ ] Select "Distribute Evenly", etc., and confirm that the cards are spaced equally.

### 4.4. Section Operations (Hierarchical Navigation)
- [ ] Double-tap any card.
- [ ] Confirm that you move inside the double-tapped card, and that card is displayed as the parent section.
- [ ] Confirm that you can create new cards or edit existing cards within the moved section.
- [ ] Tap the "Section Up" FAB button displayed at the bottom of the screen.
- [ ] Confirm that you return to the parent section (original flow), and the child section (the double-tapped card) is displayed in its original position.
- [ ] Confirm that you can correctly return to the parent section even after navigating through multiple hierarchies.

### 4.5. See-Through Function
- [ ] With cards overlapping, switch the front card to see-through display.
- [ ] Confirm that the front card becomes semi-transparent, allowing the cards behind it to be seen.
- [ ] Confirm that card operations (moving, tapping, etc.) are possible even in see-through mode.
- [ ] Confirm that the see-through display can be reverted.

## 5. Data Persistence

### 5.1. Data Retention After App Restart
- [ ] Create multiple flows, cards, arrows, and style changes.
- [ ] Completely close the app and restart it.
- [ ] Confirm that all created flows, cards, arrows, and styles are displayed in their original state.

## 6. Internationalization Support

### 6.1. Language Switching
- [ ] Switch the language from Japanese to English (or vice versa) in the app's settings (or OS settings).
- [ ] Confirm that UI text within the app (buttons, menus, default card titles, etc.) is displayed in the switched language.
- [ ] Confirm that functions operate correctly after language switching.

## 7. Other

### 7.1. Database Initialization
- [ ] Tap the "Initialize Database" button from the settings screen.
- [ ] Confirm that a warning dialog about complete data deletion is displayed.
- [ ] Tap "Cancel" in the dialog and confirm that no data has been deleted.
- [ ] Tap the initialize button again and confirm "Initialize" in the dialog.
- [ ] Confirm that all flows, cards, arrows, and other data are deleted, and the app returns to its initial state.
- [ ] Restart the app and confirm that the empty data state is maintained.