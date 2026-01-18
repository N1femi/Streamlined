let timerInterval = null
let currentState = null
let currentTabSelectionType = null // 'work' or 'break'
let allTabs = []

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadTheme()
  await loadSettings()
  await loadState()
  setupEventListeners()
  setupSettingsListeners()
  setupPageNavigation()
  setupThemeSelector()
  startTimerUpdate()
})

// Load theme from storage
async function loadTheme() {
  const result = await chrome.storage.sync.get(['theme'])
  const theme = result.theme || 'red'
  applyTheme(theme)
}

// Apply theme
function applyTheme(theme) {
  const themes = {
    'red': '#c41e3a',
    'blue': '#1e6cc4',
    'green': '#3ac41e',
    'purple': '#8b1ec4',
    'orange': '#c47a1e',
    'pink': '#c41e7a'
  }
  
  const accentColor = themes[theme] || themes['red']
  document.documentElement.style.setProperty('--accent-color', accentColor)
  
  // Convert hex to rgb for status backgrounds
  const r = parseInt(accentColor.slice(1, 3), 16)
  const g = parseInt(accentColor.slice(3, 5), 16)
  const b = parseInt(accentColor.slice(5, 7), 16)
  
  document.documentElement.style.setProperty('--status-bg', `rgba(${r}, ${g}, ${b}, 0.15)`)
  document.documentElement.style.setProperty('--status-border', `rgba(${r}, ${g}, ${b}, 0.3)`)
  document.documentElement.style.setProperty('--status-color', accentColor)
  
  // Update active theme option
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.remove('active')
    if (opt.dataset.theme === theme) {
      opt.classList.add('active')
    }
  })
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.sync.get(['settings'])

  const settings = result.settings || {
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    sessionsUntilLongBreak: 4,
    autoStart: false,
    showWarning: true,
    showCountdown: false,
    showBadge: true,
    showTabTitle: true,
    testMode: false
  }
  
  document.getElementById('work-duration').value = settings.workDuration
  document.getElementById('break-duration').value = settings.breakDuration
  document.getElementById('long-break-duration').value = settings.longBreakDuration
  document.getElementById('sessions-until-long-break').value = settings.sessionsUntilLongBreak
  document.getElementById('auto-start').checked = settings.autoStart
  document.getElementById('show-warning').checked = settings.showWarning !== false
  document.getElementById('show-countdown').checked = settings.showCountdown || false
  document.getElementById('show-badge').checked = settings.showBadge !== false
  document.getElementById('show-tab-title').checked = settings.showTabTitle !== false
  document.getElementById('test-mode').checked = settings.testMode || false
  
  updateDurationLabels(settings.testMode)
}

// Update duration labels based on test mode
function updateDurationLabels(testMode) {
  const unit = testMode ? 'seconds' : 'minutes'

  document.querySelector('label[for="work-duration"]').textContent = `Work Duration (${unit}):`
  document.querySelector('label[for="break-duration"]').textContent = `Break Duration (${unit}):`
  document.querySelector('label[for="long-break-duration"]').textContent = `Long Break Duration (${unit}):`
}

// Save settings to storage
async function saveSettings() {
  const testMode = document.getElementById('test-mode').checked

  const settings = {
    workDuration: parseInt(document.getElementById('work-duration').value),
    breakDuration: parseInt(document.getElementById('break-duration').value),
    longBreakDuration: parseInt(document.getElementById('long-break-duration').value),
    sessionsUntilLongBreak: parseInt(document.getElementById('sessions-until-long-break').value),
    autoStart: document.getElementById('auto-start').checked,
    showWarning: document.getElementById('show-warning').checked,
    showCountdown: document.getElementById('show-countdown').checked,
    showBadge: document.getElementById('show-badge').checked,
    showTabTitle: document.getElementById('show-tab-title').checked,
    testMode: testMode
  }
  
  await chrome.storage.sync.set({ settings })
  updateDurationLabels(testMode)
  showStatus('Settings saved!', 'success')
}

// Add event listener for test mode checkbox
function setupSettingsListeners() {
  document.getElementById('test-mode').addEventListener('change', (e) => {
    updateDurationLabels(e.target.checked)
  })
}

// Setup page navigation
function setupPageNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn')
  const pages = document.querySelectorAll('.page')
  
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPage = btn.dataset.page
      
      // Update nav buttons
      navButtons.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      
      // Update pages
      pages.forEach(p => p.classList.remove('active'))
      document.getElementById(`page-${targetPage}`).classList.add('active')
    })
  })
}

// Setup theme selector
function setupThemeSelector() {
  const themeOptions = document.querySelectorAll('.theme-option')
  
  themeOptions.forEach(option => {
    option.addEventListener('click', async () => {
      const theme = option.dataset.theme
      await chrome.storage.sync.set({ theme })
      applyTheme(theme)
    })
  })
}

// Load state from background
async function loadState() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getState' })
    if (response && response.state) {
      currentState = response.state
      updateUI()
    }
  } catch (error) {
    console.error('Error loading state:', error)
  }
}

// Update UI based on current state
function updateUI() {
  if (!currentState) return
  
  const startBtn = document.getElementById('start-btn')
  const pauseBtn = document.getElementById('pause-btn')
  const stopBtn = document.getElementById('stop-btn')
  const sessionType = document.getElementById('session-type')
  
  if (currentState.isRunning) {
    startBtn.disabled = true
    stopBtn.disabled = false
    
    if (currentState.isPaused) {
      pauseBtn.disabled = false
      pauseBtn.textContent = 'Resume'
      sessionType.textContent = (currentState.isWorkSession ? 'Work' : 'Break') + ' Session (Paused)'
    } else {
      pauseBtn.disabled = false
      pauseBtn.textContent = 'Pause'
      sessionType.textContent = currentState.isWorkSession ? 'Work Session' : 'Break Session'
    }
    
    updateTimer()
  } else {
    startBtn.disabled = false
    pauseBtn.disabled = true
    stopBtn.disabled = true
    pauseBtn.textContent = 'Pause'
    sessionType.textContent = 'Ready'
    document.getElementById('timer').textContent = '00:00'
  }
}

// Update timer display
async function updateTimer() {
  if (!currentState || !currentState.isRunning || !currentState.endTime) {
    // Reset timer color when not running
    const timerSection = document.querySelector('.timer-section')
    if (timerSection) {
      timerSection.style.background = 'var(--accent-color, #c41e3a)'
    }
    return
  }
  
  // Get test mode setting
  const settings = await chrome.storage.sync.get(['settings'])
  const testMode = settings.settings?.testMode || false
  
  const now = Date.now()
  let remaining
  
  // If paused, calculate remaining time at moment of pause
  const isPaused = currentState.isPaused && currentState.pausedTime
  if (isPaused) {
    remaining = Math.max(0, currentState.endTime - currentState.pausedTime)
  } else {
    remaining = Math.max(0, currentState.endTime - now)
  }
  
  let timerDisplay
  if (testMode) {
    // In test mode, show seconds
    const totalSeconds = Math.floor(remaining / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60)
    timerDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  } else {
    // Normal mode, show minutes:seconds
    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    timerDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  
  document.getElementById('timer').textContent = timerDisplay
  
  // Change timer color based on urgency or pause state
  const timerSection = document.querySelector('.timer-section')
  if (timerSection) {
    if (isPaused) {
      timerSection.style.background = '#c47a1e' // Orange for paused
    } else if (testMode) {
      if (remaining <= 10000) {
        timerSection.style.background = '#c41e3a' // Red - urgent
      } else if (remaining <= 30000) {
        timerSection.style.background = '#c47a1e' // Orange - warning
      } else {
        timerSection.style.background = 'var(--accent-color, #c41e3a)' // Normal
      }
    } else {
      const minutes = Math.floor(remaining / 60000)
      if (minutes <= 1) {
        timerSection.style.background = '#c41e3a' // Red - urgent
      } else if (minutes <= 2) {
        timerSection.style.background = '#c47a1e' // Orange - warning
      } else {
        timerSection.style.background = 'var(--accent-color, #c41e3a)' // Normal
      }
    }
  }
  
  if (remaining === 0) {
    // Timer ended, reload state
    setTimeout(() => loadState(), 500)
  }
}

// Start timer update interval
function startTimerUpdate() {
  if (timerInterval) {
    clearInterval(timerInterval)
  }
  timerInterval = setInterval(() => {
    updateTimer()
  }, 100)
}

// Setup event listeners
function setupEventListeners() {
  // Start button
  document.getElementById('start-btn').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'startSession' })
      await loadState()
      showStatus('Session started!', 'success')
    } catch (error) {
      console.error('Error starting session:', error)
      showStatus('Error starting session', 'error')
    }
  })
  
  // Pause/Resume button
  document.getElementById('pause-btn').addEventListener('click', async () => {
    try {
      const state = await loadState()
      if (state.isPaused) {
        await chrome.runtime.sendMessage({ type: 'resumeSession' })
        await loadState()
        showStatus('Session resumed', 'success')
      } else {
        await chrome.runtime.sendMessage({ type: 'pauseSession' })
        await loadState()
        showStatus('Session paused', 'info')
      }
    } catch (error) {
      console.error('Error pausing/resuming session:', error)
      showStatus('Error pausing session', 'error')
    }
  })
  
  // Stop button
  document.getElementById('stop-btn').addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'stopSession' })
      await loadState()
      showStatus('Session stopped', 'info')
    } catch (error) {
      console.error('Error stopping session:', error)
      showStatus('Error stopping session', 'error')
    }
  })
  
  // Save settings button
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    await saveSettings()
  })
  
  // Setup work tabs button
  document.getElementById('setup-work-tabs-btn').addEventListener('click', async () => {
    await showTabSelectionModal('work')
  })
  
  // Setup break tabs button
  document.getElementById('setup-break-tabs-btn').addEventListener('click', async () => {
    await showTabSelectionModal('break')
  })
  
  // Modal event listeners
  document.getElementById('close-modal').addEventListener('click', closeTabSelectionModal)
  document.getElementById('cancel-selection').addEventListener('click', closeTabSelectionModal)
  document.getElementById('save-selection').addEventListener('click', saveSelectedTabs)
  document.getElementById('select-all-tabs').addEventListener('click', selectAllTabs)
  document.getElementById('deselect-all-tabs').addEventListener('click', deselectAllTabs)
  document.getElementById('select-group-tabs').addEventListener('click', selectAllActive)
  
  // Close modal when clicking outside
  document.getElementById('tab-selection-modal').addEventListener('click', (e) => {
    if (e.target.id === 'tab-selection-modal') {
      closeTabSelectionModal()
    }
  })
}

// Show tab selection modal
async function showTabSelectionModal(type) {
  currentTabSelectionType = type
  const modal = document.getElementById('tab-selection-modal')
  const modalTitle = document.getElementById('modal-title')
  
  modalTitle.textContent = `Select ${type === 'work' ? 'Work' : 'Break'} Tabs`
  modal.classList.add('show')
  
  // Load all tabs
  allTabs = await chrome.tabs.query({})
  // Filter out chrome:// pages
  allTabs = allTabs.filter(tab => tab.url && !tab.url.startsWith('chrome://'))
  
  // Load previously selected tabs for this type
  const state = await loadState()
  const existingGroup = state?.tabGroups?.find(g => g.type === type)
  const selectedUrls = existingGroup?.urls || []
  
  // Render tabs list
  renderTabsList(selectedUrls)
}

// Render tabs list with checkboxes (prevent duplicates)
function renderTabsList(selectedUrls = []) {
  const tabsList = document.getElementById('tabs-list')
  tabsList.innerHTML = ''
  
  if (allTabs.length === 0) {
    tabsList.innerHTML = '<p style="text-align: center color: #666 padding: 20px">No tabs available</p>'
    return
  }
  
  // Track seen URLs to prevent duplicates
  const seenUrls = new Set()
  const uniqueTabs = []
  
  // First pass: collect unique tabs
  allTabs.forEach(tab => {
    const url = tab.url || ''
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      uniqueTabs.push(tab)
    }
  })
  
  // Render unique tabs
  uniqueTabs.forEach(tab => {
    const isSelected = selectedUrls.includes(tab.url)
    const tabItem = document.createElement('div')
    tabItem.className = 'tab-item'
    
    const faviconUrl = tab.favIconUrl || ''
    const title = tab.title || 'Untitled'
    const url = tab.url || ''
    
    tabItem.innerHTML = `
      <input type="checkbox" data-tab-id="${tab.id}" data-tab-url="${url}" ${isSelected ? 'checked' : ''}>
      ${faviconUrl ? `<img src="${faviconUrl}" class="tab-item-icon" onerror="this.style.display='none'">` : ''}
      <div class="tab-item-info">
        <div class="tab-item-title">${escapeHtml(title)}</div>
        <div class="tab-item-url">${escapeHtml(url)}</div>
      </div>
    `
    
    tabsList.appendChild(tabItem)
  })
  
  // Add event listeners to prevent duplicate selection
  const checkboxes = tabsList.querySelectorAll('input[type="checkbox"]')
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        const selectedUrl = e.target.getAttribute('data-tab-url')
        // Uncheck any other checkbox with the same URL
        checkboxes.forEach(cb => {
          if (cb !== e.target && cb.getAttribute('data-tab-url') === selectedUrl) {
            cb.checked = false
          }
        })
      }
    })
  })
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Select all tabs
function selectAllTabs() {
  const checkboxes = document.querySelectorAll('#tabs-list input[type="checkbox"]')
  checkboxes.forEach(checkbox => checkbox.checked = true)
}

// Deselect all tabs
function deselectAllTabs() {
  const checkboxes = document.querySelectorAll('#tabs-list input[type="checkbox"]')
  checkboxes.forEach(checkbox => checkbox.checked = false)
}

// Select all within active group
async function selectAllActive() {
  console.log("Fired Function!")

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    })
    return tab
  }

  const currentTab = await getCurrentTab()

  // If tab is not grouped
  if (currentTab.groupId === -1) {
    alert("Tab is not currently in group!")
    return
  }

  const targettedGroupId = currentTab.groupId

  const groupedTabs = await chrome.tabs.query({
    groupId: targettedGroupId
  })

  const checkboxes = document.querySelectorAll('#tabs-list input[type="checkbox"]')

  for (const tab of groupedTabs) {
    checkboxes.forEach(checkbox => {
      if (checkbox.dataset.tabId == tab.id) {
        checkbox.checked = true
      }
    });
  }
}


// Close tab selection modal
function closeTabSelectionModal() {
  const modal = document.getElementById('tab-selection-modal')
  modal.classList.remove('show')
  currentTabSelectionType = null
}

// Save selected tabs
async function saveSelectedTabs() {
  if (!currentTabSelectionType) return
  
  try {
    // Get selected tabs
    const checkboxes = document.querySelectorAll('#tabs-list input[type="checkbox"]:checked')
    const selectedUrls = Array.from(checkboxes).map(cb => cb.getAttribute('data-tab-url'))
    
    if (selectedUrls.length === 0) {
      showStatus('Please select at least one tab', 'error')
      return
    }
    
    // Remove duplicates (shouldn't happen, but just in case)
    const uniqueUrls = [...new Set(selectedUrls)]
    
    // Create or update tab group
    if (!currentState.tabGroups) {
      currentState.tabGroups = []
    }
    
    let group = currentState.tabGroups.find(g => g.type === currentTabSelectionType)
    if (!group) {
      group = { type: currentTabSelectionType, groupId: null, urls: [] }
      currentState.tabGroups.push(group)
    }
    
    group.urls = uniqueUrls
    
    await chrome.runtime.sendMessage({ 
      type: 'updateTabGroups', 
      tabGroups: currentState.tabGroups 
    })
    
    await loadState()
    closeTabSelectionModal()
    
    const typeName = currentTabSelectionType === 'work' ? 'work' : 'break'
    showStatus(`Saved ${uniqueUrls.length} ${typeName} tabs!`, 'success')
  } catch (error) {
    console.error('Error saving selected tabs:', error)
    showStatus('Error saving tabs', 'error')
  }
}

// Show status message
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status')
  statusEl.textContent = message
  statusEl.className = `status ${type}`
  
  setTimeout(() => {
    statusEl.textContent = ''
    statusEl.className = 'status'
  }, 3000)
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'sessionStarted' || message.type === 'sessionEnded') {
    currentState = message.state
    updateUI()
  }
})

