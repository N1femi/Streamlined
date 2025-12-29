# Pomodoro Tab Groups Chrome Extension

A Chrome extension that uses tab groupings to organize your work and break tabs, automatically opening and closing them based on Pomodoro timer sessions.

## Features

- 🍅 **Pomodoro Timer**: Customizable work and break durations
- 📑 **Tab Grouping**: Automatically organizes tabs into work and break groups
- ⏰ **Auto Tab Management**: Opens work tabs during work sessions, break tabs during breaks
- 🔄 **Auto-start**: Option to automatically start the next session
- 🎨 **Beautiful UI**: Modern & customizable interface

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the folder containing this extension

## Icon Setup

The extension requires icon files. You can:
- Create your own icons (16x16, 48x48, 128x128 pixels) and save them as `icon16.png`, `icon48.png`, and `icon128.png`
- Or temporarily remove the icon references from `manifest.json` to test the extension

## How to Use

1. **Setup Work Tabs**: 
   - Open all the tabs you want to use during work sessions
   - Click "Setup Work Tabs" in the extension popup
   - These tabs will be saved and opened during work sessions

2. **Setup Break Tabs**:
   - Open all the tabs you want to use during break sessions
   - Click "Setup Break Tabs" in the extension popup
   - These tabs will be saved and opened during break sessions

3. **Configure Settings**:
   - Set your preferred work duration (default: 25 minutes)
   - Set your preferred break duration (default: 5 minutes)
   - Set long break duration (default: 15 minutes)
   - Set how many sessions until a long break (default: 4)
   - Enable/disable auto-start for next session
   - Click "Save Settings"

4. **Start a Session**:
   - Click "Start" to begin a Pomodoro session
   - During work sessions, only work tabs will be open
   - During break sessions, only break tabs will be open
   - The timer will automatically switch between work and break sessions

## How It Works

- When a work session starts, the extension closes break tabs and opens work tabs
- When a break session starts, the extension closes work tabs and opens break tabs
- The extension uses Chrome's Tab Groups API to organize tabs
- Timer state persists even if you close the popup

## Permissions

- `tabs`: Required to manage and group tabs
- `tabGroups`: Required to create and manage tab groups
- `storage`: Required to save settings and state
- `alarms`: Required for timer functionality

## Development

The extension uses:
- Manifest V3
- Chrome Tab Groups API
- Chrome Alarms API
- Chrome Storage API

## Notes

- Chrome system pages (chrome://) are automatically excluded from tab groups
- Tab groups are created automatically when needed
- The extension remembers your tab configurations across browser restarts

