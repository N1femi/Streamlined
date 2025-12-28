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
};

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
};

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.sync.get(['settings']);
  if (!settings.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
  await chrome.storage.local.set({ state: currentState });
  
  // Request notification permission
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: 'Pomodoro Tab Groups',
    message: 'Extension installed! Click the icon to get started.'
  }, () => {
    // Permission requested (or already granted)
  });
});

// Load state from storage
async function loadState() {
  const result = await chrome.storage.local.get(['state']);
  if (result.state) {
    currentState = { ...currentState, ...result.state };
  }
  return currentState;
}

// Save state to storage
async function saveState() {
  await chrome.storage.local.set({ state: currentState });
}

// Get all tabs
async function getAllTabs() {
  return await chrome.tabs.query({});
}

// Create tab group with tabs (Chrome requires at least one tab to create a group)
async function createTabGroupWithTabs(tabIds, name, color = 'blue') {
  if (!tabIds || tabIds.length === 0) {
    throw new Error('Cannot create group without tabs');
  }
  
  try {
    // Group the tabs
    const groupId = await chrome.tabs.group({ tabIds });
    
    // Update group properties
    await chrome.tabGroups.update(groupId, {
      title: name,
      color: color
    });
    
    return groupId;
  } catch (error) {
    console.error('Error creating tab group:', error);
    throw error;
  }
}

// Add tabs to group
async function addTabsToGroup(groupId, tabIds) {
  if (tabIds.length === 0) return;
  try {
    // Filter out invalid tab IDs
    const validTabIds = [];
    for (const tabId of tabIds) {
      try {
        await chrome.tabs.get(tabId);
        validTabIds.push(tabId);
      } catch (error) {
        // Tab doesn't exist, skip it
        console.log('Tab no longer exists:', tabId);
      }
    }
    
    if (validTabIds.length > 0) {
      await chrome.tabs.group({ groupId, tabIds: validTabIds });
    }
  } catch (error) {
    console.error('Error adding tabs to group:', error);
  }
}

// Remove tabs from group
async function removeTabsFromGroup(tabIds) {
  if (tabIds.length === 0) return;
  try {
    await chrome.tabs.ungroup(tabIds);
  } catch (error) {
    console.error('Error removing tabs from group:', error);
  }
}

// Close tabs in group (only extension-managed tabs)
async function closeTabsInGroup(groupId, groupType) {
  try {
    const state = await loadState();
    const managedIds = state.managedTabIds?.[groupType] || [];
    
    if (managedIds.length === 0) return;
    
    // Verify these tabs still exist and are in the group
    const allTabs = await chrome.tabs.query({ groupId });
    const existingManagedIds = managedIds.filter(id => 
      allTabs.some(tab => tab.id === id)
    );
    
    if (existingManagedIds.length > 0) {
      await chrome.tabs.remove(existingManagedIds);
      // Clear managed tab IDs for this group
      state.managedTabIds[groupType] = [];
      await saveState();
    }
  } catch (error) {
    console.error('Error closing tabs in group:', error);
  }
}

// Close only extension-managed tabs for a group type
async function closeManagedTabs(groupType) {
  try {
    const state = await loadState();
    const managedIds = state.managedTabIds?.[groupType] || [];
    
    if (managedIds.length === 0) return;
    
    // Check which managed tabs still exist
    const allTabs = await chrome.tabs.query({});
    const existingManagedIds = managedIds.filter(id => 
      allTabs.some(tab => tab.id === id)
    );
    
    if (existingManagedIds.length > 0) {
      await chrome.tabs.remove(existingManagedIds);
      // Clear managed tab IDs for this group
      state.managedTabIds[groupType] = [];
      await saveState();
    }
  } catch (error) {
    console.error('Error closing managed tabs:', error);
  }
}

// Open tabs in group (restore from saved URLs)
async function openTabsInGroup(groupId, urls, groupType) {
  if (!urls || urls.length === 0) return [];
  
  const state = await loadState();
  const tabIds = [];
  
  // Get all existing tabs to check for duplicates
  const existingTabs = await chrome.tabs.query({});
  const existingUrls = new Set(existingTabs.map(tab => tab.url));
  
  // Open all tabs first (even if some exist, we'll group them)
  for (const url of urls) {
    let tabId = null;
    
    // Check if tab already exists
    const existingTab = existingTabs.find(tab => tab.url === url);
    
    if (existingTab && existingTab.id) {
      // Tab exists, use it
      tabId = existingTab.id;
    } else {
      // Create new tab
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        if (tab && tab.id) {
          tabId = tab.id;
        }
      } catch (error) {
        console.error('Error opening tab:', error);
        continue;
      }
    }
    
    if (tabId) {
      tabIds.push(tabId);
    }
  }
  
  // Group all tabs together
  if (tabIds.length > 0) {
    try {
      // Validate all tab IDs still exist
      const validTabIds = [];
      for (const tabId of tabIds) {
        try {
          await chrome.tabs.get(tabId);
          validTabIds.push(tabId);
        } catch (error) {
          // Tab doesn't exist anymore, skip it
          console.log('Tab no longer exists:', tabId);
        }
      }
      
      if (validTabIds.length === 0) {
        console.log('No valid tabs to group');
        return [];
      }
      
      // Remove tabs from any existing groups first
      for (const tabId of validTabIds) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.groupId !== chrome.tabs.TAB_GROUP_ID_NONE) {
            await chrome.tabs.ungroup([tabId]);
          }
        } catch (error) {
          // Tab might not exist, continue
        }
      }
      
      // Create or update group
      const groupName = groupType === 'work' ? 'Work Tabs' : 'Break Tabs';
      const groupColor = groupType === 'work' ? 'blue' : 'green';
      
      if (groupId) {
        // Group exists, add tabs to it
        try {
          await chrome.tabs.group({ groupId, tabIds: validTabIds });
          // Update group properties
          await chrome.tabGroups.update(groupId, {
            title: groupName,
            color: groupColor
          });
        } catch (error) {
          // Group might not exist, create new one
          console.log('Group does not exist, creating new one');
          groupId = await createTabGroupWithTabs(validTabIds, groupName, groupColor);
          
          // Update state with new groupId
          const group = state.tabGroups.find(g => g.type === groupType);
          if (group) {
            group.groupId = groupId;
            await saveState();
          }
        }
      } else {
        // Create new group
        groupId = await createTabGroupWithTabs(validTabIds, groupName, groupColor);
        
        // Update state with new groupId
        const group = state.tabGroups.find(g => g.type === groupType);
        if (group) {
          group.groupId = groupId;
          await saveState();
        }
      }
      
      // Track these tabs as extension-managed
      currentState = await loadState();
      if (!currentState.managedTabIds) {
        currentState.managedTabIds = { work: [], break: [] };
      }
      currentState.managedTabIds[groupType] = validTabIds;
      await saveState();
    } catch (error) {
      console.error('Error grouping tabs:', error);
    }
  }
  
  return tabIds;
}

// Start Pomodoro session
async function startSession() {
  const state = await loadState();
  const settings = await chrome.storage.sync.get(['settings']);
  const config = settings.settings || DEFAULT_SETTINGS;
  
  const duration = state.isWorkSession 
    ? config.workDuration 
    : (state.currentSession % config.sessionsUntilLongBreak === 0 
        ? config.longBreakDuration 
        : config.breakDuration);
  
  const now = Date.now();
  // If test mode, use seconds; otherwise use minutes
  const multiplier = config.testMode ? 1000 : 60 * 1000;
  const endTime = now + (duration * multiplier);
  
  currentState = {
    ...state,
    isRunning: true,
    isPaused: false,
    startTime: now,
    endTime: endTime,
    pausedTime: null,
    pausedDuration: 0
  };
  
  await saveState();
  
  // Handle tab switching when session starts
  if (state.isWorkSession) {
    // Starting work session - close break tabs, open work tabs
    await handleWorkSessionStart();
  } else {
    // Starting break session - close work tabs, open break tabs
    await handleBreakSessionStart();
  }
  
  // Set alarm for session end
  chrome.alarms.create('sessionEnd', { when: endTime });
  
  // Set alarm for 5-minute warning (or 5 seconds in test mode)
  const warningMultiplier = config.testMode ? 5000 : 5 * 60 * 1000;
  const warningTime = endTime - warningMultiplier;
  if (warningTime > now) {
    chrome.alarms.create('sessionWarning', { when: warningTime });
  }
  
  // Notify popup
  chrome.runtime.sendMessage({ type: 'sessionStarted', state: currentState });
}

// Handle work session start
async function handleWorkSessionStart() {
  const state = await loadState();
  
  // Close only extension-managed break tabs
  await closeManagedTabs('break');
  
  // Open work tabs
  const workGroup = state.tabGroups.find(g => g.type === 'work');
  if (workGroup && workGroup.urls && workGroup.urls.length > 0) {
    await openTabsInGroup(workGroup.groupId, workGroup.urls, 'work');
  }
}

// Handle break session start
async function handleBreakSessionStart() {
  const state = await loadState();
  
  // Close only extension-managed work tabs
  await closeManagedTabs('work');
  
  // Open break tabs
  const breakGroup = state.tabGroups.find(g => g.type === 'break');
  if (breakGroup && breakGroup.urls && breakGroup.urls.length > 0) {
    await openTabsInGroup(breakGroup.groupId, breakGroup.urls, 'break');
  }
}

// End Pomodoro session
async function endSession() {
  const state = await loadState();
  const settings = await chrome.storage.sync.get(['settings']);
  const config = settings.settings || DEFAULT_SETTINGS;
  
  // Don't do anything to tabs - just leave them as they are
  
  // Update state
  const newIsWorkSession = !state.isWorkSession;
  const newSession = newIsWorkSession ? state.currentSession + 1 : state.currentSession;
  
  currentState = {
    ...state,
    isRunning: false,
    isWorkSession: newIsWorkSession,
    currentSession: newSession,
    startTime: null,
    endTime: null
  };
  
  await saveState();
  
  // Clear alarm
  chrome.alarms.clear('sessionEnd');
  
  // Notify popup
  chrome.runtime.sendMessage({ type: 'sessionEnded', state: currentState });
  
  // Auto-start next session if enabled
  if (config.autoStart) {
    setTimeout(() => startSession(), 1000);
  }
}

// Handle work session end
async function handleWorkSessionEnd() {
  const state = await loadState();
  
  // Close only extension-managed work tabs
  await closeManagedTabs('work');
  
  // Find break tab group and open break tabs
  const breakGroup = state.tabGroups.find(g => g.type === 'break');
  if (breakGroup && breakGroup.urls && breakGroup.urls.length > 0) {
    await openTabsInGroup(breakGroup.groupId, breakGroup.urls, 'break');
  }
}

// Handle break session end
async function handleBreakSessionEnd() {
  const state = await loadState();
  
  // Close only extension-managed break tabs
  await closeManagedTabs('break');
  
  // Find work tab group and open work tabs
  const workGroup = state.tabGroups.find(g => g.type === 'work');
  if (workGroup && workGroup.urls && workGroup.urls.length > 0) {
    await openTabsInGroup(workGroup.groupId, workGroup.urls, 'work');
  }
}

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sessionEnd') {
    await endSession();
  } else if (alarm.name === 'sessionWarning') {
    await showWarningNotification();
  } else if (alarm.name.startsWith('countdown_')) {
    const timeValue = parseInt(alarm.name.split('_')[1]);
    const state = await loadState();
    if (!state.isRunning) return;
    
    const settings = await chrome.storage.sync.get(['settings']);
    const config = settings.settings || DEFAULT_SETTINGS;
    const sessionType = state.isWorkSession ? 'Work' : 'Break';
    
    let message;
    if (config.testMode) {
      message = `${timeValue} second${timeValue !== 1 ? 's' : ''} remaining`;
    } else {
      message = `${timeValue} minute${timeValue !== 1 ? 's' : ''} remaining`;
    }
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: `${sessionType} Session`,
      message: message,
      priority: 1
    });
  }
});

// Show 5-minute warning notification
async function showWarningNotification() {
  const state = await loadState();
  const settings = await chrome.storage.sync.get(['settings']);
  const config = settings.settings || DEFAULT_SETTINGS;
  
  if (!config.showWarning) return;
  
  const sessionType = state.isWorkSession ? 'Work' : 'Break';
  const remaining = Math.max(0, state.endTime - Date.now());
  
  let timeText;
  if (config.testMode) {
    const seconds = Math.floor(remaining / 1000);
    timeText = `${seconds} second${seconds !== 1 ? 's' : ''}`;
  } else {
    const minutes = Math.floor(remaining / 60000);
    timeText = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  // Progressive notification styles based on urgency
  let priority = 1;
  let message = `Only ${timeText} remaining!`;
  
  if (config.testMode) {
    if (remaining <= 10000) {
      priority = 2;
      message = `⚠️ ${timeText} left - Break ending soon!`;
    } else if (remaining <= 30000) {
      priority = 1;
      message = `⏰ ${timeText} remaining`;
    }
  } else {
    const minutes = Math.floor(remaining / 60000);
    if (minutes <= 1) {
      priority = 2;
      message = `⚠️ ${timeText} left - Break ending soon!`;
    } else if (minutes <= 2) {
      priority = 1;
      message = `⏰ ${timeText} remaining`;
    }
  }
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: `${sessionType} Session`,
    message: message,
    priority: priority
  });
  
  // If countdown enabled, set up countdown notifications
  const minTime = config.testMode ? 1000 : 60000;
  if (config.showCountdown && remaining > minTime) {
    await setupCountdownNotifications(remaining, config.testMode);
  }
}

// Setup countdown notifications (every minute or second in test mode)
async function setupCountdownNotifications(remainingMs, testMode = false) {
  if (testMode) {
    // In test mode, notify every second
    const seconds = Math.floor(remainingMs / 1000);
    for (let i = Math.min(seconds - 1, 9); i > 0; i--) {
      const when = Date.now() + (i * 1000);
      chrome.alarms.create(`countdown_${i}`, { when });
    }
  } else {
    // Normal mode: notify every minute
    const minutes = Math.floor(remainingMs / 60000);
    for (let i = Math.min(minutes - 1, 4); i > 0; i--) {
      const when = Date.now() + (i * 60 * 1000);
      chrome.alarms.create(`countdown_${i}`, { when });
    }
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'startSession':
        await startSession();
        sendResponse({ success: true });
        break;
        
      case 'pauseSession':
        const pauseState = await loadState();
        if (pauseState.isRunning && !pauseState.isPaused) {
          currentState.isPaused = true;
          currentState.pausedTime = Date.now();
          await saveState();
          
          // Clear all alarms
          chrome.alarms.clear('sessionEnd');
          chrome.alarms.clear('sessionWarning');
          const allAlarms = await chrome.alarms.getAll();
          for (const alarm of allAlarms) {
            if (alarm.name.startsWith('countdown_')) {
              await chrome.alarms.clear(alarm.name);
            }
          }
          
          // Clear badge and tab title
          chrome.action.setBadgeText({ text: '⏸' });
          await restoreTabTitles();
        }
        sendResponse({ success: true });
        break;
        
      case 'resumeSession':
        const resumeState = await loadState();
        if (resumeState.isRunning && resumeState.isPaused) {
          const now = Date.now();
          const pausedDuration = now - (resumeState.pausedTime || now);
          const totalPausedDuration = (resumeState.pausedDuration || 0) + pausedDuration;
          
          // Adjust endTime by adding paused duration
          const newEndTime = (resumeState.endTime || now) + totalPausedDuration;
          
          currentState.isPaused = false;
          currentState.pausedTime = null;
          currentState.pausedDuration = totalPausedDuration;
          currentState.endTime = newEndTime;
          await saveState();
          
          // Recreate alarms with adjusted times
          const settings = await chrome.storage.sync.get(['settings']);
          const config = settings.settings || DEFAULT_SETTINGS;
          
          chrome.alarms.create('sessionEnd', { when: newEndTime });
          
          const warningMultiplier = config.testMode ? 5000 : 5 * 60 * 1000;
          const warningTime = newEndTime - warningMultiplier;
          if (warningTime > now) {
            chrome.alarms.create('sessionWarning', { when: warningTime });
          }
          
          if (config.showCountdown) {
            const remaining = newEndTime - now;
            const minTime = config.testMode ? 1000 : 60000;
            if (remaining > minTime) {
              await setupCountdownNotifications(remaining, config.testMode);
            }
          }
        }
        sendResponse({ success: true });
        break;
        
      case 'stopSession':
        const stopState = await loadState();
        currentState.isRunning = false;
        currentState.isPaused = false;
        currentState.pausedTime = null;
        currentState.pausedDuration = 0;
        await saveState();
        chrome.alarms.clear('sessionEnd');
        chrome.alarms.clear('sessionWarning');
        // Clear all countdown alarms
        const allAlarms = await chrome.alarms.getAll();
        for (const alarm of allAlarms) {
          if (alarm.name.startsWith('countdown_')) {
            await chrome.alarms.clear(alarm.name);
          }
        }
        
        // Clear badge and restore tab titles
        chrome.action.setBadgeText({ text: '' });
        await restoreTabTitles();
        
        // Close work tabs if session was running (only extension-managed ones)
        if (stopState.isRunning && stopState.isWorkSession) {
          await closeManagedTabs('work');
        }
        
        sendResponse({ success: true });
        break;
        
      case 'getState':
        const state = await loadState();
        sendResponse({ state });
        break;
        
      case 'updateTabGroups':
        currentState.tabGroups = message.tabGroups;
        await saveState();
        sendResponse({ success: true });
        break;
        
      case 'saveWorkTabs':
        const tabs = await chrome.tabs.query({});
        const workGroup = currentState.tabGroups.find(g => g.type === 'work');
        if (workGroup) {
          workGroup.urls = tabs.map(tab => tab.url).filter(url => url && !url.startsWith('chrome://'));
          await saveState();
        }
        sendResponse({ success: true });
        break;
        
      case 'saveBreakTabs':
        const breakTabs = await chrome.tabs.query({});
        const breakGroup = currentState.tabGroups.find(g => g.type === 'break');
        if (breakGroup) {
          breakGroup.urls = breakTabs.map(tab => tab.url).filter(url => url && !url.startsWith('chrome://'));
          await saveState();
        }
        sendResponse({ success: true });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  })();
  return true; // Keep message channel open for async response
});

// Update badge and tab title with countdown
async function updateCountdownDisplay() {
  const state = await loadState();
  if (!state.isRunning || !state.endTime) {
    // Clear badge and restore tab titles when not running
    chrome.action.setBadgeText({ text: '' });
    await restoreTabTitles();
    return;
  }
  
  // If paused, show pause indicator
  if (state.isPaused) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#c47a1e' }); // Orange
    return;
  }
  
  const settings = await chrome.storage.sync.get(['settings']);
  const config = settings.settings || DEFAULT_SETTINGS;
  
  const remaining = Math.max(0, state.endTime - Date.now());
  
  if (remaining === 0) {
    await endSession();
    return;
  }
  
  // Update badge
  if (config.showBadge) {
    let badgeText = '';
    if (config.testMode) {
      const seconds = Math.floor(remaining / 1000);
      if (seconds > 0) {
        badgeText = seconds <= 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
      }
    } else {
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      if (minutes > 0) {
        badgeText = `${minutes}m`;
      } else if (seconds > 0) {
        badgeText = `${seconds}s`;
      }
    }
    
    chrome.action.setBadgeText({ text: badgeText });
    
    // Change badge color based on urgency
    if (config.testMode) {
      if (remaining <= 10000) {
        chrome.action.setBadgeBackgroundColor({ color: '#c41e3a' }); // Red
      } else if (remaining <= 30000) {
        chrome.action.setBadgeBackgroundColor({ color: '#c47a1e' }); // Orange
      } else {
        chrome.action.setBadgeBackgroundColor({ color: '#3ac41e' }); // Green
      }
    } else {
      if (remaining <= 60000) {
        chrome.action.setBadgeBackgroundColor({ color: '#c41e3a' }); // Red
      } else if (remaining <= 120000) {
        chrome.action.setBadgeBackgroundColor({ color: '#c47a1e' }); // Orange
      } else {
        chrome.action.setBadgeBackgroundColor({ color: '#3ac41e' }); // Green
      }
    }
  }
  
  // Update tab title
  if (config.showTabTitle) {
    await updateTabTitleCountdown(remaining, config.testMode);
  }
}

// Update active tab title with countdown
async function updateTabTitleCountdown(remainingMs, testMode) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    
    const activeTab = tabs[0];
    if (!activeTab.id) return;
    
    let countdownText = '';
    if (testMode) {
      const seconds = Math.floor(remainingMs / 1000);
      countdownText = seconds > 0 ? `(${seconds}s) ` : '';
    } else {
      const minutes = Math.floor(remainingMs / 60000);
      const seconds = Math.floor((remainingMs % 60000) / 1000);
      if (minutes > 0) {
        countdownText = `(${minutes}m) `;
      } else if (seconds > 0) {
        countdownText = `(${seconds}s) `;
      }
    }
    
    // Store original title if not already stored
    if (!activeTab.title || !activeTab.title.startsWith('(')) {
      await chrome.storage.local.set({ 
        [`tabTitle_${activeTab.id}`]: activeTab.title || '' 
      });
    }
    
    // Get original title
    const stored = await chrome.storage.local.get([`tabTitle_${activeTab.id}`]);
    const originalTitle = stored[`tabTitle_${activeTab.id}`] || activeTab.title || '';
    
    // Remove countdown prefix if it exists
    const cleanTitle = originalTitle.replace(/^\(\d+[ms]\)\s/, '');
    
    // Update title with countdown
    if (countdownText) {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (text) => { document.title = text; },
        args: [countdownText + cleanTitle]
      });
    }
  } catch (error) {
    // Tab might not be accessible, ignore
  }
}

// Restore original tab titles
async function restoreTabTitles() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      const stored = await chrome.storage.local.get([`tabTitle_${tab.id}`]);
      const originalTitle = stored[`tabTitle_${tab.id}`];
      if (originalTitle && tab.title && tab.title.startsWith('(')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (text) => { document.title = text; },
            args: [originalTitle]
          });
        } catch (error) {
          // Tab might not be accessible, ignore
        }
      }
    }
  } catch (error) {
    // Ignore errors
  }
}

// Periodic state update
setInterval(async () => {
  await updateCountdownDisplay();
}, 1000);

