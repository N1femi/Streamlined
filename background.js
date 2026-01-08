const DEFAULT_SETTINGS = {
  workDuration: 25,
  breakDuration: 5,
  longBreakDuration: 15,
  sessionsUntilLongBreak: 4,
  autoStart: false,
  showWarning: true,
  showCountdown: false,
  testMode: false, // Changes minutes to seconds if true
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
  const syncedStorage = await chrome.storage.sync.get(['settings'])

  if (!syncedStorage.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
  }
  await chrome.storage.local.set({ state: currentState })
})