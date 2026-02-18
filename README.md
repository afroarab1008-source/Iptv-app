# IPTV App - Modern Streaming Application

A modern, feature-rich IPTV streaming application built with React, TypeScript, and Video.js. Similar to Aya TV, this app allows you to stream live TV channels from M3U playlists.

## Features

- 📺 **Live TV Streaming** - Stream live TV channels from M3U playlists
- 🎬 **Video Player** - Built-in video player with HLS support
- 🔍 **Search & Filter** - Search channels and filter by groups/categories
- ⭐ **Favorites** - Save your favorite channels for quick access
- 🕐 **Recent Channels** - Quick access to recently watched channels
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices
- 🎨 **Modern UI** - Beautiful, dark-themed interface
- 📋 **M3U Support** - Load playlists from file or URL
- 🎯 **Grid/List Views** - Switch between grid and list view modes
- ⚙️ **Settings** - Customize video quality and view preferences

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. **Load a Playlist**: 
   - Click "Upload M3U File" to upload a local M3U file
   - Or click "Load from URL" and enter an M3U playlist URL

2. **Browse Channels**:
   - Use the search bar to find specific channels
   - Filter by groups/categories using the group buttons
   - Switch between grid and list views

3. **Watch Channels**:
   - Click on any channel to start streaming
   - Use the video player controls to pause, adjust volume, etc.
   - Click the fullscreen button for immersive viewing

4. **Manage Favorites**:
   - Click the heart icon on any channel to add/remove from favorites
   - Access favorites from the sidebar menu

5. **Settings**:
   - Open the sidebar and go to Settings
   - Adjust video quality preferences
   - Change view mode (grid/list)

## M3U Playlist Format

The app supports standard M3U playlist format:

```
#EXTM3U
#EXTINF:-1 tvg-id="channel1" tvg-name="Channel 1" tvg-logo="https://example.com/logo.png" group-title="Entertainment",Channel 1
https://example.com/stream1.m3u8
#EXTINF:-1 tvg-id="channel2" tvg-name="Channel 2" group-title="News",Channel 2
https://example.com/stream2.m3u8
```

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Video.js** - Video player
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Project Structure

```
iptv-app/
├── src/
│   ├── components/      # React components
│   │   ├── VideoPlayer.tsx
│   │   ├── ChannelList.tsx
│   │   └── Sidebar.tsx
│   ├── store/          # State management
│   │   └── iptvStore.ts
│   ├── utils/          # Utility functions
│   │   └── m3uParser.ts
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # Entry point
│   └── index.css       # Global styles
├── public/             # Static assets
└── package.json        # Dependencies
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Notes

- This app requires CORS-enabled M3U playlists and stream URLs
- Some streams may require authentication (not currently supported)
- HLS streams are recommended for best compatibility

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
