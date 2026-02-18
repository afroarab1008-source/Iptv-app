# Testing Guide for IPTV App

## Quick Start

### 1. Install Dependencies (if not already done)
```powershell
cd c:\Users\JD\iptv-app
npm install
```

### 2. Start Development Server
```powershell
npm run dev
```

The app will start at `http://localhost:5173` (or another port if 5173 is busy).

## Testing Scenarios

### Test 1: Load M3U Playlist from File

1. **Start the app** - You should see the welcome screen with "Upload M3U File" and "Load from URL" buttons
2. **Click "Upload M3U File"**
3. **Select the example playlist**: `public/example-playlist.m3u`
4. **Expected Result**: 
   - Channels should load and display in grid view
   - You should see 3 test channels (Test Channel 1, 2, 3)
   - Groups should appear: Entertainment, News, Sports

### Test 2: Load M3U Playlist from URL

1. **Click "Load from URL"**
2. **Enter a valid M3U URL** (or use the example playlist URL if hosted)
3. **Click "Load"**
4. **Expected Result**: Channels should load and display

### Test 3: Search Functionality

1. **After loading channels**, use the search bar at the top
2. **Type "Test"** - Should filter to show all test channels
3. **Type "News"** - Should show only Test Channel 2
4. **Clear search** - Click the X button or delete text
5. **Expected Result**: All channels should reappear

### Test 4: Group Filtering

1. **After loading channels**, click on group buttons:
   - Click "Entertainment" - Should show only Test Channel 1
   - Click "News" - Should show only Test Channel 2
   - Click "Sports" - Should show only Test Channel 3
   - Click "All" - Should show all channels
2. **Expected Result**: Channels filter correctly by group

### Test 5: View Modes

1. **Click the Grid icon** (top right) - Should show channels in grid layout
2. **Click the List icon** - Should show channels in list layout
3. **Expected Result**: View switches between grid and list modes

### Test 6: Play a Channel

1. **Click on any channel** (e.g., Test Channel 1)
2. **Expected Result**:
   - Video player should open in full screen
   - Channel name and logo should appear at the top
   - Video should start playing (if stream is valid)
   - Player controls should be visible

### Test 7: Video Player Controls

1. **While playing a channel**:
   - Click pause/play button
   - Adjust volume slider
   - Click fullscreen button (top right)
   - Click X button to close player
2. **Expected Result**: All controls work correctly

### Test 8: Favorites

1. **Hover over a channel card** - Heart icon should appear
2. **Click the heart icon** - Should turn red (favorited)
3. **Click again** - Should unfavorite
4. **Open sidebar** (click menu button on mobile, or sidebar visible on desktop)
5. **Click "Favorites" tab** - Should show favorited channels
6. **Expected Result**: Favorites persist and can be accessed from sidebar

### Test 9: Recent Channels

1. **Play a few different channels** (open and close player)
2. **Open sidebar** → **Click "Recent" tab**
3. **Expected Result**: Recently watched channels should appear in order

### Test 10: Settings

1. **Open sidebar** → **Click "Settings" tab**
2. **Change Video Quality** - Select different options (Auto, SD, HD, FHD, 4K)
3. **Change View Mode** - Switch between Grid and List
4. **Expected Result**: Settings should persist after page refresh

### Test 11: Responsive Design

1. **Resize browser window** or use browser dev tools
2. **Mobile view** (< 1024px):
   - Sidebar should be hidden by default
   - Menu button should appear in top-left
   - Grid should show fewer columns
3. **Desktop view** (> 1024px):
   - Sidebar should be visible
   - Menu button should be hidden
   - Grid should show more columns
4. **Expected Result**: Layout adapts correctly to screen size

### Test 12: Error Handling

1. **Try loading an invalid M3U file** - Should show error message
2. **Try loading from invalid URL** - Should show error message
3. **Try playing a broken stream** - Should handle gracefully
4. **Expected Result**: Errors are caught and user-friendly messages shown

## Testing with Real IPTV Streams

### Finding Test Streams

You can use these public test streams for testing:

1. **Mux Test Streams** (already in example-playlist.m3u):
   - `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`

2. **Sample M3U Playlists**:
   - Search for "free iptv m3u playlist" online
   - Use public test playlists (be aware of legal/copyright issues)

### Creating Your Own Test Playlist

Create a `.m3u` file with this format:

```
#EXTM3U
#EXTINF:-1 tvg-id="channel1" tvg-name="Channel Name" tvg-logo="https://example.com/logo.png" group-title="Category",Channel Name
https://stream-url.com/stream.m3u8
```

## Browser Testing

Test in multiple browsers:
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (if on Mac)

## Performance Testing

1. **Load a large playlist** (100+ channels)
2. **Test scrolling** - Should be smooth
3. **Test search** - Should be fast and responsive
4. **Test switching channels** - Should be quick

## Common Issues to Check

- [ ] Channels load correctly from file
- [ ] Channels load correctly from URL
- [ ] Search filters work
- [ ] Group filters work
- [ ] Video player plays streams
- [ ] Favorites persist after refresh
- [ ] Recent channels work
- [ ] Settings persist
- [ ] Mobile responsive design works
- [ ] No console errors
- [ ] No memory leaks (check with browser dev tools)

## Debugging Tips

1. **Open Browser DevTools** (F12):
   - Check Console for errors
   - Check Network tab for failed requests
   - Check Application tab → Local Storage to see persisted data

2. **Check Video Player**:
   - If video doesn't play, check browser console for CORS errors
   - Some streams may require CORS headers
   - HLS streams work best in Chrome/Edge

3. **Check State Management**:
   - Use React DevTools to inspect Zustand store
   - Check localStorage for persisted data

## Running Production Build

To test the production build:

```powershell
npm run build
npm run preview
```

This will create an optimized build and serve it locally for testing.
