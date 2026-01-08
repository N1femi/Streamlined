// Background service worker for Pomodoro Tab Groups

// Default settings
const DEFAULT_SETTINGS = {
  workDuration: 25, // minutes
  breakDuration: 5, // minutes
  longBreakDuration: 15, // minutes
  sessionsUntilLongBreak: 4,
  autoStart: false,
  showWarning: true,
  showCountdown: false,
  testMode: false, // If true, durations are in seconds instead of minutes
  showBadge: true, // Show countdown on extension badge
  showTabTitle: true // Show countdown in tab title
}

// State management
let currentState = {
  isRunning: false,
  isPaused: false,
  currentSession: 0,
  startTime: null,
  endTime: null,
  pausedTime: null, // Time when paused
  pausedDuration: 0, // Total paused duration in ms
  isWorkSession: true,
  tabGroups: [],
  managedTabIds: {
    work: [], // Tab IDs that extension created for work
    break: [] // Tab IDs that extension created for break
  }
}

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.sync.get(['settings'])
  if (!settings.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
  }
  await chrome.storage.local.set({ state: currentState })
  
  // Request notification permission
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: 'Pomodoro Tab Groups',
    message: 'Extension installed! Click the icon to get started.'
  }, () => {
    // Permission requested (or already granted)
  })
})