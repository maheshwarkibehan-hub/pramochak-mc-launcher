// Navigation DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const screens = {
  'screen-home': document.getElementById('screen-home'),
  'screen-installations': document.getElementById('screen-installations'),
  'screen-settings': document.getElementById('screen-settings'),
  'screen-skins': document.getElementById('screen-skins'),
  'screen-mods': document.getElementById('screen-mods'),
  'screen-worlds': document.getElementById('screen-worlds'),
  'screen-resources': document.getElementById('screen-resources'),
  'screen-servers': document.getElementById('screen-servers'),
  'screen-about': document.getElementById('screen-about'),
  'screen-credits': document.getElementById('screen-credits')
};

// Top Header profile card
const profileCardBtn = document.getElementById('profile-card-btn');
const headerUsername = document.getElementById('header-username');

// Window Buttons
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// Settings Elements
const usernameInput = document.getElementById('username');
const versionSelect = document.getElementById('version-select');
const ramSlider = document.getElementById('ram-slider');
const ramValue = document.getElementById('ram-value');
const javaPathInput = document.getElementById('java-path');
const resWidthInput = document.getElementById('resolution-w');
const resHeightInput = document.getElementById('resolution-h');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
const settingsThemeSelect = document.getElementById('settings-theme-select');

// Home page selectors
const playBtn = document.getElementById('play-btn');
const launchOptionsBtn = document.getElementById('launch-options-btn');
const selectedVersionLabel = document.getElementById('selected-version-label');
const worldCountLabel = document.getElementById('world-count-label');
const cardVersion = document.getElementById('card-version');
const cardWorlds = document.getElementById('card-worlds');
const cardServers = document.getElementById('card-servers');
const serverCountLabel = document.getElementById('server-count-label');
const btnViewAllWorlds = document.getElementById('btn-view-all-worlds');

// Version dialog modal elements
const versionDialogOverlay = document.getElementById('version-dialog-overlay');
const modalVersionSelect = document.getElementById('modal-version-select');
const btnApplyVersionDialog = document.getElementById('btn-apply-version-dialog');
const btnCloseVersionDialog = document.getElementById('btn-close-version-dialog');

// Progress overlay elements
const progressOverlay = document.getElementById('progress-overlay');
const progressText = document.getElementById('progress-title');
const progressSubtext = document.getElementById('progress-file-label');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressConsole = document.getElementById('progress-console');

// Progress overlay controls
const btnProgressPause = document.getElementById('btn-progress-pause');
const btnProgressStop = document.getElementById('btn-progress-stop');
const btnPauseText = document.getElementById('btn-pause-text');
const btnProgressPauseIcon = document.getElementById('btn-progress-pause-icon');

let isPaused = false;
let currentPercentage = 0; // Track highest percentage reached to avoid backward jumps
let lastLaunchOptions = null; // Store last options for Resume

// Performance optimization: High-efficiency debouncer
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ==========================================================================
// FRAMER-MOTION MODAL & OVERLAY HELPERS
// ==========================================================================
function openModalWithMotion(overlay) {
  if (!overlay) return;
  overlay.classList.remove('modal-closing');
  overlay.style.display = 'flex';
  overlay.classList.add('modal-opening');
  void overlay.offsetWidth;
  setTimeout(() => {
    overlay.classList.remove('modal-opening');
  }, 280);
}

function closeModalWithMotion(overlay, callback) {
  if (!overlay || overlay.style.display === 'none') return;
  overlay.classList.remove('modal-opening');
  overlay.classList.add('modal-closing');
  setTimeout(() => {
    overlay.classList.remove('modal-closing');
    overlay.style.display = 'none';
    if (typeof callback === 'function') callback();
  }, 190);
}

function updateProgressPipelineStep(stepName) {
  const steps = ['assets', 'libs', 'jar', 'jvm'];
  const stepIdx = steps.indexOf(stepName);
  if (stepIdx === -1) return;

  steps.forEach((name, i) => {
    const el = document.getElementById(`pipeline-step-${name}`);
    if (el) {
      if (i < stepIdx) {
        el.className = 'pipeline-step completed';
      } else if (i === stepIdx) {
        el.className = 'pipeline-step active';
      } else {
        el.className = 'pipeline-step';
      }
    }
  });
}

// Navigation management
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const screenId = item.getAttribute('data-screen');
    if (screens[screenId]) {
      // Toggle nav item classes
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Toggle screens with fresh Framer Motion animation trigger
      Object.keys(screens).forEach(id => {
        screens[id].classList.remove('active');
      });
      const targetScreen = screens[screenId];
      if (targetScreen) {
        void targetScreen.offsetWidth; // Force DOM reflow to re-trigger CSS keyframes
        targetScreen.classList.add('active');
      }

      // If Mods screen clicked, refresh profile select and load recommendations
      if (screenId === 'screen-mods') {
        populateModsProfileSelect();
        const profile = userProfiles.find(p => p.id === modsProfileSelect.value);
        if (profile && profile.modloader !== 'vanilla') {
          searchModrinth("");
        }
        refreshInstalledMods();
      }
      
      // If Skins screen clicked, initialize skins screen
      if (screenId === 'screen-skins') {
        initSkinsScreen();
      } else {
        // Navigating away from skins, dispose 3D skin viewer to free WebGL/GPU memory
        if (skinViewer) {
          try {
            skinViewer.dispose();
          } catch (e) {}
          skinViewer = null;
          console.log('[PERFORMANCE] Disposed skinViewer WebGL canvas');
        }
      }
      
      // If Worlds screen clicked, initialize worlds screen
      if (screenId === 'screen-worlds') {
        initWorldsScreen();
      }
      
      // If Resource Packs screen clicked, initialize resource packs screen
      if (screenId === 'screen-resources') {
        initResourcesScreen();
      }
      
      // If Servers screen clicked, initialize servers screen
      if (screenId === 'screen-servers') {
        initServersScreen();
      }
    }
  });
});

// Account Manager switcher overlay logic
const usernameDialogOverlay = document.getElementById('username-dialog-overlay');
const accountsListContainer = document.getElementById('accounts-list-container');
const accountNewInput = document.getElementById('account-new-input');
const btnAddSwitchNickname = document.getElementById('btn-add-switch-nickname');
const btnCloseUsernameDialog = document.getElementById('btn-close-username-dialog');

function renderAccountsList() {
  if (!accountsListContainer) return;
  accountsListContainer.innerHTML = '';
  
  if (!launcherConfig.usernames || launcherConfig.usernames.length === 0) {
    launcherConfig.usernames = [launcherConfig.username || 'Pramochak_MC'];
  }
  
  launcherConfig.usernames.forEach(name => {
    const card = document.createElement('div');
    card.className = 'account-card-item';
    
    const isActive = name === launcherConfig.username;
    if (isActive) card.classList.add('active');
    
    // Left side (avatar + username + pill)
    const leftSide = document.createElement('div');
    leftSide.className = 'account-info-left';
    
    const avatarImg = document.createElement('img');
    avatarImg.className = 'account-avatar-img';
    avatarImg.src = 'assets/steve_avatar.png'; // default fallback
    
    // Load avatar head from skin
    if (window.api) {
      window.api.loadActiveSkinCape(name).then(res => {
        if (res && res.success && res.skin) {
          const img = new Image();
          img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
            ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
            avatarImg.src = canvas.toDataURL();
          };
          img.src = res.skin;
        }
      }).catch(() => {});
    }
    
    const nameWrap = document.createElement('div');
    nameWrap.className = 'account-name-wrap';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'account-username';
    nameSpan.textContent = name;
    
    const statusPill = document.createElement('span');
    statusPill.className = `account-status-pill ${isActive ? 'active' : 'offline'}`;
    statusPill.textContent = isActive ? 'ACTIVE' : 'OFFLINE';
    
    nameWrap.appendChild(nameSpan);
    nameWrap.appendChild(statusPill);
    
    leftSide.appendChild(avatarImg);
    leftSide.appendChild(nameWrap);
    card.appendChild(leftSide);
    
    // Right side actions
    const rightSide = document.createElement('div');
    rightSide.className = 'account-actions-right';
    
    if (isActive) {
      const activeCheck = document.createElement('span');
      activeCheck.className = 'account-active-badge';
      activeCheck.innerHTML = `✓ Active`;
      rightSide.appendChild(activeCheck);
    } else {
      const switchBtn = document.createElement('button');
      switchBtn.className = 'btn-account-switch';
      switchBtn.textContent = 'Switch';
      switchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        launcherConfig.username = name;
        saveConfigToDisk();
        headerUsername.textContent = name;
        usernameInput.value = name;
        loadActiveSkinStartup();
        renderAccountsList();
        appendLog(`Switched active player to: ${name}`, "success");
        closeModalWithMotion(usernameDialogOverlay);
      });
      rightSide.appendChild(switchBtn);
    }
    
    // Delete action (allowed if more than 1 account)
    if (launcherConfig.usernames.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-account-delete';
      deleteBtn.title = `Delete account "${name}"`;
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to remove account "${name}"?`)) {
          launcherConfig.usernames = launcherConfig.usernames.filter(n => n !== name);
          if (launcherConfig.username === name) {
            launcherConfig.username = launcherConfig.usernames[0];
          }
          saveConfigToDisk();
          headerUsername.textContent = launcherConfig.username;
          usernameInput.value = launcherConfig.username;
          loadActiveSkinStartup();
          renderAccountsList();
          appendLog(`Deleted player account: ${name}`, "info");
        }
      });
      rightSide.appendChild(deleteBtn);
    }
    
    card.appendChild(rightSide);
    
    // Clicking anywhere on non-active card switches account
    card.addEventListener('click', () => {
      if (launcherConfig.username !== name) {
        launcherConfig.username = name;
        saveConfigToDisk();
        headerUsername.textContent = name;
        usernameInput.value = name;
        loadActiveSkinStartup();
        appendLog(`Switched active player to: ${name}`, "success");
      }
      closeModalWithMotion(usernameDialogOverlay);
    });
    
    accountsListContainer.appendChild(card);
  });
}

profileCardBtn.addEventListener('click', () => {
  renderAccountsList();
  if (accountNewInput) accountNewInput.value = '';
  openModalWithMotion(usernameDialogOverlay);
});

btnAddSwitchNickname.addEventListener('click', () => {
  const newName = accountNewInput.value.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  
  if (!usernameRegex.test(newName)) {
    alert("Invalid nickname! Use 3-16 alphanumeric characters or underscores.");
    return;
  }
  
  if (!launcherConfig.usernames) {
    launcherConfig.usernames = [launcherConfig.username || 'Pramochak_MC'];
  }
  
  if (!launcherConfig.usernames.includes(newName)) {
    launcherConfig.usernames.push(newName);
  }
  
  launcherConfig.username = newName;
  saveConfigToDisk();
  
  closeModalWithMotion(usernameDialogOverlay);
  headerUsername.textContent = newName;
  usernameInput.value = newName;
  
  loadActiveSkinStartup();
  appendLog(`Added and switched active player to: ${newName}`, "success");
});

btnCloseUsernameDialog.addEventListener('click', () => {
  closeModalWithMotion(usernameDialogOverlay);
});

if (usernameDialogOverlay) {
  usernameDialogOverlay.addEventListener('click', (e) => {
    if (e.target === usernameDialogOverlay) {
      closeModalWithMotion(usernameDialogOverlay);
    }
  });
}

let clientSessionLogs = [];

// List of 62 authentic pure 1x1 solid Minecraft building blocks
const MINECRAFT_BUILDING_BLOCKS = [
  'grass', 'dirt', 'stone', 'granite', 'polished_granite', 'diorite',
  'polished_diorite', 'andesite', 'polished_andesite', 'cobblestone',
  'mossy_cobblestone', 'bricks', 'stone_bricks', 'mossy_stone_bricks',
  'cracked_stone_bricks', 'chiseled_stone_bricks', 'oak_planks', 'spruce_planks',
  'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'gold_block', 'iron_block', 'diamond_block', 'emerald_block', 'redstone_block',
  'lapis_block', 'coal_block', 'quartz_block', 'obsidian', 'bookshelf',
  'tnt', 'crafting_table', 'furnace', 'burning_furnace', 'glowstone',
  'sea_lantern', 'netherrack', 'nether_brick', 'red_nether_brick', 'end_stone',
  'end_stone_bricks', 'purpur_block', 'purpur_pillar', 'packed_ice',
  'magma_block', 'prismarine', 'prismarine_bricks', 'dark_prismarine',
  'clay_block', 'sandstone', 'chiseled_sandstone', 'smooth_sandstone',
  'red_sandstone', 'bedrock'
];

// Deterministically or randomly assign an authentic Minecraft building block to each profile
function resolveBlockForProfile(profile) {
  if (!profile) return 'grass';
  if (profile.icon && MINECRAFT_BUILDING_BLOCKS.includes(profile.icon)) {
    return profile.icon;
  }
  const str = (profile.id || '') + (profile.name || '') + (profile.version || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % MINECRAFT_BUILDING_BLOCKS.length;
  return MINECRAFT_BUILDING_BLOCKS[index];
}

// Return authentic Minecraft 3D block image from assets/mc_blocks/
function getIconSvg(iconType) {
  const blockKey = MINECRAFT_BUILDING_BLOCKS.includes(iconType) ? iconType : 'grass';
  const blockLabel = blockKey.replace(/_/g, ' ');
  return `<img src="assets/mc_blocks/${blockKey}.png" alt="${blockLabel}" class="mc-block-img" title="Minecraft ${blockLabel}">`;
}

// Populate the Create Profile icon dropdown with all 44 authentic blocks
function populateIconSelect() {
  const profileIconSelect = document.getElementById('profile-icon-select');
  if (profileIconSelect) {
    profileIconSelect.innerHTML = MINECRAFT_BUILDING_BLOCKS.map(block => {
      const label = block.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return `<option value="${block}">${label}</option>`;
    }).join('');
  }
}

// Save configuration object to disk
async function saveConfigToDisk() {
  if (window.api) {
    await window.api.setLauncherConfig(launcherConfig);
  }
}

// Initialize Profiles List from persistent configuration
function initProfiles() {
  userProfiles = launcherConfig.profiles || [];
  
  // Clean up legacy javaPath references & non-building block icons
  let profilesChanged = false;
  userProfiles.forEach(p => {
    if (p.javaPath && (p.javaPath.includes('.aether-launcher') || p.javaPath.includes('.pramochak-mc'))) {
      p.javaPath = '';
      profilesChanged = true;
    }
    if (!p.icon || !MINECRAFT_BUILDING_BLOCKS.includes(p.icon)) {
      p.icon = resolveBlockForProfile(p);
      profilesChanged = true;
    }
  });
  


  activeProfileId = launcherConfig.activeProfileId;
  if (!activeProfileId || !userProfiles.find(p => p.id === activeProfileId)) {
    activeProfileId = userProfiles[0].id;
    launcherConfig.activeProfileId = activeProfileId;
    profilesChanged = true;
  }
  
  if (profilesChanged) {
    launcherConfig.profiles = userProfiles;
    saveConfigToDisk();
  }
}

function saveProfilesToStorage() {
  launcherConfig.profiles = userProfiles;
  saveConfigToDisk();
}

function saveActiveProfileToConfig() {
  launcherConfig.activeProfileId = activeProfileId;
  saveConfigToDisk();
}

// Render installations in Installations Screen
const installationsList = document.getElementById('installations-list');

function renderInstallations() {
  if (!installationsList) return;
  installationsList.innerHTML = '';
  
  userProfiles.forEach(profile => {
    const card = document.createElement('div');
    const isActive = profile.id === activeProfileId;
    card.className = `installation-card${isActive ? ' active-profile' : ''}`;
    
    // Resolve version display name
    let verDisplay = profile.version;
    if (profile.version === 'latest-release') {
      verDisplay = `Latest Release (${allMcVersions.latest.release || 'Fetching...'})`;
    } else if (profile.version === 'latest-snapshot') {
      verDisplay = `Latest Snapshot (${allMcVersions.latest.snapshot || 'Fetching...'})`;
    } else {
      verDisplay = `Minecraft ${profile.version}`;
    }
    
    const iconSvg = getIconSvg(resolveBlockForProfile(profile));
    const playtimeText = profile.playtime ? ` • Playtime: ${formatPlaytime(profile.playtime)}` : '';
    
    card.innerHTML = `
      <div class="installation-card-left">
        <div class="installation-card-icon">
          ${iconSvg}
        </div>
        <div class="installation-card-info">
          <span class="installation-card-name">${profile.name}</span>
          <div class="installation-card-meta">
            <span>${verDisplay}${playtimeText}</span>
            <span class="loader-badge ${profile.modloader}">${profile.modloader}</span>
          </div>
        </div>
      </div>
      <div class="installation-card-actions">
        <button class="btn-inst-play" data-id="${profile.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <span>PLAY</span>
        </button>
        <button class="btn-inst-folder" data-id="${profile.id}" title="Open Instance Folder">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        </button>
        <button class="btn-inst-export" data-id="${profile.id}" title="Export Profile as Modpack ZIP">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" transform="rotate(180 12 12)"/></svg>
        </button>
        <button class="btn-inst-delete" data-id="${profile.id}" ${profile.isDefault ? 'disabled' : ''} title="${profile.isDefault ? 'Default profile cannot be deleted' : 'Delete Profile'}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `;
    
    // Bind actions
    card.querySelector('.btn-inst-play').addEventListener('click', (e) => {
      e.stopPropagation();
      setActiveProfile(profile.id);
      playActiveProfile();
    });
    
    card.querySelector('.btn-inst-folder').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.api) {
        window.api.openProfileFolder(profile.id);
      } else {
        alert(`Mock Sandbox Environment: Opening folder for profile ID ${profile.id}`);
      }
    });
    
    card.querySelector('.btn-inst-export').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      if (window.api) {
        const res = await window.api.exportProfile(profile.id);
        btn.disabled = false;
        if (res.success) {
          appendLog(`Profile exported successfully to: ${res.filePath}`, 'success');
          alert(`Successfully exported modpack to:\n${res.filePath}`);
        } else if (res.error !== 'Cancelled') {
          alert(`Export failed: ${res.error}`);
        }
      } else {
        btn.disabled = false;
        alert(`Mock Sandbox Environment: Exported profile ${profile.id}`);
      }
    });
    
    card.querySelector('.btn-inst-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteProfile(profile.id);
    });
    
    card.addEventListener('click', () => {
      setActiveProfile(profile.id);
    });
    
    installationsList.appendChild(card);
  });
}

function setActiveProfile(id) {
  activeProfileId = id;
  saveActiveProfileToConfig();
  renderInstallations();
  updateLauncherUiForActiveProfile();
}

function deleteProfile(id) {
  const profile = userProfiles.find(p => p.id === id);
  if (!profile) return;
  if (profile.isDefault) {
    alert("Default profiles cannot be deleted.");
    return;
  }
  
  if (confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
    userProfiles = userProfiles.filter(p => p.id !== id);
    saveProfilesToStorage();
    if (activeProfileId === id) {
      activeProfileId = userProfiles[0] ? userProfiles[0].id : '';
      saveActiveProfileToConfig();
    }
    renderInstallations();
    updateLauncherUiForActiveProfile();
    populateProfileSelectors();
    appendLog(`Profile "${profile.name}" deleted successfully.`);
  }
}

// Update the Home Screen display for active profile
function updateLauncherUiForActiveProfile() {
  const profile = userProfiles.find(p => p.id === activeProfileId);
  if (!profile) {
    const versionLabel = document.getElementById('selected-version-label');
    if (versionLabel) {
      versionLabel.textContent = "No Profile Selected";
    }
    const versionSublabel = document.querySelector('#card-version .info-card-subvalue');
    if (versionSublabel) {
      versionSublabel.textContent = "Create one in Installations";
    }
    const iconWrapper = document.querySelector('#card-version .info-card-icon-wrapper');
    if (iconWrapper) {
      iconWrapper.innerHTML = `
        <svg class="info-card-icon" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" fill="#4caf50"/>
          <path d="M12 2L3 7l9 5 9-5-9-5z" fill="#8bc34a"/>
          <path d="M3 7v10l9 5V12L3 7z" fill="#795548"/>
          <path d="M12 12l9-5v10l-9 5V12z" fill="#5d4037"/>
        </svg>
      `;
    }
    if (versionSelect) {
      versionSelect.value = '';
    }
    if (modalVersionSelect) {
      modalVersionSelect.value = '';
    }
    return;
  }
  
  // Resolve version display name
  let verDisplay = profile.version;
  if (profile.version === 'latest-release') {
    verDisplay = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    verDisplay = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }
  
  const loaderStr = profile.modloader !== 'vanilla' ? ` (${profile.modloader.toUpperCase()})` : '';
  
  // Update version card details
  const versionLabel = document.getElementById('selected-version-label');
  if (versionLabel) {
    versionLabel.textContent = profile.name;
  }
  
  const playtimeText = profile.playtime ? ` • Playtime: ${formatPlaytime(profile.playtime)}` : '';
  const versionSublabel = document.querySelector('#card-version .info-card-subvalue');
  if (versionSublabel) {
    versionSublabel.textContent = `${verDisplay}${loaderStr}${playtimeText}`;
  }
  
  // Update icon in the version card
  const iconWrapper = document.querySelector('#card-version .info-card-icon-wrapper');
  if (iconWrapper) {
    iconWrapper.innerHTML = getIconSvg(resolveBlockForProfile(profile));
  }
  
  // Sync dropdown selectors
  if (versionSelect) {
    versionSelect.value = profile.id;
  }
  if (modalVersionSelect) {
    modalVersionSelect.value = profile.id;
  }

  // Update dynamic worlds count, server count, and recent plays
  fetchWorldCount();
  fetchServerCount();
  loadRecentPlay();
}

let selectedModalProfileId = null;

// Populate Profile Selection Dropdowns and Rich 3D Block Modal Picker
function populateProfileSelectors() {
  const options = userProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  if (versionSelect) {
    versionSelect.innerHTML = options;
    versionSelect.value = activeProfileId;
  }
  if (modalVersionSelect) {
    modalVersionSelect.innerHTML = options;
    modalVersionSelect.value = activeProfileId;
  }

  // Populate rich 3D Block Profile Picker in modal
  const pickerList = document.getElementById('modal-profiles-picker-list');
  if (pickerList) {
    pickerList.innerHTML = '';
    const activeTargetId = selectedModalProfileId || activeProfileId;
    userProfiles.forEach(p => {
      const blockKey = resolveBlockForProfile(p);
      const isSelected = p.id === activeTargetId;
      
      const item = document.createElement('div');
      item.className = `profile-picker-item${isSelected ? ' selected' : ''}`;
      item.setAttribute('data-id', p.id);
      
      let verDisplay = p.version;
      if (p.version === 'latest-release') verDisplay = `Release (${allMcVersions.latest.release || '1.21.4'})`;
      else if (p.version === 'latest-snapshot') verDisplay = `Snapshot (${allMcVersions.latest.snapshot || '1.21.5-pre1'})`;
      else verDisplay = `Minecraft ${p.version}`;

      item.innerHTML = `
        <div class="profile-picker-item-left">
          ${getIconSvg(blockKey)}
          <div class="profile-picker-info">
            <span class="profile-picker-name">${p.name}</span>
            <span class="profile-picker-meta">${verDisplay} • <strong style="color: var(--primary); text-transform: uppercase;">${p.modloader || 'vanilla'}</strong></span>
          </div>
        </div>
        <div class="profile-picker-radio"></div>
      `;

      item.addEventListener('click', () => {
        selectedModalProfileId = p.id;
        document.querySelectorAll('.profile-picker-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        if (modalVersionSelect) modalVersionSelect.value = p.id;
      });

      item.addEventListener('dblclick', () => {
        selectedModalProfileId = p.id;
        setActiveProfile(p.id);
        closeModalWithMotion(versionDialogOverlay);
      });

      pickerList.appendChild(item);
    });
  }
}

// Create profile version filter logic
const profileVersionType = document.getElementById('profile-version-type');
const profileVersionSelect = document.getElementById('profile-version-select');

function updateProfileVersionSelect() {
  if (!profileVersionType || !profileVersionSelect) return;
  const type = profileVersionType.value;
  const list = type === 'snapshot' ? allMcVersions.snapshots : allMcVersions.releases;
  
  profileVersionSelect.innerHTML = list.map(v => `<option value="${v}">${v}</option>`).join('');
}

if (profileVersionType) {
  profileVersionType.addEventListener('change', () => {
    updateProfileVersionSelect();
  });
}

// Listen for profile selector changes
if (versionSelect) {
  versionSelect.addEventListener('change', (e) => {
    setActiveProfile(e.target.value);
  });
}

if (modalVersionSelect) {
  modalVersionSelect.addEventListener('change', (e) => {
    setActiveProfile(e.target.value);
  });
}

// Version Selection Modal control
function openVersionDialog() {
  selectedModalProfileId = activeProfileId;
  populateProfileSelectors();
  openModalWithMotion(versionDialogOverlay);
}

if (cardVersion) {
  cardVersion.addEventListener('click', openVersionDialog);
}

if (launchOptionsBtn) {
  launchOptionsBtn.addEventListener('click', openVersionDialog);
}

if (btnApplyVersionDialog) {
  btnApplyVersionDialog.addEventListener('click', () => {
    if (selectedModalProfileId) {
      setActiveProfile(selectedModalProfileId);
    }
    closeModalWithMotion(versionDialogOverlay);
    const profile = userProfiles.find(p => p.id === activeProfileId);
    if (profile) appendLog(`Active profile set to: ${profile.name}`);
  });
}

if (btnCloseVersionDialog) {
  btnCloseVersionDialog.addEventListener('click', () => {
    closeModalWithMotion(versionDialogOverlay);
  });
}

if (versionDialogOverlay) {
  versionDialogOverlay.addEventListener('click', (e) => {
    if (e.target === versionDialogOverlay) {
      closeModalWithMotion(versionDialogOverlay);
    }
  });
}

// Pager Switcher for Installations tabs
const tabListProfiles = document.getElementById('tab-list-profiles');
const tabCreateProfile = document.getElementById('tab-create-profile');
const pageListProfiles = document.getElementById('page-list-profiles');
const pageCreateProfile = document.getElementById('page-create-profile');

if (tabListProfiles && tabCreateProfile && pageListProfiles && pageCreateProfile) {
  tabListProfiles.addEventListener('click', () => {
    tabListProfiles.classList.add('active');
    tabCreateProfile.classList.remove('active');
    pageListProfiles.classList.add('active');
    pageCreateProfile.classList.remove('active');
  });

  tabCreateProfile.addEventListener('click', () => {
    tabCreateProfile.classList.add('active');
    tabListProfiles.classList.remove('active');
    pageCreateProfile.classList.add('active');
    pageListProfiles.classList.remove('active');
    resetCreateProfileForm();
  });
}

function resetCreateProfileForm() {
  const profileNameInput = document.getElementById('profile-name-input');
  const profileIconSelect = document.getElementById('profile-icon-select');
  const profileLoaderSelect = document.getElementById('profile-loader-select');
  const profileRamSlider = document.getElementById('profile-ram-slider');
  const profileRamValue = document.getElementById('profile-ram-value');
  const profileJavaPath = document.getElementById('profile-java-path');

  if (profileNameInput) profileNameInput.value = 'New Installation';
  
  // Randomly assign one of the 44 authentic Minecraft blocks!
  const randomBlock = MINECRAFT_BUILDING_BLOCKS[Math.floor(Math.random() * MINECRAFT_BUILDING_BLOCKS.length)];
  if (profileIconSelect) profileIconSelect.value = randomBlock;
  
  if (profileVersionType) profileVersionType.value = 'release';
  updateProfileVersionSelect();
  if (profileLoaderSelect) profileLoaderSelect.value = 'vanilla';
  if (profileRamSlider) {
    profileRamSlider.value = '4096';
    if (profileRamValue) profileRamValue.textContent = '4 GB';
  }
  if (profileJavaPath) profileJavaPath.value = '';
}

// RAM Slider for Create Profile
const profileRamSlider = document.getElementById('profile-ram-slider');
const profileRamValue = document.getElementById('profile-ram-value');
if (profileRamSlider && profileRamValue) {
  profileRamSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    profileRamValue.textContent = `${(val / 1024).toFixed(0)} GB`;
  });
}

// Reset button handler
const btnCancelCreateProfile = document.getElementById('btn-cancel-create-profile');
if (btnCancelCreateProfile) {
  btnCancelCreateProfile.addEventListener('click', () => {
    resetCreateProfileForm();
    if (tabListProfiles) tabListProfiles.click();
  });
}

// Create & Save Profile button handler
const btnApplyProfileDialog = document.getElementById('btn-apply-profile-dialog');
const profileNameInput = document.getElementById('profile-name-input');
const profileIconSelect = document.getElementById('profile-icon-select');
const profileLoaderSelect = document.getElementById('profile-loader-select');
const profileJavaPath = document.getElementById('profile-java-path');

if (btnApplyProfileDialog) {
  btnApplyProfileDialog.addEventListener('click', () => {
    const name = profileNameInput ? profileNameInput.value.trim() : 'Custom Profile';
    let icon = profileIconSelect ? profileIconSelect.value : '';
    if (!icon || !MINECRAFT_BUILDING_BLOCKS.includes(icon)) {
      icon = MINECRAFT_BUILDING_BLOCKS[Math.floor(Math.random() * MINECRAFT_BUILDING_BLOCKS.length)];
    }
    const version = profileVersionSelect ? profileVersionSelect.value : '1.20.1';
    const modloader = profileLoaderSelect ? profileLoaderSelect.value : 'vanilla';
    const ram = profileRamSlider ? profileRamSlider.value : '4096';
    const javaPath = profileJavaPath ? profileJavaPath.value.trim() : '';

    const newProfile = {
      id: `profile-${Date.now()}`,
      name: name || 'Custom Profile',
      icon: icon,
      version: version,
      modloader: modloader,
      ram: ram,
      javaPath: javaPath,
      isDefault: false
    };

    userProfiles.push(newProfile);
    saveProfilesToStorage();

    // Re-render, sync dropdowns, set active profile
    renderInstallations();
    populateProfileSelectors();
    setActiveProfile(newProfile.id);

    appendLog(`Created new profile: ${name} (MC ${version}, ${modloader.toUpperCase()})`, "success");

    // Switch back to Installations list tab
    if (tabListProfiles) {
      tabListProfiles.click();
    }
  });
}

// Modpack Import Frontend Handler
const btnImportModpack = document.getElementById('btn-import-modpack');
const modpackProgressOverlay = document.getElementById('modpack-progress-overlay');
const modpackProgressTitle = document.getElementById('modpack-progress-title');
const modpackProgressStatus = document.getElementById('modpack-progress-status');
const modpackProgressFill = document.getElementById('modpack-progress-fill');
const modpackProgressLog = document.getElementById('modpack-progress-log');
const btnCloseModpackInstall = document.getElementById('btn-close-modpack-install');

if (btnImportModpack) {
  btnImportModpack.addEventListener('click', async () => {
    // Open loading overlay
    if (modpackProgressOverlay) modpackProgressOverlay.style.display = 'flex';
    if (modpackProgressTitle) modpackProgressTitle.textContent = 'Importing Modpack';
    if (modpackProgressStatus) modpackProgressStatus.textContent = 'Selecting file...';
    if (modpackProgressFill) modpackProgressFill.style.width = '0%';
    if (modpackProgressLog) modpackProgressLog.textContent = 'Waiting for selection...\n';
    if (btnCloseModpackInstall) btnCloseModpackInstall.style.display = 'none';

    try {
      const result = await window.api.selectAndInstallModpack((data) => {
        // Update progress UI from callback
        if (modpackProgressStatus) modpackProgressStatus.textContent = `${data.status.toUpperCase()} (${data.pct}%)`;
        if (modpackProgressFill) modpackProgressFill.style.width = `${data.pct}%`;
        if (modpackProgressLog) {
          modpackProgressLog.textContent += `${data.log}\n`;
          modpackProgressLog.scrollTop = modpackProgressLog.scrollHeight;
        }
      });

      if (result && result.success && result.profile) {
        if (modpackProgressTitle) modpackProgressTitle.textContent = 'Installation Complete!';
        if (modpackProgressStatus) modpackProgressStatus.textContent = 'Modpack imported successfully!';
        if (modpackProgressFill) modpackProgressFill.style.width = '100%';
        if (modpackProgressLog) modpackProgressLog.textContent += `[SUCCESS] Profile created: ${result.profile.name}\n`;
        
        // Add to profiles list
        userProfiles.push(result.profile);
        saveProfilesToStorage();
        
        // Re-render profiles lists
        renderInstallations();
        populateProfileSelectors();
        setActiveProfile(result.profile.id);
        
        appendLog(`Successfully imported modpack profile: ${result.profile.name}`, 'success');
      } else {
        if (modpackProgressTitle) modpackProgressTitle.textContent = 'Installation Cancelled';
        if (modpackProgressStatus) modpackProgressStatus.textContent = (result && result.error) || 'Import cancelled.';
      }
    } catch (err) {
      console.error('Modpack import error:', err);
      if (modpackProgressTitle) modpackProgressTitle.textContent = 'Installation Failed';
      if (modpackProgressStatus) modpackProgressStatus.textContent = 'An error occurred.';
      if (modpackProgressLog) modpackProgressLog.textContent += `[ERROR] ${err.message}\n`;
      appendLog(`Failed to import modpack: ${err.message}`, 'error');
    } finally {
      if (btnCloseModpackInstall) btnCloseModpackInstall.style.display = 'block';
    }
  });
}

if (btnCloseModpackInstall) {
  btnCloseModpackInstall.addEventListener('click', () => {
    if (modpackProgressOverlay) modpackProgressOverlay.style.display = 'none';
  });
}

// PLAY Game launcher sequence using active profile
function playActiveProfile() {
  const profile = userProfiles.find(p => p.id === activeProfileId);
  if (!profile) {
    alert("No active launch profile selected.");
    return;
  }
  
  const user = usernameInput.value.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  
  if (!usernameRegex.test(user)) {
    alert("Please set a valid username in Settings first (3-16 chars, alphanumeric or underscores).");
    document.getElementById('nav-settings').click();
    return;
  }

  // Clear progress logs if starting a fresh download, otherwise update resume UI state
  if (!isPaused) {
    progressConsole.innerHTML = '';
    progressBarFill.style.width = '0%';
    currentPercentage = 0;
    progressText.textContent = "Initiating safe launch pipeline...";
    progressSubtext.textContent = "Initializing secure downloader...";
  } else {
    isPaused = false;
    if (btnPauseText) btnPauseText.textContent = "Pause";
    if (btnProgressPauseIcon) {
      btnProgressPauseIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    }
    progressText.textContent = "Resuming launch pipeline...";
    progressSubtext.textContent = "Re-verifying files...";
  }

  // Populate redesigned progress card instance header
  const progressInstanceName = document.getElementById('progress-instance-name');
  const progressInstanceSub = document.getElementById('progress-instance-sub');
  const progressInstanceImg = document.getElementById('progress-instance-img');
  const progressStatusPillText = document.getElementById('progress-status-pill-text');

  // Resolve version
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }

  if (progressInstanceName) progressInstanceName.textContent = profile.name;
  if (progressInstanceSub) progressInstanceSub.textContent = `${resolvedVersion} • ${(profile.modloader || 'vanilla').toUpperCase()}`;
  if (progressInstanceImg) {
    progressInstanceImg.src = profile.icon || (profile.assignedBlock ? `pics/${profile.assignedBlock}` : 'pics/Furnace.png');
  }
  if (progressStatusPillText) progressStatusPillText.textContent = "Launching";
  updateProgressPipelineStep('assets');

  openModalWithMotion(progressOverlay);

  appendLog(`Establishing safe handshake for version ${resolvedVersion} (Loader: ${profile.modloader.toUpperCase()}) as ${user}...`);

  const launchRam = profile.ram || ramSlider.value;
  const launchJavaPath = (profile.javaPath && profile.javaPath.trim() !== '') ? profile.javaPath : javaPathInput.value;

  const keepLogsOpen = document.getElementById('setting-keep-open-logs').checked;
  const options = {
    username: user,
    profileId: profile.id, // Pass active profile ID to isolate instances
    version: resolvedVersion,
    ram: launchRam,
    javaPath: launchJavaPath,
    modloader: profile.modloader,
    modloaderVersion: profile.modloaderVersion || '', // Pass custom modloader version if present
    resolution: {
      w: resWidthInput.value,
      h: resHeightInput.value
    },
    keepLogsOpen: keepLogsOpen
  };

  lastLaunchOptions = options;

  if (keepLogsOpen) {
    clientSessionLogs = [];
    const clientLogsOverlay = document.getElementById('client-logs-overlay');
    const clientConsoleLogs = document.getElementById('client-console-logs');
    const clientStatusDot = document.getElementById('client-status-dot');
    const clientLogDiagnosis = document.getElementById('client-log-diagnosis');
    
    clientLogDiagnosis.style.display = 'none';
    clientStatusDot.style.background = '#e53e3e';
    clientConsoleLogs.innerHTML = `<div style="color: #4299e1;">[LAUNCHER] Initializing launch environment...</div>`;
    clientLogsOverlay.style.display = 'flex';
  }

  incrementLauncherSessionCount();
  if (window.api) {
    window.api.launchGame(options);
  } else {
    mockProcessLaunch();
  }
}

// RAM allocation slider display
ramSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  ramValue.textContent = `${(val / 1024).toFixed(0)} GB`;
});

// Console logger helpers
function appendLog(message, type = 'info') {
  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.style.lineHeight = '1.4';
  
  const timestamp = new Date().toLocaleTimeString();
  logItem.textContent = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  if (type === 'error') {
    logItem.style.color = '#e53e3e';
  } else if (type === 'success') {
    logItem.style.color = '#38a169';
  } else if (type === 'debug') {
    logItem.style.color = '#4299e1';
  }
  
  progressConsole.appendChild(logItem);
  progressConsole.scrollTop = progressConsole.scrollHeight;
}

// Window controls IPC hookup
if (window.api) {
  btnMinimize.addEventListener('click', () => window.api.minimizeWindow());
  btnMaximize.addEventListener('click', () => window.api.maximizeWindow());
  btnClose.addEventListener('click', () => window.api.closeWindow());

  // Listen to window maximized status (changes border radius on fullscreen)
  window.api.onMaximizedStatus((isMaximized) => {
    const launcherWindow = document.querySelector('.launcher-window');
    if (launcherWindow) {
      if (isMaximized) {
        launcherWindow.classList.add('maximized');
      } else {
        launcherWindow.classList.remove('maximized');
      }
    }
  });
} else {
  btnMinimize.addEventListener('click', () => alert("Minimize Window"));
  btnMaximize.addEventListener('click', () => alert("Maximize Window"));
  btnClose.addEventListener('click', () => alert("Close Window"));
}

// Load configurations from storage
function loadConfigurations() {
  // Set inputs from launcherConfig
  usernameInput.value = launcherConfig.username || 'Pramochak_MC';
  headerUsername.textContent = launcherConfig.username || 'Pramochak_MC';
  
  // Set theme from launcherConfig
  const savedTheme = launcherConfig.theme || 'dark-charcoal';
  applyTheme(savedTheme);
  
  const keepLogsOpenCheckbox = document.getElementById('setting-keep-open-logs');
  if (keepLogsOpenCheckbox) {
    keepLogsOpenCheckbox.checked = launcherConfig.keepLogsOpen || false;
  }
  
  ramSlider.value = launcherConfig.ram || '4096';
  ramValue.textContent = `${(ramSlider.value / 1024).toFixed(0)} GB`;
  // Use dynamic diagnostics (fetches real RAM, Java, dir size)
  loadSystemDiagnostics(ramSlider.value);
  
  // Clean up legacy javaPath references in config if any
  let javaPath = launcherConfig.javaPath || '';
  if (javaPath.includes('.aether-launcher') || javaPath.includes('.pramochak-mc')) {
    javaPath = '';
    launcherConfig.javaPath = '';
    saveConfigToDisk();
  }
  javaPathInput.value = javaPath;
  
  resWidthInput.value = launcherConfig.resWidth || '854';
  resHeightInput.value = launcherConfig.resHeight || '480';

  // Sync profile selector dropdowns
  if (versionSelect) {
    versionSelect.value = activeProfileId;
  }

  // Retrieve dynamic world count
  fetchWorldCount();
  updateHomeGameStats();
}

function updateHomeDiagnosticsRam(ramMb, totalRamMb) {
  const ramLabel = document.getElementById('diagnostics-ram-label');
  const ramBar = document.getElementById('diagnostics-ram-bar');
  if (ramLabel && ramBar) {
    const allocatedGb = (ramMb / 1024).toFixed(1);
    const totalGb = totalRamMb ? (totalRamMb / 1024).toFixed(1) : '16.0';
    const maxMb = totalRamMb || 16384;
    const pct = Math.min(100, (ramMb / maxMb) * 100);
    ramLabel.textContent = `${allocatedGb} GB / ${totalGb} GB`;
    ramBar.style.width = `${pct}%`;
  }
}

function updateHomeGameStats() {
  const playtimeLabel = document.getElementById('stats-playtime-label');
  const sessionsLabel = document.getElementById('stats-sessions-label');
  const profilesLabel = document.getElementById('stats-profiles-label');
  const modsLabel = document.getElementById('stats-mods-label');
  if (!playtimeLabel) return;
  
  let totalMs = 0;
  if (typeof userProfiles !== 'undefined') {
    userProfiles.forEach(profile => {
      totalMs += profile.playtime || 0;
    });
  }
  
  if (typeof formatPlaytime === 'function') {
    playtimeLabel.textContent = totalMs > 0 ? formatPlaytime(totalMs) : '0m';
  } else {
    playtimeLabel.textContent = `${Math.round(totalMs / 60000)}m`;
  }
  
  if (sessionsLabel) {
    const totalLaunches = parseInt(localStorage.getItem('total_launches') || '0');
    sessionsLabel.textContent = `${totalLaunches} Launches`;
  }

  if (profilesLabel && typeof userProfiles !== 'undefined') {
    profilesLabel.textContent = `${userProfiles.length} Profile${userProfiles.length !== 1 ? 's' : ''}`;
  }

  if (modsLabel) {
    const totalMods = parseInt(localStorage.getItem('total_mods_installed') || '0');
    modsLabel.textContent = `${totalMods} Mod${totalMods !== 1 ? 's' : ''}`;
  }
}

function incrementLauncherSessionCount() {
  let count = parseInt(localStorage.getItem('total_launches') || '0');
  count++;
  localStorage.setItem('total_launches', count.toString());
  updateHomeGameStats();
}

// Load system diagnostics dynamically (Java version, total RAM, dir size)
async function loadSystemDiagnostics(ramMb) {
  if (window.api && window.api.getSystemDiagnostics) {
    try {
      const diag = await window.api.getSystemDiagnostics();
      updateHomeDiagnosticsRam(ramMb, diag.totalRamMb);
      const javaEl = document.getElementById('diagnostics-java-value');
      if (javaEl) javaEl.textContent = diag.javaVersion;
      const dirEl = document.getElementById('diagnostics-dir-value');
      if (dirEl) {
        const gb = (diag.dirSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        dirEl.textContent = `${gb} GB`;
      }
    } catch (e) {
      updateHomeDiagnosticsRam(ramMb);
    }
  } else {
    updateHomeDiagnosticsRam(ramMb);
  }
}

function saveConfigurations() {
  const user = usernameInput.value.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  
  if (!usernameRegex.test(user)) {
    alert("Invalid nickname! Use 3-16 alphanumeric characters or underscores.");
    return false;
  }

  if (!launcherConfig.usernames) {
    launcherConfig.usernames = [launcherConfig.username || 'Pramochak_MC'];
  }
  if (!launcherConfig.usernames.includes(user)) {
    launcherConfig.usernames.push(user);
  }

  launcherConfig.username = user;
  launcherConfig.keepLogsOpen = document.getElementById('setting-keep-open-logs').checked;
  launcherConfig.ram = ramSlider.value;
  loadSystemDiagnostics(ramSlider.value);
  launcherConfig.javaPath = javaPathInput.value;
  launcherConfig.resWidth = resWidthInput.value;
  launcherConfig.resHeight = resHeightInput.value;
  
  // Set theme from settings dropdown
  if (settingsThemeSelect) {
    launcherConfig.theme = settingsThemeSelect.value;
    applyTheme(launcherConfig.theme);
  }
  
  // Sync selected profile dropdown value
  if (versionSelect) {
    activeProfileId = versionSelect.value;
    launcherConfig.activeProfileId = activeProfileId;
  }
  
  saveConfigToDisk();

  // Update header text
  headerUsername.textContent = user;
  
  appendLog(`Configurations updated. Player: ${user}, RAM: ${(ramSlider.value / 1024).toFixed(0)} GB`, "success");
  
  // Reload skin/cape and update avatar for the new username
  loadActiveSkinStartup();
  
  // Re-render installations to show selected profile change
  renderInstallations();
  updateLauncherUiForActiveProfile();
  
  return true;
}

saveSettingsBtn.addEventListener('click', () => {
  if (saveConfigurations()) {
    // Go to Home screen
    document.getElementById('nav-home').click();
  }
});

cancelSettingsBtn.addEventListener('click', () => {
  loadConfigurations();
  document.getElementById('nav-home').click();
});

// Dynamic World Directory scanning
function fetchWorldCount() {
  if (window.api) {
    window.api.getWorldCount(activeProfileId)
      .then(count => {
        worldCountLabel.textContent = `${count} world${count !== 1 ? 's' : ''}`;
      })
      .catch(err => {
        console.error("Error reading saves directory:", err);
        worldCountLabel.textContent = "0 worlds";
      });
  } else {
    // Mock count matching user's screenshot
    worldCountLabel.textContent = "12 worlds";
  }
}

// Clicking worlds card navigates to Worlds Manager screen
cardWorlds.addEventListener('click', () => {
  const navWorlds = document.getElementById('nav-worlds');
  if (navWorlds) navWorlds.click();
});
btnViewAllWorlds.addEventListener('click', (e) => {
  e.preventDefault();
  const navWorlds = document.getElementById('nav-worlds');
  if (navWorlds) navWorlds.click();
});


// Dynamic Server count scanning
function fetchServerCount() {
  if (window.api && window.api.getServers) {
    window.api.getServers(activeProfileId)
      .then(servers => {
        const count = Array.isArray(servers) ? servers.length : 0;
        if (serverCountLabel) {
          serverCountLabel.textContent = `${count} server${count !== 1 ? 's' : ''}`;
        }
      })
      .catch(() => {
        if (serverCountLabel) serverCountLabel.textContent = '0 servers';
      });
  } else {
    if (serverCountLabel) serverCountLabel.textContent = '0 servers';
  }
}

// Clicking servers card navigates to Servers screen
if (cardServers) {
  cardServers.addEventListener('click', () => {
    const navServers = document.getElementById('nav-servers');
    if (navServers) navServers.click();
  });
}



// PLAY Button launch implementation
playBtn.addEventListener('click', () => {
  playActiveProfile();
});

// Progress overlay control listeners
if (btnProgressPause) {
  btnProgressPause.addEventListener('click', () => {
    if (isPaused) {
      // Resume launch
      appendLog("Resuming launch pipeline...");
      playActiveProfile();
    } else {
      // Pause launch (by cancelling active operation and freezing overlay UI)
      isPaused = true;
      appendLog("Launch paused by user.");
      if (btnPauseText) btnPauseText.textContent = "Resume";
      if (btnProgressPauseIcon) {
        // Play icon path
        btnProgressPauseIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
      }
      progressText.textContent = "Launch Paused";
      progressSubtext.textContent = "Click Resume to continue download...";
      
      const detailsText = document.getElementById('progress-details-text');
      if (detailsText) detailsText.textContent = "Launch paused by user.";

      if (window.api) {
        window.api.cancelLaunch();
      }
    }
  });
}

if (btnProgressStop) {
  btnProgressStop.addEventListener('click', () => {
    isPaused = false;
    currentPercentage = 0;
    appendLog("Launch process stopped by user.", "error");
    
    if (window.api) {
      window.api.cancelLaunch();
    }
    
    closeModalWithMotion(progressOverlay);
  });
}

const btnToggleProgressConsole = document.getElementById('btn-toggle-progress-console');
if (btnToggleProgressConsole) {
  btnToggleProgressConsole.addEventListener('click', () => {
    if (progressConsole) {
      const isVisible = progressConsole.style.display !== 'none';
      progressConsole.style.display = isVisible ? 'none' : 'block';
      btnToggleProgressConsole.classList.toggle('active', !isVisible);
    }
  });
}

// Dynamic Recent Play rendering and event binding
async function loadRecentPlay() {
  const recentPlayGrid = document.querySelector('.recent-play-grid');
  if (!recentPlayGrid) return;
  
  recentPlayGrid.innerHTML = '';
  
  if (!window.api) {
    // Render mock recent cards in sandbox
    const mockRecent = [
      { worldName: 'Survival Kingdom', gameMode: 'Survival', versionName: '1.20.1', icon: null },
      { worldName: 'Pramochak SMP', gameMode: 'Survival', versionName: '1.20.1', icon: null },
      { worldName: 'Creative World', gameMode: 'Creative', versionName: '1.20.1', icon: null },
      { worldName: 'Nether Adventures', gameMode: 'Survival', versionName: '1.20.1', icon: null }
    ];
    renderRecentCards(mockRecent);
    return;
  }
  
  try {
    const worlds = await window.api.getWorlds(activeProfileId);
    if (!worlds || worlds.length === 0) {
      recentPlayGrid.innerHTML = `
        <div style="grid-column: span 4; text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem; background: rgba(0,0,0,0.15); border-radius: 12px; border: 1px dashed var(--border-light);">
          No worlds found in this instance. Launch Minecraft to create a new world!
        </div>
      `;
      return;
    }
    
    // Take top 4 most recently played worlds
    const recentWorlds = worlds.slice(0, 4);
    renderRecentCards(recentWorlds);
  } catch (err) {
    console.error("Error loading recent worlds:", err);
    recentPlayGrid.innerHTML = `
      <div style="grid-column: span 4; text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">
        Failed to load recent worlds.
      </div>
    `;
  }
}

function renderRecentCards(worlds) {
  const recentPlayGrid = document.querySelector('.recent-play-grid');
  if (!recentPlayGrid) return;
  recentPlayGrid.innerHTML = '';
  
  const fallbacks = [
    'assets/sunset_lake.png',
    'assets/smp_castle.png',
    'assets/cherry_blossom.png',
    'assets/nether_fortress.png'
  ];
  
  worlds.forEach((world, index) => {
    const card = document.createElement('div');
    card.className = 'recent-card';
    card.setAttribute('data-world', world.worldName);
    
    // Prioritize actual in-game screenshot taken in that world, then world icon, then scenic fallback
    const previewSrc = world.screenshot || world.icon || fallbacks[index % fallbacks.length];
    const isCustomPreview = Boolean(world.screenshot || (world.icon && !world.icon.includes('assets/')));
    const modeStr = world.gameMode ? `${world.gameMode} • ` : '';
    const versionStr = world.versionName || '1.20.1';
    
    card.innerHTML = `
      <div class="recent-card-image-wrap">
        <img src="${previewSrc}" class="recent-card-image ${isCustomPreview ? 'screenshot-cover' : 'scenic-cover'}" alt="${world.worldName}" loading="lazy" decoding="async">
        <div class="recent-card-game-badge">${world.gameMode || 'Survival'}</div>
      </div>
      <div class="recent-card-content">
        <div class="recent-card-info">
          <span class="recent-card-name" title="${world.worldName}">${world.worldName}</span>
          <span class="recent-card-mode">${modeStr}${versionStr}</span>
        </div>
        <div class="recent-card-play-btn" title="Launch World">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    `;
    
    card.addEventListener('click', () => {
      quickLaunchWorld(world.folderName || world.worldName, activeProfileId);
    });
    
    recentPlayGrid.appendChild(card);
  });
}

// Progress and Speed / ETA Tracking
let progressStart = 0;
let lastProgressTime = 0;
let lastProgressCount = 0;
let currentProgressType = '';

const phaseWeights = {
  'natives': { start: 0, end: 15 },
  'libraries': { start: 15, end: 60 },
  'assets': { start: 60, end: 95 },
  'minecraft-jar': { start: 95, end: 99 }
};

function getMclcPercentage(type, current, total) {
  const phase = phaseWeights[type.toLowerCase()];
  if (!phase) return Math.floor((current / total) * 100) || 0;
  
  const phaseProgress = total > 0 ? (current / total) : 0;
  const range = phase.end - phase.start;
  const overall = phase.start + (phaseProgress * range);
  return Math.min(phase.end, Math.max(phase.start, Math.floor(overall)));
}

function startProgressTracking(type) {
  progressStart = Date.now();
  lastProgressTime = Date.now();
  lastProgressCount = 0;
  currentProgressType = type;
  
  const detailsText = document.getElementById('progress-details-text');
  if (detailsText) detailsText.textContent = "Connecting to download server...";
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateProgressTracking(current, total, pct, isBytes = false) {
  const now = Date.now();
  const totalElapsed = (now - progressStart) / 1000;
  
  let speedText = '--';
  let etaText = '--';
  
  let currentText = '';
  let totalText = '';
  
  if (isBytes) {
    // Already in MB (JRE download)
    currentText = `${current} MB`;
    totalText = `${total} MB`;
    
    if (totalElapsed > 0.5 && current > 0) {
      const mbps = current / totalElapsed;
      speedText = `${mbps.toFixed(1)} MB/s`;
      const remainingMB = total - current;
      if (mbps > 0) {
        const remainingSeconds = Math.max(0, remainingMB / mbps);
        etaText = remainingSeconds < 1 ? 'Ready' : `${Math.ceil(remainingSeconds)}s`;
      }
    }
  } else {
    // MCLC download (in bytes)
    currentText = formatBytes(current);
    totalText = formatBytes(total);
    
    if (totalElapsed > 0.5 && current > 0) {
      const bytesps = current / totalElapsed;
      speedText = `${formatBytes(bytesps)}/s`;
      const remainingBytes = total - current;
      if (bytesps > 0) {
        const remainingSeconds = Math.max(0, remainingBytes / bytesps);
        etaText = remainingSeconds < 1 ? 'Ready' : `${Math.ceil(remainingSeconds)}s`;
      }
    }
  }
  
  const pctLabel = document.getElementById('progress-pct-label');
  if (pctLabel) pctLabel.textContent = `${pct}%`;
  
  const detailsTextEl = document.getElementById('progress-details-text');
  if (detailsTextEl) {
    if (etaText === 'Ready' || pct >= 100) {
      detailsTextEl.textContent = `${currentText} of ${totalText} (${speedText}) • Ready`;
    } else if (etaText !== '--') {
      detailsTextEl.textContent = `${currentText} of ${totalText} (${speedText}) • ${etaText} remaining`;
    } else {
      detailsTextEl.textContent = `${currentText} of ${totalText} (${speedText})`;
    }
  }
  
  lastProgressTime = now;
  lastProgressCount = current;
}

// Mock simulation runner
function mockProcessLaunch() {
  let progress = 0;
  appendLog("Running in static mock browser environment.", "debug");
  appendLog("Connecting to secure Mojang download assets server...", "debug");
  
  startProgressTracking("game components");
  
  const timer = setInterval(() => {
    progress += 4;
    progressBarFill.style.width = `${progress}%`;
    
    const progressTitle = document.getElementById('progress-title');
    if (progressTitle) {
      progressTitle.textContent = "Downloading Game Components...";
    }
    
    const fileLabel = document.getElementById('progress-file-label');
    if (fileLabel) {
      fileLabel.textContent = `libraries/org/lwjgl/lwjgl/3.3.1/lwjgl-platform-3.3.1-natives-windows_${progress}.jar`;
    }
    
    const currentBytes = Math.floor((progress / 100) * 142500000);
    updateProgressTracking(currentBytes, 142500000, progress, false);
    
    if (progress % 12 === 0) {
      appendLog(`Securely downloaded chunk: component_lib_0x${progress.toString(16)}.jar`);
    }

    if (progress >= 100) {
      clearInterval(timer);
      const pctLabel = document.getElementById('progress-pct-label');
      if (pctLabel) pctLabel.textContent = "100%";
      if (progressTitle) progressTitle.textContent = "Launching Minecraft...";
      if (fileLabel) fileLabel.textContent = "Spawning JVM client window process...";
      
      appendLog("JVM parameters set successfully.", "success");
      appendLog("Minecraft window spawned.", "success");
      
      setTimeout(() => {
        progressOverlay.style.display = 'none';
      }, 1500);
    }
  }, 120);
}

// Electron IPC listeners
if (window.api) {
  window.api.onLaunchProgress((data) => {
    let type = data.type || 'assets';
    if (type.toLowerCase() === 'classes') type = 'libraries';
    if (type.toLowerCase() === 'minecraft-jar') type = 'minecraft-jar';

    const current = data.current !== undefined ? data.current : (data.task !== undefined ? data.task : 0);
    const total = data.total || 100;

    if (type !== currentProgressType) {
      startProgressTracking(type);
    }

    const isBytes = type.toLowerCase().includes('java') || type.toLowerCase().includes('jre') || type.toLowerCase().includes('installer');
    
    let pct = 0;
    if (isBytes) {
      pct = Math.floor((current / total) * 100) || 0;
    } else {
      pct = getMclcPercentage(type, current, total);
    }

    // Only allow progress bar and percentage display to move forward to handle resumes smoothly
    if (pct > currentPercentage) {
      currentPercentage = pct;
    }

    progressBarFill.style.width = `${currentPercentage}%`;
    
    const progressTitle = document.getElementById('progress-title');
    if (progressTitle) {
      progressTitle.textContent = `Downloading ${type.charAt(0).toUpperCase() + type.slice(1)}...`;
    }

    if (isBytes && (type.toLowerCase().includes('java') || type.toLowerCase().includes('jre'))) {
      const fileLabel = document.getElementById('progress-file-label');
      if (fileLabel) {
        fileLabel.textContent = "Adoptium Eclipse Temurin JDK JRE Runtime Archive";
      }
    }
    
    updateProgressTracking(current, total, currentPercentage, isBytes);
  });

  window.api.onLaunchStatus((status) => {
    appendLog(`Status update: ${status}`);
    const progressTitle = document.getElementById('progress-title');
    const fileLabel = document.getElementById('progress-file-label');
    const pctLabel = document.getElementById('progress-pct-label');
    
    if (status === 'preparing') {
      if (progressTitle) progressTitle.textContent = "Preparing Game Launch...";
      if (fileLabel) fileLabel.textContent = "Checking directories and verifying assets...";
    } else if (status === 'launching') {
      if (progressTitle) progressTitle.textContent = "Launching Game...";
      if (fileLabel) fileLabel.textContent = "Spawning Minecraft client window process...";
      if (pctLabel) pctLabel.textContent = "100%";
      progressBarFill.style.width = "100%";
    } else if (status === 'success') {
      progressOverlay.style.display = 'none';
      appendLog("Process executed successfully! Launcher minimized.", "success");
    } else if (status === 'cancelled') {
      // Freezes overlay UI in paused state or hides it if cancelled
      if (isPaused) {
        if (progressTitle) progressTitle.textContent = "Launch Paused";
        if (fileLabel) fileLabel.textContent = "Click Resume to continue download...";
        const speedVal = document.getElementById('progress-speed-value');
        const etaVal = document.getElementById('progress-eta-value');
        if (speedVal) speedVal.textContent = '--';
        if (etaVal) etaVal.textContent = '--';
      } else {
        progressOverlay.style.display = 'none';
      }
    }
  });

  window.api.onLaunchLog((log) => {
    appendLog(log, 'debug');
    
    const keepLogsOpen = document.getElementById('setting-keep-open-logs').checked;
    if (keepLogsOpen) {
      appendClientLog(log);
    }
    
    if (log.startsWith('Game exited with code ')) {
      const codeStr = log.substring(22).trim();
      const exitCode = parseInt(codeStr);
      document.getElementById('client-status-dot').style.background = '#a0aec0'; // Gray
      appendClientLog(`[LAUNCHER] Minecraft process exited.`);
      
      if (exitCode !== 0 && !isNaN(exitCode)) {
        const diag = diagnoseCrash(clientSessionLogs);
        document.getElementById('client-log-diagnosis-text').textContent = diag;
        document.getElementById('client-log-diagnosis').style.display = 'flex';
      }
    }
    
    if (log.startsWith('Downloading: ')) {
      const fileLabel = document.getElementById('progress-file-label');
      if (fileLabel) {
        const fileName = log.substring(13).trim();
        fileLabel.textContent = fileName;
      }
    } else if (log.includes('[MCLC]:')) {
      const msg = log.split('[MCLC]:')[1].trim();
      const progressTitle = document.getElementById('progress-title');
      const fileLabel = document.getElementById('progress-file-label');
      
      if (msg.toLowerCase().includes('attempting to download assets') || msg.toLowerCase().includes('downloading assets')) {
        if (progressTitle) progressTitle.textContent = "Verifying game assets...";
        updateProgressPipelineStep('assets');
      } else if (msg.toLowerCase().includes('attempting to download libraries') || msg.toLowerCase().includes('downloading libraries') || msg.toLowerCase().includes('dependencies')) {
        if (progressTitle) progressTitle.textContent = "Verifying game libraries...";
        updateProgressPipelineStep('libs');
      } else if (msg.toLowerCase().includes('attempting to download minecraft version jar')) {
        if (progressTitle) progressTitle.textContent = "Checking client jar...";
        updateProgressPipelineStep('jar');
      } else if (msg.toLowerCase().includes('attempting to create root folder')) {
        if (progressTitle) progressTitle.textContent = "Preparing directories...";
      } else if (msg.toLowerCase().includes('set launch options') || msg.toLowerCase().includes('using java version') || msg.toLowerCase().includes('launching')) {
        if (progressTitle) progressTitle.textContent = "Configuring JVM launcher engine...";
        updateProgressPipelineStep('jvm');
      }
      
      if (fileLabel) {
        fileLabel.textContent = msg;
      }
    }
  });

  window.api.onLaunchError((error) => {
    appendLog(error, 'error');
    closeModalWithMotion(progressOverlay);
    
    const keepLogsOpen = document.getElementById('setting-keep-open-logs').checked;
    if (keepLogsOpen) {
      document.getElementById('client-status-dot').style.background = '#a0aec0'; // Gray
      appendClientLog(`[LAUNCHER] ERROR: ${error}`);
    }
    
    // Suppress error dialogs on intentional cancellation
    if (error.includes('cancelled') || error.includes('cancel') || isPaused) {
      return;
    }
    alert(`Handshake/Download failed: ${error}\nEnsure you have an active internet connection and valid Java executable.`);
  });

  // Playtime updated IPC listener
  window.api.onPlaytimeUpdated((data) => {
    console.log('[PLAYTIME] playtime-updated event received:', data);
    const profile = userProfiles.find(p => p.id === data.profileId);
    if (profile) {
      profile.playtime = data.playtime;
      renderInstallations();
      updateLauncherUiForActiveProfile();
      updateHomeGameStats();
    }
  });

  // Log viewer button listeners
  const clientLogsOverlay = document.getElementById('client-logs-overlay');
  document.getElementById('btn-client-log-close').addEventListener('click', () => {
    clientLogsOverlay.style.display = 'none';
  });
  document.getElementById('btn-client-log-kill').addEventListener('click', () => {
    if (window.api) {
      window.api.cancelLaunch();
      appendClientLog("[LAUNCHER] Killing game process...");
    }
  });
  document.getElementById('btn-client-log-upload').addEventListener('click', async () => {
    const btn = document.getElementById('btn-client-log-upload');
    const logText = clientSessionLogs.join('\n');
    if (!logText) {
      alert("No logs to upload yet.");
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    if (window.api) {
      const res = await window.api.uploadLog(logText);
      btn.disabled = false;
      btn.textContent = 'Upload to mclo.gs';
      if (res.success && res.url) {
        appendLog(`Logs uploaded to mclo.gs: ${res.url}`, 'success');
        appendClientLog(`[LAUNCHER] Logs successfully uploaded to: ${res.url}`);
        alert(`Logs uploaded successfully! URL copied to logs. Link:\n${res.url}`);
      } else {
        alert(`Failed to upload: ${res.error || 'Unknown error'}`);
      }
    } else {
      btn.disabled = false;
      btn.textContent = 'Upload to mclo.gs';
      alert("Mock Environment: Uploaded logs to mclo.gs mock endpoint.");
    }
  });
}

// Fetch Minecraft versions manifest on startup and initialize profiles
if (window.api) {
  // First load launcher config from disk
  window.api.getLauncherConfig().then(config => {
    launcherConfig = config;

    // Query storage path and update label
    window.api.getStoragePath().then(path => {
      const storageLabel = document.getElementById('storage-root-label');
      if (storageLabel) storageLabel.value = path;
    }).catch(err => console.error(err));

    window.api.fetchMcVersions().then(async (versions) => {
      allMcVersions = versions;
      initProfiles();
      populateIconSelect();
      populateProfileSelectors();
      updateLauncherUiForActiveProfile();
      renderInstallations();
      updateProfileVersionSelect();
      loadConfigurations();
    }).catch(async (err) => {
      console.error("Failed to fetch Minecraft versions:", err);
      // Fallback versions
      allMcVersions = {
        releases: ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'],
        snapshots: ['1.21.5-pre1'],
        latest: { release: '1.21.4', snapshot: '1.21.5-pre1' }
      };
      initProfiles();
      populateIconSelect();
      populateProfileSelectors();
      updateLauncherUiForActiveProfile();
      renderInstallations();
      updateProfileVersionSelect();
      loadConfigurations();
    });
  }).catch(err => {
    console.error("Failed to load launcher configuration:", err);
  });
} else {
  // Static browser simulation fallback
  launcherConfig = {
    username: 'Pramochak_MC',
    ram: '4096',
    javaPath: '',
    resWidth: '854',
    resHeight: '480',
    activeProfileId: '',
    profiles: []
  };
  allMcVersions = {
    releases: ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'],
    snapshots: ['1.21.5-pre1'],
    latest: { release: '1.21.4', snapshot: '1.21.5-pre1' }
  };
  initProfiles();
  populateIconSelect();
  populateProfileSelectors();
  updateLauncherUiForActiveProfile();
  renderInstallations();
  updateProfileVersionSelect();
  loadConfigurations();
}

// --- MOD MANAGER LOGIC ---
const modsProfileSelect = document.getElementById('mods-profile-select');
const modsProfileLoaderBadge = document.getElementById('mods-profile-loader-badge');
const tabModsSearch = document.getElementById('tab-mods-search');
const tabModsInstalled = document.getElementById('tab-mods-installed');
const pageModsSearch = document.getElementById('page-mods-search');
const pageModsInstalled = document.getElementById('page-mods-installed');
const modsSearchInput = document.getElementById('mods-search-input');
const btnModsSearch = document.getElementById('btn-mods-search');
const modsSearchList = document.getElementById('mods-search-list');
const modsInstalledList = document.getElementById('mods-installed-list');
const installedModsCount = document.getElementById('installed-mods-count');

// Toggle Tabs inside Mod Manager
if (tabModsSearch && tabModsInstalled && pageModsSearch && pageModsInstalled) {
  tabModsSearch.addEventListener('click', () => {
    tabModsSearch.classList.add('active');
    tabModsInstalled.classList.remove('active');
    pageModsSearch.style.display = 'flex';
    pageModsInstalled.style.display = 'none';
  });

  tabModsInstalled.addEventListener('click', () => {
    tabModsInstalled.classList.add('active');
    tabModsSearch.classList.remove('active');
    pageModsInstalled.style.display = 'flex';
    pageModsSearch.style.display = 'none';
    refreshInstalledMods();
  });
}

// Populate Profile select inside Mod Manager
function populateModsProfileSelect() {
  if (!modsProfileSelect) return;
  modsProfileSelect.innerHTML = userProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  modsProfileSelect.value = activeProfileId;
  updateModsProfileBadge();
}

function updateModsProfileBadge() {
  if (!modsProfileSelect || !modsProfileLoaderBadge) return;
  const profileId = modsProfileSelect.value;
  const profile = userProfiles.find(p => p.id === profileId);
  if (!profile) return;

  modsProfileLoaderBadge.textContent = profile.modloader.toUpperCase();
  modsProfileLoaderBadge.className = `loader-badge ${profile.modloader}`;

  // Enable/disable mod browsing based on modloader
  const isVanilla = profile.modloader === 'vanilla';
  if (modsSearchInput) modsSearchInput.disabled = isVanilla;
  if (btnModsSearch) btnModsSearch.disabled = isVanilla;

  if (isVanilla) {
    if (modsSearchInput) {
      modsSearchInput.placeholder = "Mods are not supported on Vanilla. Create a Fabric/Forge profile.";
      modsSearchInput.value = "";
    }
    if (modsSearchList) {
      modsSearchList.innerHTML = `
        <div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.95rem; line-height: 1.6;">
          <span style="color: #fc8181; font-weight: 800; font-size: 1.1rem; display: block; margin-bottom: 8px;">Vanilla Profile Selected</span>
          Vanilla profiles do not support mods. <br>
          Please go to the <strong style="color: var(--accent-green); cursor: pointer; text-decoration: underline;" id="link-go-to-installations">Installations</strong> tab to create a Fabric or Forge profile.
        </div>
      `;
      
      // Bind click to go to Installations screen
      setTimeout(() => {
        const link = document.getElementById('link-go-to-installations');
        if (link) {
          link.addEventListener('click', () => {
            const navInst = document.getElementById('nav-installations');
            if (navInst) navInst.click();
          });
        }
      }, 50);
    }
    if (modsInstalledList) {
      modsInstalledList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.95rem;">
          Vanilla profiles do not have a mods folder.
        </div>
      `;
    }
  } else {
    if (modsSearchInput) {
      modsSearchInput.placeholder = `Search mods for ${profile.name} (${profile.modloader.toUpperCase()})...`;
    }
  }
}

// Refresh profile list and details on profile selection change
if (modsProfileSelect) {
  modsProfileSelect.addEventListener('change', () => {
    updateModsProfileBadge();
    refreshInstalledMods();
    
    // Automatically load recommended popular mods for the newly selected modded profile
    const profile = userProfiles.find(p => p.id === modsProfileSelect.value);
    if (profile && profile.modloader !== 'vanilla') {
      searchModrinth("");
    }
  });
}

// Intercept populateProfileSelectors to keep modsProfileSelect in sync
const originalPopulateProfileSelectors = populateProfileSelectors;
populateProfileSelectors = function() {
  originalPopulateProfileSelectors();
  populateModsProfileSelect();
};

// Search mods on Modrinth API
async function searchModrinth(query) {
  if (!modsProfileSelect) return;
  const profile = userProfiles.find(p => p.id === modsProfileSelect.value);
  if (!profile) return;

  // Resolve version
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }

  const loader = profile.modloader;
  
  if (modsSearchList) {
    modsSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #fff; padding: 40px 0; font-size: 0.9rem;">Searching Modrinth...</div>`;
  }

  try {
    // Construct search query URL with version and loader facets
    let url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&project_type=mod`;
    
    // Add facets: loader (e.g. fabric, forge) and game version (e.g. 1.20.1)
    const facets = [];
    if (loader !== 'vanilla') {
      facets.push(`["categories:${loader}"]`);
    }
    facets.push(`["versions:${resolvedVersion}"]`);
    facets.push('["project_type:mod"]');
    
    url += `&facets=${encodeURIComponent(`[${facets.join(',')}]`)}`;
    console.log('[MODRINTH SEARCH] Querying:', url);

    const res = await fetch(url, { headers: { 'User-Agent': 'Pramochak-MC-Launcher/2.0.0 (antigravity)' } });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();

    renderModsSearchResults(data.hits || []);
  } catch (err) {
    console.error('Error fetching mods from Modrinth:', err);
    if (modsSearchList) {
      modsSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #fc8181; padding: 40px 0; font-size: 0.9rem;">Failed to fetch mods from Modrinth. Check network connection.<br>${err.message}</div>`;
    }
  }
}

// Render search results
function renderModsSearchResults(hits) {
  if (!modsSearchList) return;
  if (hits.length === 0) {
    modsSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.9rem;">No compatible mods found on Modrinth for this version/loader.</div>`;
    return;
  }

  const profile = userProfiles.find(p => p.id === modsProfileSelect.value);
  const isVanilla = profile && profile.modloader === 'vanilla';

  modsSearchList.innerHTML = '';
  const fragment = document.createDocumentFragment();

  hits.forEach(hit => {
    const card = document.createElement('div');
    card.className = 'mod-card';
    
    const iconUrl = hit.icon_url || 'assets/grass_block.png'; // Fallback
    const title = hit.title || 'Unknown Mod';
    const description = hit.description || 'No description provided.';
    const author = hit.author || 'Unknown';
    const downloads = hit.downloads || 0;
    const projectId = hit.project_id;

    // Convert downloads to readable format
    let formattedDownloads = downloads >= 1000000 ? `${(downloads / 1000000).toFixed(1)}M` : (downloads >= 1000 ? `${(downloads / 1000).toFixed(0)}k` : downloads);

    card.innerHTML = `
      <div class="mod-card-header">
        <img src="${iconUrl}" class="mod-icon" loading="lazy" decoding="async" onerror="this.src='assets/steve_avatar.png';">
        <div class="mod-info-meta">
          <span class="mod-title" title="${title}">${title}</span>
          <span class="mod-author">by ${author}</span>
        </div>
      </div>
      <div class="mod-card-body" title="${description}">${description}</div>
      <div class="mod-card-footer">
        <div class="mod-downloads">
          <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
          <span>${formattedDownloads}</span>
        </div>
        <button class="btn-mod-install" data-id="${projectId}" ${isVanilla ? 'disabled title="Cannot install mods on a Vanilla profile. Change modloader to Fabric or Forge first."' : ''}>Install</button>
      </div>
    `;

    if (!isVanilla) {
      card.querySelector('.btn-mod-install').addEventListener('click', (e) => {
        const btn = e.target;
        installMod(projectId, title, btn);
      });
    }

    fragment.appendChild(card);
  });

  modsSearchList.appendChild(fragment);
}

// Install mod logic
async function installMod(projectId, modTitle, btnElement) {
  if (!modsProfileSelect) return;
  const profileId = modsProfileSelect.value;
  const profile = userProfiles.find(p => p.id === profileId);
  if (!profile) return;

  // Resolve version
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }

  const loader = profile.modloader;
  if (loader === 'vanilla') return;

  btnElement.disabled = true;
  btnElement.textContent = 'Preparing...';

  try {
    // Step 1: Query Modrinth API to get compatible versions for this project
    const versionUrl = `https://api.modrinth.com/v2/project/${projectId}/version?loaders=${encodeURIComponent(`["${loader}"]`)}&game_versions=${encodeURIComponent(`["${resolvedVersion}"]`)}`;
    console.log('[MOD DOWNLOAD] Querying versions:', versionUrl);
    
    const res = await fetch(versionUrl, { headers: { 'User-Agent': 'Pramochak-MC-Launcher/2.0.0 (antigravity)' } });
    if (!res.ok) throw new Error(`Modrinth Version API status ${res.status}`);
    const versions = await res.json();

    if (versions.length === 0) {
      throw new Error('No compatible version found for this profile configuration on Modrinth.');
    }

    // Step 2: Grab the primary file from the latest version
    const latestVersion = versions[0];
    const file = latestVersion.files.find(f => f.primary) || latestVersion.files[0];
    if (!file) {
      throw new Error('No files found inside the compatible Modrinth version package.');
    }

    btnElement.textContent = 'Downloading...';
    console.log(`[MOD DOWNLOAD] Downloading ${file.filename} from ${file.url}...`);

    // Step 3: Trigger main process secure downloader
    if (window.api) {
      const result = await window.api.downloadMod({
        profileId: profileId,
        modUrl: file.url,
        filename: file.filename
      });

      if (result.success) {
        // Resolve and Install Dependencies
        if (latestVersion.dependencies && latestVersion.dependencies.length > 0) {
          btnElement.textContent = 'Dependencies...';
          const installedJarNames = await window.api.getInstalledMods(profileId);
          await resolveAndInstallDependencies(latestVersion.dependencies, profileId, loader, resolvedVersion, installedJarNames);
        }
        
        btnElement.textContent = 'Installed ✓';
        btnElement.style.background = '#38a169';
        appendLog(`Successfully installed mod ${modTitle} (${file.filename}) securely.`, 'success');
        refreshInstalledModsCount();
      } else {
        throw new Error(result.error || 'Downloader error occurred.');
      }
    } else {
      // Mock sandbox environment
      setTimeout(() => {
        btnElement.textContent = 'Installed ✓';
        btnElement.style.background = '#38a169';
        appendLog(`Mock Environment: mod ${modTitle} installed successfully.`, 'success');
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to install mod:', err);
    btnElement.disabled = false;
    btnElement.textContent = 'Failed';
    btnElement.style.background = '#e53e3e';
    alert(`Failed to install ${modTitle}: ${err.message}`);
    setTimeout(() => {
      btnElement.textContent = 'Install';
      btnElement.style.background = 'var(--accent-green)';
    }, 2000);
  }
}

// Refresh installed mods count on Browse tab
async function refreshInstalledModsCount() {
  if (!modsProfileSelect || !installedModsCount) return;
  const profileId = modsProfileSelect.value;
  if (!profileId) {
    installedModsCount.textContent = "0";
    return;
  }
  if (window.api) {
    const list = await window.api.getInstalledMods(profileId);
    installedModsCount.textContent = list.length;
  }
}

// Load and render installed mods inside the profile's instances folder
async function refreshInstalledMods() {
  if (!modsProfileSelect || !modsInstalledList || !installedModsCount) return;
  const profileId = modsProfileSelect.value;
  const profile = userProfiles.find(p => p.id === profileId);
  if (!profile) return;

  if (window.api) {
    try {
      const list = await window.api.getInstalledMods(profileId);
      installedModsCount.textContent = list.length;

      if (list.length === 0) {
        modsInstalledList.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.9rem;">
            No mods installed in profile "${profile.name}".<br>Go to the "Browse Modrinth" tab to install mods!
          </div>
        `;
        return;
      }

      modsInstalledList.innerHTML = '';
      list.forEach(filename => {
        const item = document.createElement('div');
        item.className = 'installed-mod-item';

        item.innerHTML = `
          <div class="installed-mod-left">
            <div class="installed-mod-icon-wrapper">
              <svg viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.38 0 2.5 1.12 2.5 2.5S4.88 15.8 3.5 15.8H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5z"/></svg>
            </div>
            <div class="installed-mod-details">
              <span class="installed-mod-filename" title="${filename}">${filename}</span>
              <span class="installed-mod-meta">Active Java Archive (.jar)</span>
            </div>
          </div>
          <button class="btn-installed-mod-delete" data-file="${filename}" title="Delete Mod File">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        `;

        item.querySelector('.btn-installed-mod-delete').addEventListener('click', async (e) => {
          if (confirm(`Are you sure you want to delete mod file "${filename}"?`)) {
            const deleteResult = await window.api.deleteMod({
              profileId: profileId,
              filename: filename
            });

            if (deleteResult.success) {
              appendLog(`Successfully deleted mod ${filename} from disk.`, 'info');
              refreshInstalledMods();
            } else {
              alert(`Failed to delete mod: ${deleteResult.error}`);
            }
          }
        });

        modsInstalledList.appendChild(item);
      });
    } catch (err) {
      console.error('Error refreshing installed mods:', err);
    }
  } else {
    // Static mockup behavior
    installedModsCount.textContent = "0";
    modsInstalledList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.9rem;">Browser mockup: file system scanning disabled.</div>`;
  }
}

// Bind search controls
if (btnModsSearch && modsSearchInput) {
  btnModsSearch.addEventListener('click', () => {
    const q = modsSearchInput.value.trim();
    searchModrinth(q);
  });

  modsSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnModsSearch.click();
    }
  });
}

// Make sure the active mods selector and badge is populated on startup
setTimeout(() => {
  populateModsProfileSelect();
  refreshInstalledModsCount();
  
  // Startup: Load active skin/cape to render header avatar
  loadActiveSkinStartup();
}, 2000);

/* =======================================================
   SKINS & CAPES MANAGER FRONTEND LOGIC
   ======================================================= */

let skinViewer = null;
let activeSkinBase64 = null;
let activeCapeBase64 = null;
let activeModelType = 'classic'; // 'classic' or 'slim'
let isSkinsInitialized = false;

// Editor State
let editorCanvas = null;
let editorCtx = null;
let activeColor = '#4caf50';
let isDrawing = false;
let activeTool = 'pencil';
let isGridOn = true;
let editorZoom = 6;

// Curated featured skins list (fetches 2D avatars from MCHeads)
const featuredSkins = [
  { name: "Classic Steve", username: "MHF_Steve" },
  { name: "Classic Alex", username: "MHF_Alex" },
  { name: "Herobrine", username: "Herobrine" },
  { name: "Dream", username: "Dream" },
  { name: "Technoblade", username: "Technoblade" },
  { name: "Tuxedo Steve", username: "Tuxedo_Steve" },
  { name: "Notch (Creator)", username: "Notch" },
  { name: "Creeper Hero", username: "Creeper" },
  { name: "Neon LabyMod", username: "LabyMod" }
];

// Block-themed Minecraft color palette swatches
const blockPalette = [
  '#ebae82', // Steve Skin
  '#643c14', // Oak Log / Hair Brown
  '#00c0c0', // Cyan Shirt
  '#4040ff', // Pants Blue
  '#00bcd4', // Diamond Blue
  '#ffeb3b', // Gold Yellow
  '#f44336', // Redstone Red
  '#4caf50', // Grass Green
  '#311b92', // Obsidian Purple
  '#757575', // Furnace Stone Gray
  '#ffffff', // White
  '#000000'  // Black
];

// Offline fallback generator for Steve skin sheet
function generateSteveSkinBase64() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, 64, 64);
  
  // Head
  ctx.fillStyle = '#643c14'; // Hair
  ctx.fillRect(8, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 2);
  ctx.fillStyle = '#ebae82'; // Skin
  ctx.fillRect(8, 10, 8, 6);
  // Hair sides
  ctx.fillStyle = '#643c14';
  ctx.fillRect(0, 8, 8, 8);
  ctx.fillRect(16, 8, 16, 8);
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(16, 0, 16, 8);
  // Eyes
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(9, 12, 1, 1);
  ctx.fillRect(14, 12, 1, 1);
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(10, 12, 1, 1);
  ctx.fillRect(13, 12, 1, 1);
  // Nose/Mouth
  ctx.fillStyle = '#c87d5a';
  ctx.fillRect(11, 13, 2, 1);
  ctx.fillStyle = '#643c14';
  ctx.fillRect(11, 14, 2, 1);
  
  // Torso
  ctx.fillStyle = '#00c0c0'; // Shirt
  ctx.fillRect(20, 20, 8, 6);
  ctx.fillStyle = '#ebae82';
  ctx.fillRect(22, 20, 4, 1);
  ctx.fillStyle = '#4040ff'; // Pants
  ctx.fillRect(20, 26, 8, 6);
  // Torso sides
  ctx.fillStyle = '#00c0c0';
  ctx.fillRect(16, 20, 4, 12);
  ctx.fillRect(28, 20, 12, 12);
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(16, 26, 4, 6);
  ctx.fillRect(28, 26, 12, 6);
  
  // Right Arm
  ctx.fillStyle = '#00c0c0';
  ctx.fillRect(44, 20, 4, 2);
  ctx.fillStyle = '#ebae82';
  ctx.fillRect(44, 22, 4, 10);
  ctx.fillStyle = '#00c0c0';
  ctx.fillRect(40, 20, 4, 12);
  ctx.fillRect(48, 20, 8, 12);
  ctx.fillStyle = '#ebae82';
  ctx.fillRect(40, 22, 4, 10);
  ctx.fillRect(48, 22, 8, 10);
  
  // Left Arm
  ctx.fillStyle = '#00c0c0';
  ctx.fillRect(36, 52, 4, 2);
  ctx.fillStyle = '#ebae82';
  ctx.fillRect(36, 54, 4, 10);
  ctx.fillStyle = '#00c0c0';
  ctx.fillRect(32, 52, 4, 12);
  ctx.fillRect(40, 52, 8, 12);
  ctx.fillStyle = '#ebae82';
  ctx.fillRect(32, 54, 4, 10);
  ctx.fillRect(40, 54, 8, 10);
  
  // Right Leg
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(4, 20, 4, 10);
  ctx.fillStyle = '#404040';
  ctx.fillRect(4, 30, 4, 2);
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(0, 20, 4, 12);
  ctx.fillRect(8, 20, 8, 12);
  ctx.fillStyle = '#404040';
  ctx.fillRect(0, 30, 4, 2);
  ctx.fillRect(8, 30, 8, 2);
  
  // Left Leg
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(20, 48, 4, 10);
  ctx.fillStyle = '#404040';
  ctx.fillRect(20, 58, 4, 2);
  ctx.fillStyle = '#4040ff';
  ctx.fillRect(16, 48, 4, 16);
  ctx.fillRect(24, 48, 8, 16);
  ctx.fillStyle = '#404040';
  ctx.fillRect(16, 58, 4, 2);
  ctx.fillRect(24, 58, 8, 2);
  
  return canvas.toDataURL();
}

// Convert online image url to base64 dataURL via canvas (respects CORS)
function imageToDataUrl(url, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    callback(canvas.toDataURL('image/png'));
  };
  img.onerror = function() {
    alert("Failed to load skin image from online server. Verify connection.");
  };
  img.src = url;
}

// Extract player face coordinates to sync top-right card profile avatar
function updateHeaderAvatar(skinDataUrl) {
  const img = new Image();
  img.onload = function() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false; // Blocky pixel look
    
    // Draw face
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
    // Overlay hair/hat layer
    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
    
    const headerAvatarImg = document.getElementById('header-avatar');
    if (headerAvatarImg) {
      headerAvatarImg.src = canvas.toDataURL();
    }
  };
  img.src = skinDataUrl;
}

// Read saved settings at startup
async function loadActiveSkinStartup() {
  const activeUser = launcherConfig.username || 'Pramochak_MC';
  headerUsername.textContent = activeUser;
  
  if (window.api) {
    const res = await window.api.loadActiveSkinCape(activeUser);
    if (res.success && res.skin) {
      activeSkinBase64 = res.skin;
      activeCapeBase64 = res.cape;
      activeModelType = res.modelType || 'classic';
      
      updateHeaderAvatar(activeSkinBase64);
    } else {
      // Offline default
      activeSkinBase64 = generateSteveSkinBase64();
      updateHeaderAvatar(activeSkinBase64);
    }
  } else {
    // Mock sandbox startup
    activeSkinBase64 = generateSteveSkinBase64();
    updateHeaderAvatar(activeSkinBase64);
  }
}

// Helper to create the 3D skin viewer canvas instance
function createSkinViewerInstance() {
  const mount = document.getElementById('skin-viewer-mount');
  if (mount && typeof skinview3d !== 'undefined') {
    const dpr = Math.min(window.devicePixelRatio || 2, 3);
    const w = mount.clientWidth || 280;
    const h = mount.clientHeight || 340;

    skinViewer = new skinview3d.SkinViewer({
      canvas: document.createElement('canvas'),
      width: w,
      height: h,
    });

    if (skinViewer.renderer) {
      skinViewer.renderer.setPixelRatio(dpr);
    }

    mount.innerHTML = ''; // Clear previous canvas or loading indicator
    mount.appendChild(skinViewer.canvas);
    
    // Config properties
    skinViewer.autoRotate = document.getElementById('skin-viewer-rotate').checked;
    skinViewer.autoRotateSpeed = 0.6;
    
    // Load initial textures
    if (activeSkinBase64) {
      skinViewer.loadSkin(activeSkinBase64);
    } else {
      activeSkinBase64 = generateSteveSkinBase64();
      skinViewer.loadSkin(activeSkinBase64);
    }
    
    if (activeCapeBase64) {
      skinViewer.loadCape(activeCapeBase64);
      skinViewer.playerObject.cape.visible = document.getElementById('skin-viewer-cape').checked;
    }
    
    skinViewer.playerObject.skin.modelType = activeModelType;
    
    // Start initial walk animation
    const animSelect = document.getElementById('skin-viewer-animation');
    if (animSelect) {
      const val = animSelect.value;
      if (val === 'idle') {
        skinViewer.animation = new skinview3d.IdleAnimation();
      } else if (val === 'walk') {
        skinViewer.animation = new skinview3d.WalkingAnimation();
      } else if (val === 'run') {
        skinViewer.animation = new skinview3d.RunningAnimation();
      } else if (val === 'fly') {
        skinViewer.animation = new skinview3d.FlyingAnimation();
      } else {
        skinViewer.animation = null;
      }
    } else {
      skinViewer.animation = new skinview3d.WalkingAnimation();
    }
  }
}

// Core initialization of skins manager screen
function initSkinsScreen() {
  if (isSkinsInitialized) {
    // Sync active model type inputs to match current state
    const radioInput = document.querySelector(`input[name="model-type"][value="${activeModelType}"]`);
    if (radioInput) radioInput.checked = true;
    
    // Re-create viewer if it was disposed
    if (!skinViewer) {
      createSkinViewerInstance();
    } else {
      const mount = document.getElementById('skin-viewer-mount');
      if (mount) {
        skinViewer.setSize(mount.clientWidth, mount.clientHeight);
      }
    }
    initSkinCreator();
    return;
  }
  
  isSkinsInitialized = true;
  
  // 1. Initialize 3D Viewer (uses skinview3d bundle loaded from assets/)
  createSkinViewerInstance();
  
  // Bind controls (references global skinViewer variable safely)
  const rotateCheckbox = document.getElementById('skin-viewer-rotate');
  if (rotateCheckbox) {
    rotateCheckbox.addEventListener('change', (e) => {
      if (skinViewer) skinViewer.autoRotate = e.target.checked;
    });
  }
  
  const capeCheckbox = document.getElementById('skin-viewer-cape');
  if (capeCheckbox) {
    capeCheckbox.addEventListener('change', (e) => {
      if (skinViewer && skinViewer.playerObject && skinViewer.playerObject.cape) {
        skinViewer.playerObject.cape.visible = e.target.checked;
      }
    });
  }
  
  // Model type radio toggle
  document.querySelectorAll('input[name="model-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      activeModelType = e.target.value;
      if (skinViewer && skinViewer.playerObject && skinViewer.playerObject.skin) {
        skinViewer.playerObject.skin.modelType = activeModelType;
      }
    });
  });
  
  const animSelect = document.getElementById('skin-viewer-animation');
  if (animSelect) {
    animSelect.addEventListener('change', (e) => {
      if (!skinViewer) return;
      const val = e.target.value;
      if (val === 'idle') {
        skinViewer.animation = new skinview3d.IdleAnimation();
      } else if (val === 'walk') {
        skinViewer.animation = new skinview3d.WalkingAnimation();
      } else if (val === 'run') {
        skinViewer.animation = new skinview3d.RunningAnimation();
      } else if (val === 'fly') {
        skinViewer.animation = new skinview3d.FlyingAnimation();
      } else {
        skinViewer.animation = null;
      }
    });
  }
  
  // 2. Wardrobe File Upload Elements
  const skinUploadBox = document.getElementById('upload-skin-box');
  const capeUploadBox = document.getElementById('upload-cape-box');
  const skinFileInput = document.getElementById('skin-file-input');
  const capeFileInput = document.getElementById('cape-file-input');
  
  if (skinUploadBox && skinFileInput) {
    skinUploadBox.addEventListener('click', () => skinFileInput.click());
    skinFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleSkinFile(file);
    });
  }
  
  if (capeUploadBox && capeFileInput) {
    capeUploadBox.addEventListener('click', () => capeFileInput.click());
    capeFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleCapeFile(file);
    });
  }
  
  // Drag and Drop hooks
  [skinUploadBox, capeUploadBox].forEach(box => {
    if (!box) return;
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.style.borderColor = 'var(--primary)';
    });
    box.addEventListener('dragleave', () => {
      box.style.borderColor = 'var(--outline)';
    });
  });
  
  if (skinUploadBox) {
    skinUploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      skinUploadBox.style.borderColor = 'var(--outline)';
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'image/png') handleSkinFile(file);
    });
  }
  
  if (capeUploadBox) {
    capeUploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      capeUploadBox.style.borderColor = 'var(--outline)';
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'image/png') handleCapeFile(file);
    });
  }
  
  // Save Wardrobe configs
  const btnSaveSkin = document.getElementById('btn-save-skin');
  if (btnSaveSkin) {
    btnSaveSkin.addEventListener('click', async () => {
      const activeUser = launcherConfig.username || 'Pramochak_MC';
      
      const radioInput = document.querySelector('input[name="model-type"]:checked');
      if (radioInput) activeModelType = radioInput.value;
      
      if (skinViewer && skinViewer.playerObject && skinViewer.playerObject.skin) {
        skinViewer.playerObject.skin.modelType = activeModelType;
      }
      
      if (window.api) {
        appendLog("Saving custom skin configuration files...", "info");
        const res = await window.api.saveActiveSkinCape({
          username: activeUser,
          skinBase64: activeSkinBase64,
          capeBase64: activeCapeBase64,
          modelType: activeModelType
        });
        
        if (res.success) {
          appendLog("Active skin and cape configurations applied successfully!", "success");
          updateHeaderAvatar(activeSkinBase64);
          alert("Skin configuration applied successfully! (Saved locally to instances folder)");
        } else {
          alert("Error saving configuration: " + res.error);
        }
      } else {
        updateHeaderAvatar(activeSkinBase64);
        alert("Mock Sandbox: Skin configurations saved successfully.");
      }
    });
  }
  
  // Clear Active Cape / Reset
  const btnResetSkin = document.getElementById('btn-reset-skin');
  if (btnResetSkin) {
    btnResetSkin.addEventListener('click', () => {
      if (confirm("Reset skin settings to default Steve?")) {
        activeSkinBase64 = generateSteveSkinBase64();
        activeCapeBase64 = null;
        
        if (skinViewer) {
          skinViewer.loadSkin(activeSkinBase64);
          skinViewer.loadCape(null);
        }
        
        // Sync editor canvas
        if (editorCtx && editorCanvas) {
          const img = new Image();
          img.onload = () => {
            editorCtx.clearRect(0, 0, 64, 64);
            editorCtx.drawImage(img, 0, 0);
          };
          img.src = activeSkinBase64;
        }
        
        appendLog("Skin configurations reset to defaults.", "info");
      }
    });
  }
  
  // 3. Skins Online Library Stealer search binding
  const btnSkinSearch = document.getElementById('btn-skin-search');
  if (btnSkinSearch) {
    btnSkinSearch.addEventListener('click', async () => {
      const searchInput = document.getElementById('skin-search-username');
      const searchVal = searchInput ? searchInput.value.trim() : '';
      if (!searchVal) {
        alert("Please enter a Minecraft username to search.");
        return;
      }
      
      btnSkinSearch.innerHTML = `<span>Fetching...</span>`;
      btnSkinSearch.disabled = true;
      const searchSource = document.getElementById('skin-search-source') ? document.getElementById('skin-search-source').value : 'mojang';
      
      if (window.api) {
        let res;
        if (searchSource === 'elyby') {
          appendLog(`Fetching skin from Ely.by skin database for player: ${searchVal}`, "info");
          res = await window.api.fetchElybySkinCape(searchVal);
        } else {
          appendLog(`Fetching skin from Mojang session servers for player: ${searchVal}`, "info");
          res = await window.api.fetchMojangSkinCape(searchVal);
        }
        btnSkinSearch.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg><span>Fetch Skin</span>`;
        btnSkinSearch.disabled = false;
        
        if (res.success && res.skin) {
          activeSkinBase64 = res.skin;
          activeCapeBase64 = res.cape;
          
          if (skinViewer) {
            skinViewer.loadSkin(activeSkinBase64);
            if (activeCapeBase64) {
              skinViewer.loadCape(activeCapeBase64);
              const capeCheck = document.getElementById('skin-viewer-cape');
              if (capeCheck) capeCheck.checked = true;
              if (skinViewer.playerObject && skinViewer.playerObject.cape) {
                skinViewer.playerObject.cape.visible = true;
              }
            } else {
              skinViewer.loadCape(null);
            }
          }
          
          // Sync editor canvas
          if (editorCtx && editorCanvas) {
            const img = new Image();
            img.onload = () => {
              editorCtx.clearRect(0, 0, 64, 64);
              editorCtx.drawImage(img, 0, 0);
            };
            img.src = activeSkinBase64;
          }
          
          appendLog(`Successfully imported skin from user "${searchVal}"! Click "Save & Apply Wardrobe" to apply.`, "success");
        } else {
          alert("Failed to retrieve skin. Player may not exist or does not have a custom skin.");
        }
      } else {
        setTimeout(() => {
          btnSkinSearch.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg><span>Fetch Skin</span>`;
          btnSkinSearch.disabled = false;
          alert("Mock Sandbox: Skin search is unavailable offline.");
        }, 1000);
      }
    });
  }
  
  // Populate curated quick-select avatars row
  populateFeaturedSkinsGallery();

  // 4. Initialize Embedded Live Pixel Art Creator
  initSkinCreator();
}

// Load custom skin file upload checks
function handleSkinFile(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    
    // Dimensions validation
    const img = new Image();
    img.onload = function() {
      if ((img.width === 64 && img.height === 64) || (img.width === 64 && img.height === 32)) {
        activeSkinBase64 = dataUrl;
        if (skinViewer) {
          skinViewer.loadSkin(dataUrl);
        }
        if (editorCtx && editorCanvas) {
          editorCtx.clearRect(0, 0, 64, 64);
          editorCtx.drawImage(img, 0, 0);
        }
        appendLog("Uploaded custom skin loaded into wardrobe preview and editor.", "success");
      } else {
        alert("Invalid skin dimensions! A standard Minecraft skin must be 64x64 or 64x32 pixels.");
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// Load custom cape file upload checks
function handleCapeFile(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const dataUrl = event.target.result;
    
    const img = new Image();
    img.onload = function() {
      if ((img.width === 64 && img.height === 32) || (img.width === 22 && img.height === 17) || (img.width === 128 && img.height === 64)) {
        activeCapeBase64 = dataUrl;
        if (skinViewer) {
          skinViewer.loadCape(dataUrl);
          const capeCheck = document.getElementById('skin-viewer-cape');
          if (capeCheck) capeCheck.checked = true;
          if (skinViewer.playerObject && skinViewer.playerObject.cape) {
            skinViewer.playerObject.cape.visible = true;
          }
        }
        appendLog("Uploaded custom cape loaded into wardrobe preview.", "success");
      } else {
        alert("Invalid cape dimensions! Standard cape formats: 64x32, 22x17 or 128x64 pixels.");
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

// Curated skins gallery render (Horizontal Avatar Chips)
function populateFeaturedSkinsGallery() {
  const grid = document.getElementById('featured-skins-grid');
  if (!grid) return;
  
  grid.innerHTML = '';
  featuredSkins.forEach(skin => {
    const chip = document.createElement('div');
    chip.className = 'avatar-chip';
    chip.title = `Click to load ${skin.name}`;
    
    const thumbUrl = `https://mc-heads.net/avatar/${skin.username}/48`;
    
    chip.innerHTML = `
      <img src="${thumbUrl}" class="avatar-chip-img" alt="${skin.name}">
      <span class="avatar-chip-name">${skin.name}</span>
    `;
    
    chip.addEventListener('click', () => {
      appendLog(`Downloading skin texture sheet for featured skin: ${skin.name}...`, "info");
      const fullSkinUrl = `https://mc-heads.net/skin/${skin.username}`;
      
      imageToDataUrl(fullSkinUrl, (base64Texture) => {
        activeSkinBase64 = base64Texture;
        activeCapeBase64 = null; // Reset cape on character change
        
        if (skinViewer) {
          skinViewer.loadSkin(activeSkinBase64);
          skinViewer.loadCape(null);
        }
        
        if (editorCtx && editorCanvas) {
          const img = new Image();
          img.onload = () => {
            editorCtx.clearRect(0, 0, 64, 64);
            editorCtx.drawImage(img, 0, 0);
          };
          img.src = activeSkinBase64;
        }
        
        appendLog(`Featured skin "${skin.name}" loaded! Click "Save & Apply Wardrobe" to apply.`, "success");
      });
    });
    
    grid.appendChild(chip);
  });
}

// 2D Pixel Art Skin Creator initializations
function initSkinCreator() {
  editorCanvas = document.getElementById('skin-editor-canvas');
  if (!editorCanvas) return;
  
  editorCtx = editorCanvas.getContext('2d');
  editorCtx.imageSmoothingEnabled = false;
  
  // Populate color palettes
  const paletteDiv = document.getElementById('editor-palette');
  paletteDiv.innerHTML = '';
  
  blockPalette.forEach(col => {
    const dot = document.createElement('div');
    dot.className = 'palette-color';
    dot.style.background = col;
    
    dot.addEventListener('click', () => {
      activeColor = col;
      document.getElementById('editor-color-picker').value = col;
    });
    paletteDiv.appendChild(dot);
  });
  
  // Bind Color picker input
  document.getElementById('editor-color-picker').addEventListener('input', (e) => {
    activeColor = e.target.value;
  });
  
  // Draw current active skin texture onto the editor canvas on first load
  const img = new Image();
  img.onload = function() {
    editorCtx.clearRect(0, 0, 64, 64);
    editorCtx.drawImage(img, 0, 0);
    updateEditorCanvasZoom();
  };
  img.src = activeSkinBase64 || generateSteveSkinBase64();
  
  // Tools toggling
  const tools = {
    'tool-pencil': 'pencil',
    'tool-eraser': 'eraser',
    'tool-bucket': 'bucket',
    'tool-picker': 'picker'
  };
  
  Object.keys(tools).forEach(id => {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = tools[id];
    });
  });
  
  // Canvas drawing event listeners
  editorCanvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    drawAtMouse(e);
  });
  
  editorCanvas.addEventListener('mousemove', (e) => {
    if (isDrawing) drawAtMouse(e);
  });
  
  window.addEventListener('mouseup', () => {
    isDrawing = false;
  });
  
  // Zoom slider binding
  const zoomSlider = document.getElementById('editor-zoom');
  zoomSlider.addEventListener('input', (e) => {
    editorZoom = parseInt(e.target.value);
    updateEditorCanvasZoom();
  });
  
  // Grid toggle button binding
  const gridToggle = document.getElementById('btn-editor-grid-toggle');
  gridToggle.addEventListener('click', () => {
    isGridOn = !isGridOn;
    gridToggle.textContent = `Grid: ${isGridOn ? 'ON' : 'OFF'}`;
    updateEditorCanvasZoom();
  });
  
  // Canvas actions bindings
  document.getElementById('btn-editor-import').addEventListener('click', () => {
    if (confirm("Replace editor canvas pixels with active Wardrobe skin?")) {
      const imgImport = new Image();
      imgImport.onload = function() {
        editorCtx.clearRect(0, 0, 64, 64);
        editorCtx.drawImage(imgImport, 0, 0);
        if (skinViewer) skinViewer.loadSkin(editorCanvas.toDataURL());
      };
      imgImport.src = activeSkinBase64;
    }
  });
  
  document.getElementById('btn-editor-download').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'custom_minecraft_skin.png';
    link.href = editorCanvas.toDataURL('image/png');
    link.click();
    appendLog("Custom skin file exported to Downloads folder.", "success");
  });
  
  const btnEditorApply = document.getElementById('btn-editor-apply');
  if (btnEditorApply) {
    btnEditorApply.addEventListener('click', () => {
      activeSkinBase64 = editorCanvas.toDataURL('image/png');
      if (skinViewer) {
        skinViewer.loadSkin(activeSkinBase64);
      }
      appendLog("Creator skin synced with 3D stage.", "info");
    });
  }
}

// Map screen pixels to 2D 64x64 grid coordinates
function drawAtMouse(e) {
  if (!editorCanvas || !editorCtx) return;
  const rect = editorCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const pixelX = Math.floor((x / rect.width) * 64);
  const pixelY = Math.floor((y / rect.height) * 64);
  
  if (pixelX >= 0 && pixelX < 64 && pixelY >= 0 && pixelY < 64) {
    if (activeTool === 'pencil') {
      editorCtx.fillStyle = activeColor;
      editorCtx.fillRect(pixelX, pixelY, 1, 1);
    } else if (activeTool === 'eraser') {
      editorCtx.clearRect(pixelX, pixelY, 1, 1);
    } else if (activeTool === 'bucket') {
      floodFill(editorCtx, pixelX, pixelY, activeColor);
    } else if (activeTool === 'picker') {
      const data = editorCtx.getImageData(pixelX, pixelY, 1, 1).data;
      if (data[3] > 0) {
        const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => {
          const hex = v.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
        activeColor = rgbToHex(data[0], data[1], data[2]);
        document.getElementById('editor-color-picker').value = activeColor;
      }
    }
    
    // Live update 3D model
    if (skinViewer) {
      skinViewer.loadSkin(editorCanvas.toDataURL());
    }
  }
}

// Zoom and CSS repeating gradient grid renderer
function updateEditorCanvasZoom() {
  if (!editorCanvas) return;
  
  if (editorCtx) {
    editorCtx.imageSmoothingEnabled = false;
  }
  
  const displaySize = 64 * editorZoom;
  editorCanvas.style.width = `${displaySize}px`;
  editorCanvas.style.height = `${displaySize}px`;
  
  if (isGridOn) {
    editorCanvas.style.backgroundImage = `
      linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px)
    `;
    editorCanvas.style.backgroundSize = `${editorZoom}px ${editorZoom}px`;
  } else {
    editorCanvas.style.backgroundImage = 'none';
  }
}

// Queue-based flood fill algorithm for the drawing board
function floodFill(ctx, startX, startY, fillColor) {
  const imgData = ctx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  const width = imgData.width;
  const height = imgData.height;
  
  const startIdx = (startY * width + startX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];
  
  const hex = fillColor.replace('#', '');
  const fillR = parseInt(hex.substring(0, 2), 16);
  const fillG = parseInt(hex.substring(2, 4), 16);
  const fillB = parseInt(hex.substring(4, 6), 16);
  const fillA = 255;
  
  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) {
    return;
  }
  
  const queue = [[startX, startY]];
  
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const idx = (y * width + x) * 4;
    
    if (data[idx] === targetR && data[idx + 1] === targetG && data[idx + 2] === targetB && data[idx + 3] === targetA) {
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;
      
      if (x > 0) queue.push([x - 1, y]);
      if (x < width - 1) queue.push([x + 1, y]);
      if (y > 0) queue.push([x, y - 1]);
      if (y < height - 1) queue.push([x, y + 1]);
    }
  }
  
  ctx.putImageData(imgData, 0, 0);
}

// --- WORLDS MANAGER FRONTEND IMPLEMENTATION ---

// DOM Elements
const worldsSearchInput = document.getElementById('worlds-search-input');
const worldsProfileSelect = document.getElementById('worlds-profile-select');
const btnOpenSavesFolder = document.getElementById('btn-open-saves-folder');
const worldsGrid = document.getElementById('worlds-grid');
const worldsEmptyState = document.getElementById('worlds-empty-state');

let currentWorldsData = [];
let worldsInitialized = false;

// Initialize Worlds Screen
function initWorldsScreen() {
  populateWorldsProfileSelect();
  loadWorldsList();
  
  if (!worldsInitialized) {
    worldsInitialized = true;
    
    // Bind search typing filter (optimized with 200ms debounce to prevent layout thrashing)
    if (worldsSearchInput) {
      worldsSearchInput.addEventListener('input', debounce(() => {
        renderWorlds(currentWorldsData);
      }, 200));
    }
    
    // Bind profile switch event
    if (worldsProfileSelect) {
      worldsProfileSelect.addEventListener('change', () => {
        loadWorldsList();
      });
    }
    
    // Bind open saves directory
    if (btnOpenSavesFolder) {
      btnOpenSavesFolder.addEventListener('click', () => {
        const selectedProfileId = worldsProfileSelect ? worldsProfileSelect.value : activeProfileId;
        if (window.api) {
          window.api.openSavesFolder(selectedProfileId);
        } else {
          alert(`Mock saves folder open for: ${selectedProfileId}`);
        }
      });
    }
  }
}

// Populate Profile Selection Dropdown inside Worlds screen
function populateWorldsProfileSelect() {
  if (!worldsProfileSelect) return;
  const options = userProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  worldsProfileSelect.innerHTML = options;
  worldsProfileSelect.value = activeProfileId;
}

// Load Worlds List from IPC
async function loadWorldsList() {
  if (!worldsGrid) return;
  worldsGrid.innerHTML = '';
  if (worldsEmptyState) worldsEmptyState.style.display = 'none';
  
  const selectedProfileId = worldsProfileSelect ? worldsProfileSelect.value : activeProfileId;
  
  try {
    if (window.api) {
      currentWorldsData = await window.api.getWorlds(selectedProfileId);
    } else {
      // Mock worlds data for test sandbox
      currentWorldsData = [
        {
          folderName: 'Survival_Kingdom',
          worldName: 'Survival Kingdom',
          gameMode: 'Survival',
          lastPlayed: Date.now() - 3600000 * 2, // 2 hours ago
          versionName: '1.20.1',
          sizeBytes: 154200000,
          icon: null
        },
        {
          folderName: 'Pramochak_SMP',
          worldName: 'Pramochak SMP',
          gameMode: 'Survival',
          lastPlayed: Date.now() - 3600000 * 24 * 3, // 3 days ago
          versionName: '1.20.1',
          sizeBytes: 852000000,
          icon: null
        },
        {
          folderName: 'Creative_World',
          worldName: 'Creative World',
          gameMode: 'Creative',
          lastPlayed: Date.now() - 3600000 * 24 * 10, // 10 days ago
          versionName: '1.20.1',
          sizeBytes: 45200000,
          icon: null
        }
      ];
    }
    
    renderWorlds(currentWorldsData);
  } catch (err) {
    console.error('Error loading worlds list:', err);
    if (worldsEmptyState) worldsEmptyState.style.display = 'flex';
  }
}

// Format relative played time
function formatRelativeTime(epochMs) {
  const diff = Date.now() - epochMs;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days} days ago`;
    return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

// Render filtered worlds cards
function renderWorlds(worlds) {
  if (!worldsGrid) return;
  worldsGrid.innerHTML = '';
  
  const searchQuery = worldsSearchInput ? worldsSearchInput.value.toLowerCase().trim() : '';
  const filtered = worlds.filter(w => w.worldName.toLowerCase().includes(searchQuery) || w.folderName.toLowerCase().includes(searchQuery));
  
  if (filtered.length === 0) {
    if (worldsEmptyState) worldsEmptyState.style.display = 'flex';
    return;
  }
  
  if (worldsEmptyState) worldsEmptyState.style.display = 'none';
  
  filtered.forEach(world => {
    const card = document.createElement('div');
    card.className = 'world-card';
    
    let sizeText = 'Unknown Size';
    if (world.sizeBytes > 0) {
      const mb = world.sizeBytes / (1024 * 1024);
      if (mb < 1) {
        sizeText = `${(world.sizeBytes / 1024).toFixed(1)} KB`;
      } else {
        sizeText = `${mb.toFixed(1)} MB`;
      }
    }
    
    const relativeTime = formatRelativeTime(world.lastPlayed);
    const modeClass = world.gameMode.toLowerCase();
    
    let imgHtml = '';
    if (world.icon) {
      imgHtml = `<div class="world-card-image" style="background-image: url('${world.icon}');"></div>`;
    } else {
      imgHtml = `
        <div class="world-card-image-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="21" y1="12" x2="3" y2="12"/>
            <line x1="12" y1="3" x2="12" y2="21"/>
          </svg>
        </div>
      `;
    }
    
    const worldImgSrc = world.screenshot || world.icon;
    card.innerHTML = `
      <div class="world-card-banner">
        ${worldImgSrc ? `<img src="${worldImgSrc}" class="world-card-thumb-img" alt="${world.worldName}" loading="lazy" decoding="async">` : `<div class="world-card-scenic-bg"><span class="world-card-fallback-cube">🌍</span></div>`}
        <div class="world-card-badges-row">
          <span class="world-badge-version">🏷️ ${world.versionName || '1.20.1'}</span>
          <span class="world-badge-mode ${modeClass}">${world.gameMode}</span>
        </div>
      </div>
      <div class="world-card-body">
        <h4 class="world-card-name" title="${world.worldName}">${world.worldName}</h4>
        <div class="world-card-meta-row">
          <span class="world-meta-item">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
            <span>${relativeTime}</span>
          </span>
          <span class="world-meta-item">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
            <span>${sizeText}</span>
          </span>
        </div>
        <div class="world-card-actions-row">
          <button class="btn-world-play" title="Launch World">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <span>Play</span>
          </button>
          <div class="world-icon-btn-group">
            <button class="btn-world-icon folder" title="Open World Folder">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </button>
            <button class="btn-world-icon backup" title="Backup World (.zip)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            </button>
            <button class="btn-world-icon delete" title="Delete World">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    
    card.querySelector('.btn-world-play').addEventListener('click', (e) => {
      e.stopPropagation();
      quickLaunchWorld(world.folderName);
    });
    
    card.querySelector('.btn-world-icon.folder').addEventListener('click', (e) => {
      e.stopPropagation();
      openWorldFolder(world.folderName);
    });
    
    card.querySelector('.btn-world-icon.backup').addEventListener('click', (e) => {
      e.stopPropagation();
      backupWorldSave(world.folderName, world.worldName);
    });
    
    card.querySelector('.btn-world-icon.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWorldSave(world.folderName, world.worldName);
    });
    
    worldsGrid.appendChild(card);
  });
}

// Quick Launch directly into a specific singleplayer world
function quickLaunchWorld(folderName, profileId) {
  const selectedProfileId = profileId || (worldsProfileSelect ? worldsProfileSelect.value : activeProfileId);
  setActiveProfile(selectedProfileId);
  
  const profile = userProfiles.find(p => p.id === activeProfileId);
  if (!profile) return;
  
  const user = usernameInput.value.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  if (!usernameRegex.test(user)) {
    alert("Please set a valid username in Settings first (3-16 chars, alphanumeric or underscores).");
    document.getElementById('nav-settings').click();
    return;
  }
  
  progressConsole.innerHTML = '';
  progressBarFill.style.width = '0%';
  currentPercentage = 0;
  progressText.textContent = `Quick Launching directly into ${folderName}...`;
  progressSubtext.textContent = "Loading singleplayer instance...";
  progressOverlay.style.display = 'flex';
  
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }
  
  appendLog(`Establishing safe handshake for direct Singleplayer play...`);
  
  const launchRam = profile.ram || ramSlider.value;
  const launchJavaPath = (profile.javaPath && profile.javaPath.trim() !== '') ? profile.javaPath : javaPathInput.value;
  
  const options = {
    username: user,
    profileId: profile.id,
    version: resolvedVersion,
    ram: launchRam,
    javaPath: launchJavaPath,
    modloader: profile.modloader,
    modloaderVersion: profile.modloaderVersion || '',
    resolution: {
      w: resWidthInput.value,
      h: resHeightInput.value
    },
    quickPlaySingleplayer: folderName // command arg
  };
  
  lastLaunchOptions = options;
  if (window.api) {
    window.api.launchGame(options);
  } else {
    mockProcessLaunch();
  }
}

// Open world folder in OS file manager
function openWorldFolder(folderName) {
  const selectedProfileId = worldsProfileSelect ? worldsProfileSelect.value : activeProfileId;
  if (window.api) {
    window.api.openWorldFolder(selectedProfileId, folderName);
  } else {
    alert(`Mock sandbox: Opening world directory ${folderName} for profile ${selectedProfileId}`);
  }
}

// Backup world folder into a zip archive
async function backupWorldSave(folderName, worldName) {
  const selectedProfileId = worldsProfileSelect ? worldsProfileSelect.value : activeProfileId;
  appendLog(`Initiating backup archive for world: ${worldName}...`);
  
  if (window.api) {
    const btnBackup = document.activeElement;
    if (btnBackup) btnBackup.disabled = true;
    
    const result = await window.api.backupWorld(selectedProfileId, folderName, worldName);
    
    if (btnBackup) btnBackup.disabled = false;
    
    if (result && result.success) {
      alert(`Backup created successfully!\nFile: ${result.backupPath}`);
      appendLog(`Successfully archived backup for world ${worldName}.`, 'success');
    } else {
      alert(`Backup failed: ${result.error || 'Unknown error'}`);
      appendLog(`Failed to backup world ${worldName}: ${result.error}`, 'error');
    }
  } else {
    alert(`Mock sandbox backup created for: ${worldName}`);
  }
}

// Delete world folder from disk
async function deleteWorldSave(folderName, worldName) {
  if (confirm(`ARE YOU SURE you want to delete the world "${worldName}"?\nThis will permanently delete it from disk and cannot be undone!`)) {
    const selectedProfileId = worldsProfileSelect ? worldsProfileSelect.value : activeProfileId;
    appendLog(`Deleting world save directory: ${folderName}...`);
    
    if (window.api) {
      const result = await window.api.deleteWorld(selectedProfileId, folderName);
      currentWorldsData = currentWorldsData.filter(w => w.folderName !== folderName);
      renderWorlds(currentWorldsData);
      appendLog(`Mock sandbox: Deleted world ${worldName}.`, 'success');
    }
  }
}

// --- RESOURCE PACKS MANAGER FRONTEND IMPLEMENTATION ---

// DOM Elements
const resourcesSearchInput = document.getElementById('resources-search-input');
const resourcesProfileSelect = document.getElementById('resources-profile-select');
const btnOpenResourcesFolder = document.getElementById('btn-open-resources-folder');
const btnImportResourcePack = document.getElementById('btn-import-resourcepack');
const btnResourcesSearch = document.getElementById('btn-resources-search');
const tabResourcesSearch = document.getElementById('tab-resources-search');
const tabResourcesInstalled = document.getElementById('tab-resources-installed');
const pageResourcesSearch = document.getElementById('page-resources-search');
const pageResourcesInstalled = document.getElementById('page-resources-installed');
const resourcesSearchList = document.getElementById('resources-search-list');
const resourcesInstalledList = document.getElementById('resources-installed-list');
const installedResourcesCount = document.getElementById('installed-resources-count');

let currentResourcesInstalled = [];
let currentResourcesOnline = [];
let resourcesInitialized = false;

// Initialize Resources Screen
function initResourcesScreen() {
  populateResourcesProfileSelect();
  loadInstalledPacksList();
  searchModrinthPacks("");
  
  if (!resourcesInitialized) {
    resourcesInitialized = true;
    
    // Bind search typing filter or button
    if (btnResourcesSearch) {
      btnResourcesSearch.addEventListener('click', () => {
        const query = resourcesSearchInput ? resourcesSearchInput.value.trim() : '';
        searchModrinthPacks(query);
      });
    }
    if (resourcesSearchInput) {
      resourcesSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const query = resourcesSearchInput.value.trim();
          searchModrinthPacks(query);
        }
      });
    }
    
    // Bind profile switch event
    if (resourcesProfileSelect) {
      resourcesProfileSelect.addEventListener('change', () => {
        loadInstalledPacksList();
        searchModrinthPacks("");
      });
    }
    
    // Bind open folder
    if (btnOpenResourcesFolder) {
      btnOpenResourcesFolder.addEventListener('click', () => {
        const selectedProfileId = resourcesProfileSelect ? resourcesProfileSelect.value : activeProfileId;
        if (window.api) {
          window.api.openResourcePacksFolder(selectedProfileId);
        } else {
          alert(`Mock open folder for: ${selectedProfileId}`);
        }
      });
    }
    
    // Bind local import dialog
    if (btnImportResourcePack) {
      btnImportResourcePack.addEventListener('click', async () => {
        const selectedProfileId = resourcesProfileSelect ? resourcesProfileSelect.value : activeProfileId;
        if (window.api) {
          const result = await window.api.importResourcePack(selectedProfileId);
          if (result && result.success) {
            alert(`Resource pack imported successfully!\nAdded: ${result.filename}`);
            loadInstalledPacksList();
          } else if (result && result.error !== 'Cancelled') {
            alert(`Import failed: ${result.error}`);
          }
        } else {
          alert("Mock import dialog complete.");
        }
      });
    }
    
    // Tab switching
    if (tabResourcesSearch && tabResourcesInstalled) {
      tabResourcesSearch.addEventListener('click', () => {
        tabResourcesSearch.classList.add('active');
        tabResourcesInstalled.classList.remove('active');
        if (pageResourcesSearch) pageResourcesSearch.style.display = 'flex';
        if (pageResourcesInstalled) pageResourcesInstalled.style.display = 'none';
      });
      
      tabResourcesInstalled.addEventListener('click', () => {
        tabResourcesInstalled.classList.add('active');
        tabResourcesSearch.classList.remove('active');
        if (pageResourcesInstalled) pageResourcesInstalled.style.display = 'flex';
        if (pageResourcesSearch) pageResourcesSearch.style.display = 'none';
        loadInstalledPacksList();
      });
    }
  }
}

// Populate Profile select inside Resource Packs Manager
function populateResourcesProfileSelect() {
  if (!resourcesProfileSelect) return;
  resourcesProfileSelect.innerHTML = userProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  resourcesProfileSelect.value = activeProfileId;
}

// Intercept original populateProfileSelectors to keep resources select synced
const originalPopulateProfileSelectorsForResources = populateProfileSelectors;
populateProfileSelectors = function() {
  originalPopulateProfileSelectorsForResources();
  populateResourcesProfileSelect();
};

// Search resource packs on Modrinth API
async function searchModrinthPacks(query) {
  if (!resourcesProfileSelect) return;
  const profile = userProfiles.find(p => p.id === resourcesProfileSelect.value);
  if (!profile) return;
  
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }
  
  if (resourcesSearchList) {
    resourcesSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #fff; padding: 40px 0; font-size: 0.9rem;">Searching Modrinth for packs...</div>`;
  }
  
  try {
    let url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&project_type=resourcepack`;
    
    const facets = [];
    facets.push(`["versions:${resolvedVersion}"]`);
    facets.push('["project_type:resourcepack"]');
    
    url += `&facets=${encodeURIComponent(`[${facets.join(',')}]`)}`;
    console.log('[MODRINTH PACK SEARCH] Querying:', url);
    
    const res = await fetch(url, { headers: { 'User-Agent': 'Pramochak-MC-Launcher/2.0.0 (antigravity)' } });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    
    renderResourcesSearchResults(data.hits || []);
  } catch (err) {
    console.error('Error fetching resource packs from Modrinth:', err);
    if (resourcesSearchList) {
      resourcesSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #fc8181; padding: 40px 0; font-size: 0.9rem;">Failed to fetch resource packs. Check your network.<br>${err.message}</div>`;
    }
  }
}

// Render online search results
function renderResourcesSearchResults(hits) {
  if (!resourcesSearchList) return;
  
  if (hits.length === 0) {
    resourcesSearchList.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.9rem;">No compatible resource packs found on Modrinth for this version.</div>`;
    return;
  }
  
  resourcesSearchList.innerHTML = '';
  const fragment = document.createDocumentFragment();

  hits.forEach(hit => {
    const card = document.createElement('div');
    card.className = 'resource-pack-card';
    
    const iconUrl = hit.icon_url || 'assets/minecraft_bg.png';
    const title = hit.title || 'Unknown Pack';
    const description = hit.description || 'No description provided.';
    const downloads = hit.downloads || 0;
    const projectId = hit.project_id;
    
    let formattedDownloads = downloads >= 1000000 ? `${(downloads / 1000000).toFixed(1)}M` : (downloads >= 1000 ? `${(downloads / 1000).toFixed(0)}k` : downloads);
    
    let imgHtml = '';
    if (hit.icon_url) {
      imgHtml = `<img src="${iconUrl}" class="resource-pack-icon" loading="lazy" decoding="async" onerror="this.src='assets/steve_avatar.png';">`;
    } else {
      imgHtml = `
        <div class="resource-pack-icon-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
        </div>
      `;
    }
    
    card.innerHTML = `
      <div class="resource-pack-header">
        ${imgHtml}
        <div class="resource-pack-meta">
          <span class="resource-pack-title" title="${title}">${title}</span>
          <span class="resource-pack-compat-tag">Modrinth Certified</span>
        </div>
      </div>
      <div class="resource-pack-description" title="${description}">${description}</div>
      <div class="resource-pack-footer">
        <div class="resource-pack-stats">
          <span class="resource-pack-stat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;margin-right:2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>${formattedDownloads} downloads</span>
          </span>
        </div>
        <button class="btn-resource-pack-action install-btn" data-id="${projectId}">Install</button>
      </div>
    `;
    
    card.querySelector('.install-btn').addEventListener('click', (e) => {
      const btn = e.target;
      installResourcePack(projectId, title, btn);
    });
    
    fragment.appendChild(card);
  });

  resourcesSearchList.appendChild(fragment);
}

// Download resource pack logic
async function installResourcePack(projectId, packTitle, btnElement) {
  if (!resourcesProfileSelect) return;
  const profileId = resourcesProfileSelect.value;
  const profile = userProfiles.find(p => p.id === profileId);
  if (!profile) return;
  
  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }
  
  btnElement.disabled = true;
  btnElement.textContent = "Downloading...";
  appendLog(`Querying files for resource pack "${packTitle}" from Modrinth...`);
  
  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`, { headers: { 'User-Agent': 'Pramochak-MC-Launcher/2.0.0' } });
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    const versions = await res.json();
    
    const compatible = versions.find(v => v.game_versions.includes(resolvedVersion));
    const versionToUse = compatible || versions[0];
    
    if (!versionToUse || !versionToUse.files || versionToUse.files.length === 0) {
      throw new Error("No files found for this project.");
    }
    
    const file = versionToUse.files[0];
    const fileUrl = file.url;
    const filename = file.filename;
    
    appendLog(`Downloading pack archive ${filename} into active resourcepacks folder...`);
    
    if (window.api) {
      const downloadResult = await window.api.downloadResourcePack(profileId, fileUrl, filename);
      if (downloadResult && downloadResult.success) {
        btnElement.textContent = "Installed";
        btnElement.style.background = "#2f855a";
        appendLog(`Successfully installed resource pack: ${packTitle}`, "success");
      } else {
        throw new Error(downloadResult.error || "Unknown download error");
      }
    } else {
      btnElement.textContent = "Installed";
      appendLog(`Mock sandbox download complete for: ${packTitle}`, "success");
    }
  } catch (err) {
    console.error('Resource pack installation failed:', err);
    btnElement.disabled = false;
    btnElement.textContent = "Install";
    alert(`Installation failed: ${err.message}`);
    appendLog(`Resource pack "${packTitle}" installation failed: ${err.message}`, "error");
  }
}

// Load local resource packs list
async function loadInstalledPacksList() {
  if (!resourcesInstalledList) return;
  resourcesInstalledList.innerHTML = '';
  
  const selectedProfileId = resourcesProfileSelect ? resourcesProfileSelect.value : activeProfileId;
  
  function getFriendlyFormatVersion(formatNum) {
    const versions = {
      1: "Minecraft 1.6 - 1.8.9",
      2: "Minecraft 1.9 - 1.10.2",
      3: "Minecraft 1.11 - 1.12.2",
      4: "Minecraft 1.13 - 1.14.4",
      5: "Minecraft 1.15 - 1.16.1",
      6: "Minecraft 1.16.2 - 1.16.5",
      7: "Minecraft 1.17.x",
      8: "Minecraft 1.18 - 1.18.1",
      9: "Minecraft 1.18.2",
      12: "Minecraft 1.19.x",
      15: "Minecraft 1.20 - 1.20.1",
      18: "Minecraft 1.20.2",
      22: "Minecraft 1.20.3 - 1.20.4",
      34: "Minecraft 1.21 - 1.21.1",
      46: "Minecraft 1.21.2 - 1.21.3",
      48: "Minecraft 1.21.4"
    };
    return versions[formatNum] || `Minecraft Format ${formatNum}`;
  }
  
  try {
    if (window.api) {
      currentResourcesInstalled = await window.api.getInstalledResourcePacks(selectedProfileId);
    } else {
      currentResourcesInstalled = [
        {
          filename: 'faithful-64x.zip',
          packName: 'Faithful 64x',
          description: 'A higher-resolution texture pack maintaining original Minecraft look.',
          packFormat: 15,
          icon: null,
          sizeBytes: 42500000,
          isFolder: false
        }
      ];
    }
    
    if (installedResourcesCount) {
      installedResourcesCount.textContent = currentResourcesInstalled.length;
    }
    
    if (currentResourcesInstalled.length === 0) {
      resourcesInstalledList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 40px 0; font-size: 0.95rem;">
          No resource packs installed in this profile. <br>
          Import a local pack (.zip) or go to the "Browse Modrinth" tab to download!
        </div>
      `;
      return;
    }
    
    currentResourcesInstalled.forEach(pack => {
      const card = document.createElement('div');
      card.className = 'installation-card';
      
      let sizeText = 'Unknown Size';
      if (pack.sizeBytes > 0) {
        const mb = pack.sizeBytes / (1024 * 1024);
        sizeText = mb < 1 ? `${(pack.sizeBytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
      }
      
      const friendlyVer = getFriendlyFormatVersion(pack.packFormat);
      
      let imgHtml = '';
      if (pack.icon) {
        imgHtml = `<img src="${pack.icon}" class="resource-pack-icon" onerror="this.src='assets/steve_avatar.png';">`;
      } else {
        imgHtml = `
          <div class="resource-pack-icon-fallback" style="width:36px;height:36px;border-radius:6px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
        `;
      }
      
      card.innerHTML = `
        <div class="installation-card-left">
          ${imgHtml}
          <div class="installation-card-info" style="margin-left: 10px;">
            <span class="installation-card-name" style="font-size:0.9rem;font-weight:700;">${pack.packName}</span>
            <div class="installation-card-meta">
              <span>${friendlyVer}</span>
              <span class="loader-badge" style="background: rgba(255,255,255,0.05); color: #a0aec0; border: none; font-size:0.65rem;">ZIP</span>
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: block; line-height:1.4;">${pack.description}</span>
          </div>
        </div>
        <div class="installation-card-actions">
          <span style="font-size:0.75rem; color: var(--text-muted); font-weight:600; margin-right:12px;">Size: ${sizeText}</span>
          <button class="btn-resource-pack-action delete" data-file="${pack.filename}">Delete</button>
        </div>
      `;
      
      card.querySelector('.delete').addEventListener('click', (e) => {
        deleteResourcePack(pack.filename);
      });
      
      resourcesInstalledList.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading installed resource packs list:', err);
    if (resourcesInstalledList) {
      resourcesInstalledList.innerHTML = `<div style="text-align: center; color: #fc8181; padding: 40px 0; font-size: 0.95rem;">Failed to load installed resource packs.</div>`;
    }
  }
}

// Delete custom resource pack save
async function deleteResourcePack(filename) {
  if (confirm(`Are you sure you want to delete the resource pack "${filename}"?\nThis will permanently delete it from disk!`)) {
    const selectedProfileId = resourcesProfileSelect ? resourcesProfileSelect.value : activeProfileId;
    appendLog(`Deleting resource pack: ${filename}...`);
    
    if (window.api) {
      const result = await window.api.deleteResourcePack(selectedProfileId, filename);
      if (result && result.success) {
        appendLog(`Resource pack "${filename}" deleted successfully.`, "success");
        loadInstalledPacksList();
      } else {
        alert(`Deletion failed: ${result.error}`);
        appendLog(`Failed to delete resource pack: ${result.error}`, "error");
      }
    } else {
      currentResourcesInstalled = currentResourcesInstalled.filter(p => p.filename !== filename);
      loadInstalledPacksList();
      appendLog(`Mock deleted pack: ${filename}`, "success");
    }
  }
}

// --- SERVERS MANAGER FRONTEND LOGIC ---

let activeConsoleServer = null;
let serversInitialized = false;

// DOM Elements
const tabServersMultiplayer = document.getElementById('tab-servers-multiplayer');
const tabServersLocal = document.getElementById('tab-servers-local');
const pageServersMultiplayer = document.getElementById('page-servers-multiplayer');
const pageServersLocal = document.getElementById('page-servers-local');
const serversProfileSelect = document.getElementById('servers-profile-select');
const btnAddServer = document.getElementById('btn-add-server');
const multiplayerServersList = document.getElementById('multiplayer-servers-list');
const btnCreateLocalServer = document.getElementById('btn-create-local-server');
const localServersGrid = document.getElementById('local-servers-grid');

// Console DOM
const localServerConsolePanel = document.getElementById('local-server-console-panel');
const consoleStatusDot = document.getElementById('console-status-dot');
const consoleServerTitle = document.getElementById('console-server-title');
const consoleServerMeta = document.getElementById('console-server-meta');
const btnConsoleClear = document.getElementById('btn-console-clear');
const serverConsoleLogs = document.getElementById('server-console-logs');
const serverConsoleInput = document.getElementById('server-console-input');
const btnSendServerCommand = document.getElementById('btn-send-server-command');

// Modals DOM
const addServerDialogOverlay = document.getElementById('add-server-dialog-overlay');
const addServerDialogTitle = document.getElementById('add-server-dialog-title');
const inputAddServerName = document.getElementById('input-add-server-name');
const inputAddServerIp = document.getElementById('input-add-server-ip');
const btnCloseAddServer = document.getElementById('btn-close-add-server');
const btnApplyAddServer = document.getElementById('btn-apply-add-server');

const createServerDialogOverlay = document.getElementById('create-server-dialog-overlay');
const inputCreateServerName = document.getElementById('input-create-server-name');
const selectCreateServerSoftware = document.getElementById('select-create-server-software');
const selectCreateServerVersion = document.getElementById('select-create-server-version');
const inputCreateServerPort = document.getElementById('input-create-server-port');
const selectCreateServerRam = document.getElementById('select-create-server-ram');
const btnCloseCreateServer = document.getElementById('btn-close-create-server');
const btnApplyCreateServer = document.getElementById('btn-apply-create-server');

let editingServerIndex = -1; // -1 for adding, positive index for editing

function playActiveProfileWithServer(ip) {
  const profile = userProfiles.find(p => p.id === activeProfileId);
  if (!profile) {
    alert("No active launch profile selected.");
    return;
  }
  
  const user = usernameInput.value.trim();
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  
  if (!usernameRegex.test(user)) {
    alert("Please set a valid username in Settings first (3-16 chars, alphanumeric or underscores).");
    document.getElementById('nav-settings').click();
    return;
  }

  progressConsole.innerHTML = '';
  progressBarFill.style.width = '0%';
  currentPercentage = 0;
  progressText.textContent = "Initiating safe launch pipeline...";
  progressSubtext.textContent = "Initializing secure downloader...";
  progressOverlay.style.display = 'flex';

  let resolvedVersion = profile.version;
  if (profile.version === 'latest-release') {
    resolvedVersion = allMcVersions.latest.release || '1.21.4';
  } else if (profile.version === 'latest-snapshot') {
    resolvedVersion = allMcVersions.latest.snapshot || '1.21.5-pre1';
  }

  appendLog(`Establishing safe connection to ${ip} via ${resolvedVersion} as ${user}...`);

  const launchRam = profile.ram || ramSlider.value;
  const launchJavaPath = (profile.javaPath && profile.javaPath.trim() !== '') ? profile.javaPath : javaPathInput.value;

  const options = {
    username: user,
    profileId: profile.id,
    version: resolvedVersion,
    ram: launchRam,
    javaPath: launchJavaPath,
    modloader: profile.modloader,
    modloaderVersion: profile.modloaderVersion || '',
    resolution: {
      w: resWidthInput.value,
      h: resHeightInput.value
    },
    quickConnectServer: ip
  };

  lastLaunchOptions = options;

  if (window.api) {
    window.api.launchGame(options);
  } else {
    mockProcessLaunch();
  }
}

function initServersScreen() {
  populateServersProfileSelect();
  loadMultiplayerList();
  loadLocalServersList();
  
  if (!serversInitialized) {
    serversInitialized = true;
    
    // Tab switching
    if (tabServersMultiplayer && tabServersLocal) {
      tabServersMultiplayer.addEventListener('click', () => {
        tabServersMultiplayer.classList.add('active');
        tabServersLocal.classList.remove('active');
        if (pageServersMultiplayer) pageServersMultiplayer.style.display = 'flex';
        if (pageServersLocal) pageServersLocal.style.display = 'none';
      });
      
      tabServersLocal.addEventListener('click', () => {
        tabServersLocal.classList.add('active');
        tabServersMultiplayer.classList.remove('active');
        if (pageServersLocal) pageServersLocal.style.display = 'flex';
        if (pageServersMultiplayer) pageServersMultiplayer.style.display = 'none';
        loadLocalServersList();
      });
    }

    // Profile selector change
    if (serversProfileSelect) {
      serversProfileSelect.addEventListener('change', () => {
        loadMultiplayerList();
      });
    }

    // Add Server Modal triggers
    if (btnAddServer) {
      btnAddServer.addEventListener('click', () => {
        editingServerIndex = -1;
        if (addServerDialogTitle) addServerDialogTitle.textContent = "Add Server";
        if (inputAddServerName) inputAddServerName.value = "";
        if (inputAddServerIp) inputAddServerIp.value = "";
        if (addServerDialogOverlay) openModalWithMotion(addServerDialogOverlay);
      });
    }

    if (btnCloseAddServer) {
      btnCloseAddServer.addEventListener('click', () => {
        if (addServerDialogOverlay) closeModalWithMotion(addServerDialogOverlay);
      });
    }

    if (addServerDialogOverlay) {
      addServerDialogOverlay.addEventListener('click', (e) => {
        if (e.target === addServerDialogOverlay) {
          closeModalWithMotion(addServerDialogOverlay);
        }
      });
    }

    if (btnApplyAddServer) {
      btnApplyAddServer.addEventListener('click', async () => {
        const name = inputAddServerName ? inputAddServerName.value.trim() : '';
        const ip = inputAddServerIp ? inputAddServerIp.value.trim() : '';
        
        if (!name || !ip) {
          alert("Please fill in both Name and IP Address.");
          return;
        }

        const selectedProfileId = serversProfileSelect ? serversProfileSelect.value : activeProfileId;
        
        if (window.api) {
          // Fetch existing servers list
          const list = await window.api.getServers(selectedProfileId);
          if (editingServerIndex === -1) {
            list.push({ name, ip });
          } else {
            list[editingServerIndex] = { name, ip };
          }
          const res = await window.api.saveServers(selectedProfileId, list);
          if (res && res.success) {
            if (addServerDialogOverlay) closeModalWithMotion(addServerDialogOverlay);
            loadMultiplayerList();
          } else {
            alert(`Failed to save server: ${res.error}`);
          }
        } else {
          alert("Sandbox save completed.");
          if (addServerDialogOverlay) closeModalWithMotion(addServerDialogOverlay);
        }
      });
    }

    // Create Local Server Modal triggers
    if (btnCreateLocalServer) {
      btnCreateLocalServer.addEventListener('click', () => {
        if (inputCreateServerName) inputCreateServerName.value = "";
        if (inputCreateServerPort) inputCreateServerPort.value = "25565";
        
        // Populate versions selector with available releases
        if (selectCreateServerVersion) {
          selectCreateServerVersion.innerHTML = allMcVersions.releases.map(v => `<option value="${v}">${v}</option>`).join('');
          // Select current active profile version as default
          const profile = userProfiles.find(p => p.id === activeProfileId);
          if (profile) {
            let defVer = profile.version;
            if (defVer === 'latest-release') defVer = allMcVersions.latest.release || '1.21.4';
            if (defVer === 'latest-snapshot') defVer = allMcVersions.latest.snapshot || '1.21.5-pre1';
            
            // Check if version is valid & exists in the list
            const hasOption = allMcVersions.releases.includes(defVer) || allMcVersions.snapshots.includes(defVer);
            if (hasOption) {
              selectCreateServerVersion.value = defVer;
            } else {
              selectCreateServerVersion.value = allMcVersions.latest.release || allMcVersions.releases[0] || '1.21.4';
            }
          }
        }
        
        if (createServerDialogOverlay) openModalWithMotion(createServerDialogOverlay);
      });
    }

    if (btnCloseCreateServer) {
      btnCloseCreateServer.addEventListener('click', () => {
        if (createServerDialogOverlay) closeModalWithMotion(createServerDialogOverlay);
      });
    }

    if (createServerDialogOverlay) {
      createServerDialogOverlay.addEventListener('click', (e) => {
        if (e.target === createServerDialogOverlay) {
          closeModalWithMotion(createServerDialogOverlay);
        }
      });
    }

    if (btnApplyCreateServer) {
      btnApplyCreateServer.addEventListener('click', async () => {
        const name = inputCreateServerName ? inputCreateServerName.value.trim() : '';
        const software = selectCreateServerSoftware ? selectCreateServerSoftware.value : 'PaperMC';
        const version = selectCreateServerVersion ? selectCreateServerVersion.value : '1.21.4';
        const port = inputCreateServerPort ? parseInt(inputCreateServerPort.value) : 25565;
        const ram = selectCreateServerRam ? parseInt(selectCreateServerRam.value) : 2048;

        if (!name) {
          alert("Please specify a server name.");
          return;
        }

        if (port < 1 || port > 65535) {
          alert("Invalid port number. Use a value between 1 and 65535.");
          return;
        }

        if (createServerDialogOverlay) closeModalWithMotion(createServerDialogOverlay);
        
        // Open local server console drawer
        activeConsoleServer = name;
        if (consoleServerTitle) consoleServerTitle.textContent = `Creating ${name}...`;
        if (consoleServerMeta) consoleServerMeta.textContent = `${software} ${version}`;
        if (serverConsoleLogs) serverConsoleLogs.innerHTML = "";
        if (localServerConsolePanel) localServerConsolePanel.style.display = 'flex';

        if (window.api) {
          const res = await window.api.createLocalServer({ name, version, software, port, ram, profileId: activeProfileId });
          if (res && res.success) {
            alert(`Server "${res.name}" created successfully!\nClick 'Start' to launch it.`);
            loadLocalServersList();
            loadMultiplayerList();
          } else {
            alert(`Creation failed: ${res.error}`);
            if (localServerConsolePanel) localServerConsolePanel.style.display = 'none';
          }
        } else {
          alert("Sandbox local server creation simulation completed.");
        }
      });
    }

    // Console Command Send
    if (btnSendServerCommand && serverConsoleInput) {
      const sendInputCmd = async () => {
        const cmd = serverConsoleInput.value.trim();
        if (!cmd || !activeConsoleServer) return;
        
        serverConsoleInput.value = "";
        appendServerConsoleLog(activeConsoleServer, `> ${cmd}`);

        if (window.api) {
          const res = await window.api.sendServerCommand(activeConsoleServer, cmd);
          if (res && !res.success) {
            appendServerConsoleLog(activeConsoleServer, `[LAUNCHER ERROR] Command failed: ${res.error}`);
          }
        }
      };
      
      btnSendServerCommand.addEventListener('click', sendInputCmd);
      serverConsoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendInputCmd();
      });
    }

    // Clear Console
    if (btnConsoleClear && serverConsoleLogs) {
      btnConsoleClear.addEventListener('click', () => {
        serverConsoleLogs.innerHTML = "";
      });
    }

    // IPC Log listeners
    if (window.api) {
      window.api.onServerLog((data) => {
        appendServerConsoleLog(data.name, data.text);
      });

      window.api.onServerStatus((data) => {
        // data is { name: "...", status: "Stopped/Running" }
        loadLocalServersList();
        if (activeConsoleServer === data.name) {
          updateConsoleHeaderState(data.status);
        }
      });
    }
  }
}

// Helper to escape HTML safely in visual terminal console
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appendServerConsoleLog(name, text) {
  if (activeConsoleServer !== name || !serverConsoleLogs) return;

  const escaped = escapeHtml(text);
  const lines = escaped.split('\n');
  lines.forEach(line => {
    if (!line.trim()) return;
    const lineDiv = document.createElement('div');
    lineDiv.style.marginBottom = '2px';
    lineDiv.style.whiteSpace = 'pre-wrap';
    lineDiv.style.fontFamily = 'monospace';
    lineDiv.innerHTML = line;
    
    // Console syntax highlights
    if (line.startsWith('&gt;') || line.startsWith('>')) {
      lineDiv.style.color = '#38b2ac'; // Cyan input echo
      lineDiv.style.fontWeight = 'bold';
    } else if (line.includes('[INFO]') || line.includes('/INFO]')) {
      lineDiv.style.color = '#e2e8f0';
    } else if (line.includes('[WARN]') || line.includes('[WARNING]') || line.includes('/WARN]')) {
      lineDiv.style.color = '#ecc94b'; // Yellow
    } else if (line.includes('[ERROR]') || line.includes('[FATAL]') || line.includes('/ERROR]')) {
      lineDiv.style.color = '#f56565'; // Red
    } else if (line.includes('[LAUNCHER]')) {
      lineDiv.style.color = '#4fd1c5'; // Cyan
    }
    
    serverConsoleLogs.appendChild(lineDiv);
  });

  serverConsoleLogs.scrollTop = serverConsoleLogs.scrollHeight;
}

function updateConsoleHeaderState(status) {
  if (!consoleStatusDot) return;
  if (status === 'Running') {
    consoleStatusDot.className = "pulse-dot green";
  } else {
    consoleStatusDot.className = "pulse-dot red";
  }
}

// Sync profile selectors inside Server list screen
function populateServersProfileSelect() {
  if (!serversProfileSelect) return;
  serversProfileSelect.innerHTML = userProfiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  serversProfileSelect.value = activeProfileId;
}

// Intercept original populateProfileSelectors to keep servers select synced
const originalPopulateProfileSelectorsForServers = populateProfileSelectors;
populateProfileSelectors = function() {
  originalPopulateProfileSelectorsForServers();
  populateServersProfileSelect();
};

// Load Multiplayer servers from servers.dat
async function loadMultiplayerList() {
  if (!multiplayerServersList) return;
  multiplayerServersList.innerHTML = '';
  
  const selectedProfileId = serversProfileSelect ? serversProfileSelect.value : activeProfileId;
  
  try {
    let servers = [];
    if (window.api) {
      servers = await window.api.getServers(selectedProfileId);
    } else {
      servers = [
        { name: 'Hypixel Network', ip: 'mc.hypixel.net' },
        { name: 'ManaCube', ip: 'play.manacube.com' }
      ];
    }

    if (servers.length === 0) {
      multiplayerServersList.innerHTML = `
        <div style="grid-column: span 2; text-align: center; color: rgba(255, 255, 255, 0.65); padding: 40px 0; font-size: 0.9rem;">
          No multiplayer servers found in this profile. <br>
          Click "Add Server" to save one!
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    servers.forEach((server, index) => {
      const card = document.createElement('div');
      card.className = 'server-card';
      card.id = `multiplayer-server-${index}`;
      
      card.innerHTML = `
        <div class="server-card-top">
          <div class="server-icon-wrap" id="server-icon-${index}">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 14h16v-2H4v2zm0 4h16v-2H4v2zM4 6v4h16V6H4z"/></svg>
          </div>
          <div class="server-info-col">
            <div class="server-title-row">
              <span class="server-name" title="${server.name}">${server.name}</span>
              <span class="server-latency-badge" id="server-ping-${index}">Pinging...</span>
            </div>
            <div class="server-ip-row">
              <span class="server-ip-text">${server.ip}</span>
            </div>
          </div>
        </div>
        
        <div class="server-motd" id="server-motd-${index}">Resolving server stats...</div>
        
        <div class="server-card-footer">
          <div class="server-players-badge">
            <span class="pulse-dot gray" id="server-dot-${index}"></span>
            <span id="server-players-${index}" class="server-players-text">Offline</span>
          </div>
          <div class="server-actions">
            <button class="btn-server-sm edit" id="btn-edit-server-${index}" title="Edit Server">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/></svg>
              <span>Edit</span>
            </button>
            <button class="btn-server-sm delete" id="btn-delete-server-${index}" title="Delete Server">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
            <button class="btn-server-join" id="btn-play-server-${index}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span>Join</span>
            </button>
          </div>
        </div>
      `;

      // Bind Join button
      card.querySelector(`#btn-play-server-${index}`).addEventListener('click', () => {
        playActiveProfileWithServer(server.ip);
      });

      // Bind Edit button
      card.querySelector(`#btn-edit-server-${index}`).addEventListener('click', () => {
        editingServerIndex = index;
        if (addServerDialogTitle) addServerDialogTitle.textContent = "Edit Server";
        if (inputAddServerName) inputAddServerName.value = server.name;
        if (inputAddServerIp) inputAddServerIp.value = server.ip;
        if (addServerDialogOverlay) openModalWithMotion(addServerDialogOverlay);
      });

      // Bind Delete button
      card.querySelector(`#btn-delete-server-${index}`).addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete server "${server.name}"?`)) {
          if (window.api) {
            const list = await window.api.getServers(selectedProfileId);
            list.splice(index, 1);
            await window.api.saveServers(selectedProfileId, list);
            loadMultiplayerList();
          }
        }
      });

      fragment.appendChild(card);

      // Perform Async Ping in the background
      triggerBackgroundPing(server.ip, index);
    });

    multiplayerServersList.appendChild(fragment);

  } catch (err) {
    console.error('Failed to load multiplayer list:', err);
  }
}

async function triggerBackgroundPing(ip, index) {
  const pingBadge = document.getElementById(`server-ping-${index}`);
  const motdLabel = document.getElementById(`server-motd-${index}`);
  const statusDot = document.getElementById(`server-dot-${index}`);
  const playersLabel = document.getElementById(`server-players-${index}`);
  const iconWrapper = document.getElementById(`server-icon-${index}`);

  const parts = ip.split(':');
  const host = parts[0];
  const port = parseInt(parts[1]) || 25565;

  if (window.api) {
    try {
      const stats = await window.api.pingServer(host, port);
      if (stats && stats.online) {
        if (pingBadge) {
          pingBadge.textContent = `${stats.latency} ms`;
          pingBadge.style.background = "rgba(72,187,120,0.1)";
          pingBadge.style.color = "#48bb78";
        }
        if (motdLabel) {
          // MOTD sometimes returns object descriptions, try to get clean text
          let motdText = 'A Minecraft Server';
          if (stats.description) {
            motdText = typeof stats.description === 'string' ? stats.description : (stats.description.text || JSON.stringify(stats.description));
          }
          // Remove Minecraft color codes (§0 - §f) for clean UI
          motdLabel.textContent = motdText.replace(/§[0-9a-fk-or]/g, "");
        }
        if (statusDot) statusDot.className = "pulse-dot green";
        if (playersLabel) playersLabel.textContent = `${stats.players} / ${stats.maxPlayers} online`;
        
        // Render base64 favicon if present
        if (stats.favicon && iconWrapper) {
          iconWrapper.innerHTML = `<img src="${stats.favicon}" class="server-icon" onerror="this.outerHTML='<svg viewBox=\\'0 0 24 24\\' width=\\'20\\' height=\\'20\\' fill=\\'currentColor\\'><path d=\\'M4 14h16v-2H4v2zm0 4h16v-2H4v2zM4 6v4h16V6H4z\\'/></svg>';">`;
        }
      } else {
        setOfflineState();
      }
    } catch (e) {
      setOfflineState();
    }
  } else {
    // Mock sandbox state
    setTimeout(() => {
      if (pingBadge) pingBadge.textContent = "38 ms";
      if (motdLabel) motdLabel.textContent = "Welcome to our public lobby! Have fun!";
      if (statusDot) statusDot.className = "pulse-dot green";
      if (playersLabel) playersLabel.textContent = "1,248 / 10,000 online";
    }, 1000 + Math.random() * 1000);
  }

  function setOfflineState() {
    if (pingBadge) {
      pingBadge.textContent = "Offline";
      pingBadge.style.background = "rgba(229,62,62,0.1)";
      pingBadge.style.color = "#f56565";
    }
    if (motdLabel) motdLabel.textContent = "Can't connect to server. Check address or server status.";
    if (statusDot) statusDot.className = "pulse-dot red";
    if (playersLabel) playersLabel.textContent = "Offline";
  }
}

// Load Local server configurations
async function loadLocalServersList() {
  if (!localServersGrid) return;
  localServersGrid.innerHTML = '';

  try {
    let servers = [];
    if (window.api) {
      servers = await window.api.getLocalServers();
    } else {
      servers = [
        { name: 'Survival_Kingdom', port: 25565, software: 'PaperMC', version: '1.21.4', status: 'Stopped' }
      ];
    }

    if (servers.length === 0) {
      localServersGrid.innerHTML = `
        <div style="grid-column: span 2; text-align: center; color: rgba(255, 255, 255, 0.65); padding: 30px 0; font-size: 0.9rem;">
          No local server instances created yet.<br>
          Click "Create Local Server" to configure and download one!
        </div>
      `;
      return;
    }

    servers.forEach((server) => {
      const card = document.createElement('div');
      const isRunning = server.status === 'Running';
      card.className = `server-card local-server-card ${isRunning ? 'running' : ''}`;
      
      card.innerHTML = `
        <div class="server-card-header">
          <div class="server-icon-fallback" style="background: rgba(72,187,120,0.05); color: #48bb78; border-color: rgba(72,187,120,0.1);">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
          </div>
          <div class="server-meta">
            <span class="server-name" title="${server.name}">${server.name}</span>
            <span class="server-ip" style="font-size:0.7rem; color: #48bb78;">Local port: ${server.port}</span>
          </div>
          <span class="server-latency-badge" style="background: rgba(255,255,255,0.05); color: #fff; font-size:0.6rem;">${server.software}</span>
        </div>
        <div class="server-motd" style="height:20px; font-size:0.7rem;">Version: ${server.version}</div>
        <div class="server-footer">
          <div class="server-stats">
            <span class="server-stat-item">
              <span class="pulse-dot ${isRunning ? 'green' : 'red'}"></span>
              <span>${server.status}</span>
            </span>
          </div>
          <div class="server-actions">
            <button class="btn-server-action edit" id="btn-folder-local-${server.name}">Folder</button>
            <button class="btn-server-action delete" id="btn-delete-local-${server.name}">Delete</button>
            <button class="btn-server-action play" id="btn-power-local-${server.name}" style="${isRunning ? 'background: linear-gradient(135deg, #e53e3e, #c53030);' : ''}">${isRunning ? 'Stop' : 'Start'}</button>
          </div>
        </div>
      `;

      // Bind folder open
      card.querySelector(`#btn-folder-local-${server.name}`).addEventListener('click', () => {
        if (window.api) window.api.openServerFolder(server.name);
      });

      // Bind delete
      card.querySelector(`#btn-delete-local-${server.name}`).addEventListener('click', async () => {
        if (confirm(`Are you sure you want to permanently delete local server "${server.name}"?\nAll files, configurations, and world saves will be lost!`)) {
          if (window.api) {
            await window.api.deleteLocalServer(server.name);
            loadLocalServersList();
            if (activeConsoleServer === server.name && localServerConsolePanel) {
              localServerConsolePanel.style.display = 'none';
            }
          }
        }
      });

      // Bind power start/stop
      card.querySelector(`#btn-power-local-${server.name}`).addEventListener('click', async () => {
        if (window.api) {
          if (isRunning) {
            await window.api.stopLocalServer(server.name);
          } else {
            // Set console panel header
            activeConsoleServer = server.name;
            if (consoleServerTitle) consoleServerTitle.textContent = `Console - ${server.name}`;
            if (consoleServerMeta) consoleServerMeta.textContent = `${server.software} ${server.version}`;
            if (serverConsoleLogs) serverConsoleLogs.innerHTML = "";
            updateConsoleHeaderState('Running');
            if (localServerConsolePanel) localServerConsolePanel.style.display = 'flex';

            const res = await window.api.startLocalServer(server.name);
            if (!res.success) {
              alert(`Launch failed: ${res.error}`);
            }
          }
        }
      });

      localServersGrid.appendChild(card);
    });

  } catch (err) {
    console.error('Failed to load local servers list:', err);
  }
}

// Playtime utilities
function formatPlaytime(ms) {
  if (!ms || ms < 1000) return '0m';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  return `${hours}h ${remMins}m`;
}

// Client logs helper
function appendClientLog(line) {
  clientSessionLogs.push(line);
  const clientConsoleLogs = document.getElementById('client-console-logs');
  if (!clientConsoleLogs) return;
  
  const item = document.createElement('div');
  item.style.lineHeight = '1.4';
  item.style.fontFamily = 'monospace';
  item.style.fontSize = '0.75rem';
  
  const cleaned = line.trim();
  item.textContent = cleaned;
  
  if (cleaned.toLowerCase().includes('error') || cleaned.toLowerCase().includes('exception') || cleaned.toLowerCase().includes('fatal') || cleaned.toLowerCase().includes('mixin transformation failed')) {
    item.style.color = '#feb2b2';
  } else if (cleaned.toLowerCase().includes('warning') || cleaned.toLowerCase().includes('warn')) {
    item.style.color = '#faf089';
  } else if (cleaned.startsWith('[DEBUG]') || cleaned.toLowerCase().includes('debug')) {
    item.style.color = '#a0aec0';
  } else {
    item.style.color = '#e2e8f0';
  }
  
  clientConsoleLogs.appendChild(item);
  clientConsoleLogs.scrollTop = clientConsoleLogs.scrollHeight;
}

// Crash diagnostics
function diagnoseCrash(logs) {
  let diagnosis = "Game exited with non-zero exit code. Please review the logs above.";
  for (const line of logs) {
    if (line.includes('java.lang.OutOfMemoryError')) {
      return "OutOfMemoryError: The game ran out of memory. Try increasing RAM allocation in settings.";
    }
    if (line.includes('UnsupportedClassVersionError') || line.includes('has been compiled by a more recent version of the Java Runtime')) {
      return "Java Version Mismatch: The selected JRE is incompatible with this version of Minecraft. Check JRE settings.";
    }
    if (line.includes('MixinTransformationException') || line.includes('Mixin transformation failed') || line.includes('mixin.injection.throwables')) {
      return "Mod Loader Transformation Error: Incompatible mod versions or conflicting library injection. Check your mod list.";
    }
    if (line.includes('java.lang.NullPointerException')) {
      diagnosis = "NullPointerException occurred. This is usually caused by a buggy mod. Review crash logs.";
    }
    if (line.includes('FileNotFoundException') && line.includes('.jar')) {
      diagnosis = "Missing Mod Dependency or Library: One of your mods requires a file that was not found.";
    }
    if (line.includes('Minecraft Crash Report')) {
      diagnosis = "Crash report generated by Minecraft. View folder saves/logs for details.";
    }
  }
  return diagnosis;
}

// Modrinth recursive dependency resolution
async function resolveAndInstallDependencies(dependencies, profileId, loader, resolvedVersion, installedJarNames, visitedProjects = new Set()) {
  for (const dep of dependencies) {
    if (dep.dependency_type !== 'required') continue;
    const depProjectId = dep.project_id;
    if (!depProjectId || visitedProjects.has(depProjectId)) continue;
    visitedProjects.add(depProjectId);
    
    try {
      const versionUrl = `https://api.modrinth.com/v2/project/${depProjectId}/version?loaders=${encodeURIComponent(`["${loader}"]`)}&game_versions=${encodeURIComponent(`["${resolvedVersion}"]`)}`;
      const res = await fetch(versionUrl, { headers: { 'User-Agent': 'Pramochak-MC-Launcher/2.0.0 (antigravity)' } });
      if (!res.ok) continue;
      const versions = await res.json();
      if (versions.length === 0) continue;
      
      const latestVersion = versions[0];
      const file = latestVersion.files.find(f => f.primary) || latestVersion.files[0];
      if (!file) continue;
      
      if (installedJarNames.includes(file.filename)) {
        console.log(`[DEPENDENCY] ${file.filename} is already installed.`);
        continue;
      }
      
      console.log(`[DEPENDENCY] Downloading required dependency: ${file.filename}`);
      appendLog(`Installing required dependency: ${file.filename}...`, 'info');
      
      const result = await window.api.downloadMod({
        profileId,
        modUrl: file.url,
        filename: file.filename
      });
      
      if (result.success) {
        installedJarNames.push(file.filename);
        appendLog(`Installed dependency ${file.filename} successfully.`, 'success');
        
        if (latestVersion.dependencies && latestVersion.dependencies.length > 0) {
          await resolveAndInstallDependencies(latestVersion.dependencies, profileId, loader, resolvedVersion, installedJarNames, visitedProjects);
        }
      }
    } catch (err) {
      console.error(`Failed to install dependency ${depProjectId}:`, err);
    }
  }
}

// --- THEME SELECTOR ENGINE ---
const themeSelectorBtn = document.getElementById('theme-selector-btn');
const themePopover = document.getElementById('theme-popover');
const activeThemeLabel = document.getElementById('active-theme-label');
const themeOptions = document.querySelectorAll('.theme-option');

const themeMap = {
  'warm-cream': { name: 'Light Luxe', class: 'theme-warm-cream' },
  'dark-charcoal': { name: 'Dark Studio', class: 'theme-dark-charcoal' }
};

function applyTheme(themeId) {
  if (!themeMap[themeId]) themeId = 'dark-charcoal';
  
  // Apply class to body
  Object.values(themeMap).forEach(themeObj => {
    document.body.classList.remove(themeObj.class);
  });
  document.body.classList.add(themeMap[themeId].class);
  
  // Update sidebar label
  if (activeThemeLabel) {
    activeThemeLabel.textContent = themeMap[themeId].name;
  }
  
  // Sync settings dropdown
  if (settingsThemeSelect) {
    settingsThemeSelect.value = themeId;
  }
  
  // Set active class on popover item
  themeOptions.forEach(opt => {
    if (opt.getAttribute('data-theme') === themeId) {
      opt.classList.add('active');
      opt.setAttribute('aria-selected', 'true');
    } else {
      opt.classList.remove('active');
      opt.setAttribute('aria-selected', 'false');
    }
  });
  
  if (typeof launcherConfig !== 'undefined') {
    launcherConfig.theme = themeId;
  }
}

// Set click handlers on sidebar theme selector button
if (themeSelectorBtn) {
  themeSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    themeSelectorBtn.classList.toggle('popover-open');
  });
  
  themeSelectorBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      themeSelectorBtn.classList.toggle('popover-open');
    } else if (e.key === 'Escape') {
      themeSelectorBtn.classList.remove('popover-open');
    }
  });
}

// Option click listeners
themeOptions.forEach(opt => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    const themeId = opt.getAttribute('data-theme');
    applyTheme(themeId);
    if (typeof saveConfigToDisk === 'function') {
      saveConfigToDisk();
    }
    if (themeSelectorBtn) {
      themeSelectorBtn.classList.remove('popover-open');
    }
  });
  
  opt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const themeId = opt.getAttribute('data-theme');
      applyTheme(themeId);
      if (typeof saveConfigToDisk === 'function') {
        saveConfigToDisk();
      }
      if (themeSelectorBtn) {
        themeSelectorBtn.classList.remove('popover-open');
        themeSelectorBtn.focus();
      }
    }
  });
});

// Close popover when clicking anywhere else
document.addEventListener('click', () => {
  if (themeSelectorBtn) {
    themeSelectorBtn.classList.remove('popover-open');
  }
});

// Handle settings theme selector change directly
if (settingsThemeSelect) {
  settingsThemeSelect.addEventListener('change', () => {
    applyTheme(settingsThemeSelect.value);
    if (typeof saveConfigToDisk === 'function') {
      saveConfigToDisk();
    }
  });
}

// --- BENTO HOME QUICK ACTIONS ---
const actionCreate = document.getElementById('bento-action-create');
const actionAddServer = document.getElementById('bento-action-add-server');
const actionInstallMod = document.getElementById('bento-action-install-mod');
const actionBrowsePacks = document.getElementById('bento-action-browse-packs');

if (actionCreate) {
  actionCreate.addEventListener('click', () => {
    const navWorlds = document.getElementById('nav-worlds');
    if (navWorlds) navWorlds.click();
    setTimeout(() => {
      const btnCreateWorld = document.getElementById('btn-create-world');
      if (btnCreateWorld) btnCreateWorld.click();
    }, 150);
  });
}

if (actionAddServer) {
  actionAddServer.addEventListener('click', () => {
    const navServers = document.getElementById('nav-servers');
    if (navServers) navServers.click();
    setTimeout(() => {
      if (addServerDialogOverlay) {
        if (inputAddServerName) inputAddServerName.value = '';
        if (inputAddServerIp) inputAddServerIp.value = '';
        addServerDialogOverlay.style.display = 'flex';
      }
    }, 150);
  });
}

if (actionInstallMod) {
  actionInstallMod.addEventListener('click', () => {
    const navMods = document.getElementById('nav-mods');
    if (navMods) navMods.click();
  });
}

if (actionBrowsePacks) {
  actionBrowsePacks.addEventListener('click', () => {
    const navResources = document.getElementById('nav-resources');
    if (navResources) navResources.click();
  });
}

// --- GLOBAL SEARCH COMMAND PALETTE ---
const globalSearchOverlay = document.getElementById('global-search-overlay');
const globalSearchInput = document.getElementById('global-search-input');
const globalSearchResults = document.getElementById('global-search-results');
const globalSearchTrigger = document.getElementById('global-search-trigger');

function openGlobalSearch() {
  if (globalSearchOverlay) {
    openModalWithMotion(globalSearchOverlay);
    if (globalSearchInput) {
      globalSearchInput.value = '';
      setTimeout(() => globalSearchInput.focus(), 100);
    }
    renderSearchResults('');
  }
}

function closeGlobalSearch() {
  if (globalSearchOverlay) {
    closeModalWithMotion(globalSearchOverlay);
  }
}

if (globalSearchTrigger) {
  globalSearchTrigger.addEventListener('click', openGlobalSearch);
}

// Ctrl+K event listener
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openGlobalSearch();
  }
  if (e.key === 'Escape') {
    closeGlobalSearch();
  }
});

if (globalSearchOverlay) {
  globalSearchOverlay.addEventListener('click', (e) => {
    if (e.target === globalSearchOverlay) {
      closeGlobalSearch();
    }
  });
}

// Search index populator
function renderSearchResults(query) {
  if (!globalSearchResults) return;
  globalSearchResults.innerHTML = '';
  
  const q = query.trim().toLowerCase();
  
  // Search items list
  const items = [];
  
  // 1. Navigation items
  const navMap = [
    { name: 'Home Screen', desc: 'Go to launcher dashboard', action: () => document.getElementById('nav-home').click() },
    { name: 'Installations / Launch Profiles', desc: 'Manage game versions and configurations', action: () => document.getElementById('nav-installations').click() },
    { name: 'Skins Wardrobe', desc: 'Change or edit player skins', action: () => document.getElementById('nav-skins').click() },
    { name: 'Mod Manager', desc: 'Search and install mods from Modrinth', action: () => document.getElementById('nav-mods').click() },
    { name: 'Resource Packs', desc: 'Manage local textures and resource packs', action: () => document.getElementById('nav-resources').click() },
    { name: 'Worlds Directory', desc: 'Explore singleplayer worlds saves', action: () => document.getElementById('nav-worlds').click() },
    { name: 'Multiplayer Servers', desc: 'Connect to local or online game servers', action: () => document.getElementById('nav-servers').click() },
    { name: 'Settings Options', desc: 'Adjust memory allocation, nicknames, java paths', action: () => document.getElementById('nav-settings').click() }
  ];
  
  navMap.forEach(nav => {
    if (!q || nav.name.toLowerCase().includes(q) || nav.desc.toLowerCase().includes(q)) {
      items.push({
        type: 'Navigation',
        title: nav.name,
        subtitle: nav.desc,
        action: () => {
          nav.action();
          closeGlobalSearch();
        }
      });
    }
  });

  // 2. Local Profiles
  if (typeof userProfiles !== 'undefined') {
    userProfiles.forEach(p => {
      if (!q || p.name.toLowerCase().includes(q) || p.version.toLowerCase().includes(q)) {
        items.push({
          type: 'Launch Profile',
          title: p.name,
          subtitle: `Version: ${p.version} (${p.modloader})`,
          action: () => {
            activeProfileId = p.id;
            if (typeof updateLauncherUiForActiveProfile === 'function') {
              updateLauncherUiForActiveProfile();
            }
            closeGlobalSearch();
          }
        });
      }
    });
  }
  
  if (items.length === 0) {
    globalSearchResults.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No results found for "${query}"</div>`;
    return;
  }
  
  const fragment = document.createDocumentFragment();

  items.slice(0, 6).forEach(item => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '10px 14px';
    row.style.borderRadius = '8px';
    row.style.cursor = 'pointer';
    row.style.transition = 'all 0.15s ease';
    row.style.background = 'rgba(255,255,255,0.01)';
    row.style.border = '1px solid transparent';
    row.setAttribute('tabindex', '0');
    
    row.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <span style="font-weight: 700; font-size: 0.85rem; color: #fff;">${item.title}</span>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${item.subtitle}</span>
      </div>
      <span style="font-size: 0.6rem; font-weight: 800; color: var(--accent-green); background: var(--accent-green-glow); padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${item.type}</span>
    `;
    
    row.addEventListener('click', item.action);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.action();
      }
    });
    row.addEventListener('mouseenter', () => {
      row.style.background = 'rgba(255,255,255,0.04)';
      row.style.borderColor = 'var(--border-glass-hover)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = 'rgba(255,255,255,0.01)';
      row.style.borderColor = 'transparent';
    });
    
    fragment.appendChild(row);
  });

  globalSearchResults.appendChild(fragment);
}

if (globalSearchInput) {
  globalSearchInput.addEventListener('input', debounce((e) => {
    renderSearchResults(e.target.value);
  }, 50));
}

// --- CINEMATIC HERO MOTION & PARALLAX SYSTEM ---
(function initHeroMotionSystem() {
  const heroCard = document.getElementById('hero-card');
  const heroBg = document.getElementById('hero-card-bg-img');
  const particlesContainer = document.getElementById('hero-particles');

  if (!heroCard) return;

  // 1. Spawn Ambient Floating Embers/Fireflies
  if (particlesContainer) {
    const PARTICLE_COUNT = 14;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const dot = document.createElement('div');
      dot.className = 'hero-particle-dot';
      dot.style.left = `${10 + Math.random() * 80}%`;
      dot.style.top = `${20 + Math.random() * 70}%`;
      dot.style.animationDuration = `${6 + Math.random() * 8}s`;
      dot.style.animationDelay = `${Math.random() * 5}s`;
      dot.style.transform = `scale(${0.5 + Math.random() * 0.8})`;
      particlesContainer.appendChild(dot);
    }
  }

  // 2. Framer-Motion 3D Spring Parallax & Motion Blur Tracking
  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;
  let lastX = 0;
  let lastY = 0;
  let currentBlur = 0;
  let isHovered = false;
  let animFrameId = null;

  function updatePhysics() {
    // Damped Spring Physics interpolation
    const springSpeed = 0.08;
    currentTiltX += (targetTiltX - currentTiltX) * springSpeed;
    currentTiltY += (targetTiltY - currentTiltY) * springSpeed;

    // Apply 3D card tilt + opposite background parallax
    heroCard.style.transform = `perspective(1000px) rotateX(${currentTiltX.toFixed(2)}deg) rotateY(${currentTiltY.toFixed(2)}deg)`;
    if (heroBg) {
      const bgOffsetX = -currentTiltY * 2.2;
      const bgOffsetY = currentTiltX * 2.2;
      heroBg.style.transform = `scale(${isHovered ? 1.09 : 1.05}) translate3d(${bgOffsetX.toFixed(1)}px, ${bgOffsetY.toFixed(1)}px, 0)`;
      heroBg.style.filter = currentBlur > 0.2 ? `blur(${currentBlur.toFixed(1)}px)` : 'none';
    }

    // Decay motion blur smoothly
    currentBlur *= 0.88;

    if (isHovered || Math.abs(currentTiltX) > 0.02 || Math.abs(currentTiltY) > 0.02) {
      animFrameId = requestAnimationFrame(updatePhysics);
    } else {
      heroCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
      if (heroBg) {
        heroBg.style.transform = 'scale(1.05) translate3d(0, 0, 0)';
        heroBg.style.filter = 'none';
      }
      animFrameId = null;
    }
  }

  heroCard.addEventListener('mouseenter', () => {
    isHovered = true;
    if (!animFrameId) animFrameId = requestAnimationFrame(updatePhysics);
  });

  heroCard.addEventListener('mousemove', (e) => {
    const rect = heroCard.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    // Max 3.5 deg tilt
    targetTiltX = -y * 6;
    targetTiltY = x * 6;

    // Calculate mouse velocity for subtle dynamic motion blur
    const deltaX = Math.abs(e.clientX - lastX);
    const deltaY = Math.abs(e.clientY - lastY);
    const velocity = Math.hypot(deltaX, deltaY);
    lastX = e.clientX;
    lastY = e.clientY;

    if (velocity > 12) {
      currentBlur = Math.min(1.2, velocity * 0.04);
    }

    if (!animFrameId) animFrameId = requestAnimationFrame(updatePhysics);
  });

  heroCard.addEventListener('mouseleave', () => {
    isHovered = false;
    targetTiltX = 0;
    targetTiltY = 0;
    currentBlur = 0;
  });
})();

// ==========================================================================
// ==========================================================================
// 16. CINEMATIC BOOT INTRO VIDEO & AUDIO SEQUENCE (FRAME-LOCKED SYNC)
// ==========================================================================
let bootIntroInitialized = false;

function initCinematicBootIntro() {
  if (bootIntroInitialized) return;
  bootIntroInitialized = true;

  const introOverlay = document.getElementById('launcher-boot-intro');
  const introVideo = document.getElementById('boot-intro-video');
  const introAudio = document.getElementById('boot-intro-audio');
  const btnSkipIntro = document.getElementById('btn-skip-intro');
  const launcherWindow = document.querySelector('.launcher-window');
  const bootStageVideo = document.getElementById('boot-stage-video');
  const bootStageBrand = document.getElementById('boot-stage-brand');
  
  if (!introOverlay || !introVideo) return;

  let introFinished = false;
  let inBrandStage = false;
  let syncAnimId = null;
  let brandStingTimer = null;

  function finishIntro() {
    if (introFinished) return;
    introFinished = true;

    if (brandStingTimer) {
      clearTimeout(brandStingTimer);
      brandStingTimer = null;
    }

    if (syncAnimId) {
      cancelAnimationFrame(syncAnimId);
      syncAnimId = null;
    }

    // Smoothly fade & pause audio
    if (introAudio) {
      try {
        let vol = introAudio.volume || 1.0;
        const fadeInterval = setInterval(() => {
          if (vol > 0.15) {
            vol -= 0.15;
            introAudio.volume = Math.max(0, vol);
          } else {
            clearInterval(fadeInterval);
            introAudio.pause();
          }
        }, 20);
      } catch (e) {
        introAudio.pause();
      }
    }

    if (introVideo) {
      try { introVideo.pause(); } catch (e) {}
    }

    // Play cinematic Framer-Motion transition
    introOverlay.classList.add('intro-exiting');
    if (launcherWindow) {
      launcherWindow.classList.add('app-revealing');
    }

    setTimeout(() => {
      introOverlay.style.display = 'none';
      if (introVideo) {
        introVideo.pause();
        introVideo.removeAttribute('src');
        introVideo.load();
      }
      if (introAudio) {
        introAudio.pause();
        introAudio.removeAttribute('src');
        introAudio.load();
      }
      console.log('[INTRO] Boot intro completed full playback and resources freed.');
    }, 550);
  }

  // Stage 2: Brand Logo & Title Splash Sting (Max 3.8s)
  function triggerBrandSting() {
    if (introFinished || inBrandStage) return;
    inBrandStage = true;

    if (syncAnimId) {
      cancelAnimationFrame(syncAnimId);
      syncAnimId = null;
    }

    if (introAudio) {
      try { introAudio.pause(); } catch (e) {}
    }
    if (introVideo) {
      try { introVideo.pause(); } catch (e) {}
    }

    if (bootStageVideo) bootStageVideo.style.display = 'none';
    if (bootStageBrand) bootStageBrand.style.display = 'flex';

    // 3.8s total duration for brand logo fade in and hold
    brandStingTimer = setTimeout(() => {
      finishIntro();
    }, 3800);
  }

  // Frame-Locked Video & Audio Engine
  function setupSynchronizedPlayback() {
    if (!introVideo || !introAudio) return;

    let isVideoReady = introVideo.readyState >= 3;
    let isAudioReady = introAudio.readyState >= 3;
    let hasStarted = false;

    function checkStart() {
      if (introFinished || hasStarted) return;
      if (isVideoReady && isAudioReady) {
        hasStarted = true;
        introVideo.currentTime = 0;
        introAudio.currentTime = 0;

        const p1 = introVideo.play();
        const p2 = introAudio.play();

        if (p1) p1.catch(err => console.warn('[INTRO] Video play warning:', err));
        if (p2) p2.catch(err => console.warn('[INTRO] Audio play warning:', err));

        startSyncLoop();
      }
    }

    // Continuous High-Frequency Precision Drift Correction
    function startSyncLoop() {
      function tick() {
        if (introFinished || inBrandStage) return;

        if (!introVideo.paused && !introAudio.paused) {
          const drift = Math.abs(introVideo.currentTime - introAudio.currentTime);
          // If drift exceeds 25 milliseconds, snap audio to video timestamp immediately
          if (drift > 0.025) {
            introAudio.currentTime = introVideo.currentTime;
          }
        }
        syncAnimId = requestAnimationFrame(tick);
      }
      syncAnimId = requestAnimationFrame(tick);
    }

    // Listen for readiness
    introVideo.addEventListener('canplaythrough', () => {
      isVideoReady = true;
      checkStart();
    }, { once: true });

    introAudio.addEventListener('canplaythrough', () => {
      isAudioReady = true;
      checkStart();
    }, { once: true });

    // Fallback if already cached/ready
    if (introVideo.readyState >= 2) isVideoReady = true;
    if (introAudio.readyState >= 2) isAudioReady = true;
    checkStart();

    // Bind playback state changes
    introVideo.addEventListener('play', () => {
      introAudio.currentTime = introVideo.currentTime;
      introAudio.play().catch(() => {});
    });

    introVideo.addEventListener('pause', () => {
      introAudio.pause();
    });

    introVideo.addEventListener('waiting', () => {
      introAudio.pause();
    });

    introVideo.addEventListener('playing', () => {
      introAudio.currentTime = introVideo.currentTime;
      introAudio.play().catch(() => {});
    });

    introVideo.addEventListener('seeked', () => {
      introAudio.currentTime = introVideo.currentTime;
    });

    // Master trigger on full video completion: Switch to Stage 2 Brand Sting
    introVideo.addEventListener('ended', () => {
      console.log('[INTRO] Full video playback completed in perfect sync. Transitioning to Brand Sting.');
      triggerBrandSting();
    });

    introVideo.addEventListener('error', (err) => {
      console.error('[INTRO] Video error encountered:', err);
      triggerBrandSting();
    });
  }

  setupSynchronizedPlayback();

  // Skip button click
  if (btnSkipIntro) {
    btnSkipIntro.addEventListener('click', (e) => {
      e.stopPropagation();
      finishIntro();
    });
  }

  // Keyboard shortcut to skip
  window.addEventListener('keydown', (e) => {
    if (!introFinished && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      finishIntro();
    }
  });
}

// Initialize boot intro on start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCinematicBootIntro);
} else {
  initCinematicBootIntro();
}


