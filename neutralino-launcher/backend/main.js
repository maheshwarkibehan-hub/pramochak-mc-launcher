const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');
const https = require('https');
const http = require('http');
const urlModule = require('url');
const { execSync } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');

function getGameDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.minecraft');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
  } else {
    return path.join(os.homedir(), '.minecraft');
  }
}

const GAME_DIR = getGameDir();

// Helper to determine required Java version based on Minecraft version
function getRequiredJavaVersion(versionStr) {
  const parts = versionStr.split('.');
  let major = 8; // Default to 8
  
  if (parts[0] === '1') {
    major = parseInt(parts[1]) || 8;
  } else {
    major = parseInt(parts[0]) || 8;
  }
  
  const minor = parseInt(parts[2]) || 0;
  
  if (major >= 25) {
    return 25;
  } else if (major >= 21) {
    return 21;
  } else if (major === 20 && minor >= 5) {
    return 21;
  } else if (major >= 17) {
    return 17;
  } else {
    return 8;
  }
}

let activeRequest = null;
let isLaunchCancelled = false;

// Monkey-patch network requests and child process spawning to handle cancellation dynamically
const originalHttpRequest = http.request;
http.request = function() {
  const req = originalHttpRequest.apply(this, arguments);
  if (isLaunchCancelled) {
    req.destroy(new Error('Launch cancelled by user'));
  }
  return req;
};

const originalHttpsRequest = https.request;
https.request = function() {
  const req = originalHttpsRequest.apply(this, arguments);
  if (isLaunchCancelled) {
    req.destroy(new Error('Launch cancelled by user'));
  }
  return req;
};

const child_process = require('child_process');
const originalSpawn = child_process.spawn;
child_process.spawn = function(command, args, options) {
  if (isLaunchCancelled) {
    console.log('[SPAWN INTERCEPT] Blocked spawning client since launch was cancelled:', command);
    throw new Error('Launch cancelled by user');
  }
  return originalSpawn.apply(this, arguments);
};


// Download file using native Node.js http/https modules (follows redirects, supports timeouts, and ensures file completion)
function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    let resolvedOrRejected = false;
    const file = fs.createWriteStream(destPath);
    
    file.on('error', (err) => {
      if (resolvedOrRejected) return;
      resolvedOrRejected = true;
      file.destroy();
      try { fs.unlinkSync(destPath); } catch (e) {}
      activeRequest = null;
      reject(err);
    });

    file.on('finish', () => {
      if (resolvedOrRejected) return;
      resolvedOrRejected = true;
      activeRequest = null;
      resolve();
    });
    
    function get(currentUrl) {
      if (isLaunchCancelled) {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          file.destroy();
          try { fs.unlinkSync(destPath); } catch (e) {}
          reject(new Error('Launch was cancelled by user.'));
        }
        return;
      }
      
      const parsedUrl = urlModule.parse(currentUrl);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        headers: {
          'User-Agent': 'PramochakMC/2.0.0 (contact@pramochak.example.com)'
        },
        timeout: 60000 // 60 seconds request timeout
      };
      
      const req = protocol.get(options, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          const redirectUrl = urlModule.resolve(currentUrl, response.headers.location);
          return get(redirectUrl);
        }
        
        if (response.statusCode !== 200) {
          if (!resolvedOrRejected) {
            resolvedOrRejected = true;
            file.destroy();
            try { fs.unlinkSync(destPath); } catch (e) {}
            reject(new Error(`Server returned status code ${response.statusCode}`));
          }
          return;
        }
        
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let downloaded = 0;
        
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (progressCallback && totalSize > 0) {
            progressCallback(downloaded, totalSize);
          }
        });
        
        response.on('end', () => {
          file.end();
        });
        
        response.on('error', (err) => {
          if (!resolvedOrRejected) {
            resolvedOrRejected = true;
            file.destroy();
            try { fs.unlinkSync(destPath); } catch (e) {}
            activeRequest = null;
            reject(err);
          }
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          file.destroy();
          try { fs.unlinkSync(destPath); } catch (e) {}
          activeRequest = null;
          reject(new Error('Connection timed out after 60 seconds.'));
        }
      });
      
      req.on('error', (err) => {
        if (!resolvedOrRejected) {
          resolvedOrRejected = true;
          file.destroy();
          try { fs.unlinkSync(destPath); } catch (e) {}
          activeRequest = null;
          reject(err);
        }
      });
      
      activeRequest = req;
    }
    
    get(url);
  });
}

// Recursively find javaw.exe inside extracted files
function findJavaw(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findJavaw(fullPath);
      if (found) return found;
    } else if (file.toLowerCase() === 'javaw.exe') {
      return fullPath;
    }
  }
  return null;
}

// Main function to check and download JRE
async function ensureJava(versionStr, event) {
  const javaVersion = getRequiredJavaVersion(versionStr);
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const javaDir = path.join(runtimeDir, `java-${javaVersion}`);
  const javawPath = path.join(javaDir, 'bin', 'javaw.exe');
  
  if (fs.existsSync(javawPath)) {
    console.log(`[JAVA SETUP] Java ${javaVersion} already exists at: ${javawPath}`);
    return javawPath;
  }
  
  console.log(`[JAVA SETUP] Java ${javaVersion} not found. Starting automatic download...`);
  event.sender.send('launch-status', 'preparing');
  event.sender.send('launch-log', `Required Java ${javaVersion} Runtime not found. Initiating auto-download...`);
  
  const tempDir = path.join(runtimeDir, 'temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  
  const zipPath = path.join(tempDir, `java-${javaVersion}.zip`);
  const extractDir = path.join(tempDir, `java-${javaVersion}-extract`);
  
  // Adoptium Eclipse Temurin JRE API URL (follows redirection to actual zip download)
  const downloadUrl = `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/windows/x64/jre/hotspot/normal/eclipse`;
  
  console.log(`[JAVA SETUP] Downloading from: ${downloadUrl}`);
  event.sender.send('launch-log', `Fetching Java ${javaVersion} OpenJDK JRE archive...`);
  
  try {
    let lastLoggedPercent = -1;
    await downloadFile(downloadUrl, zipPath, (downloaded, totalSize) => {
      const pct = Math.floor((downloaded / totalSize) * 100);
      event.sender.send('launch-progress', {
        type: `Java ${javaVersion} Runtime`,
        task: Math.round(downloaded / (1024 * 1024)),
        total: Math.round(totalSize / (1024 * 1024))
      });
      
      if (pct !== lastLoggedPercent && pct % 10 === 0) {
        lastLoggedPercent = pct;
        const currentMB = (downloaded / (1024 * 1024)).toFixed(1);
        const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
        event.sender.send('launch-log', `Downloading JRE ${javaVersion}: ${currentMB}MB / ${totalMB}MB (${pct}%)`);
      }
    });
    
    event.sender.send('launch-log', 'Download completed. Extracting JRE package...');
    console.log('[JAVA SETUP] Extracting ZIP package using native tar command...');
    
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xf "${zipPath}" -C "${extractDir}"`);
    console.log('[JAVA SETUP] Archive extracted successfully.');
    
    const foundJavaw = findJavaw(extractDir);
    if (!foundJavaw) {
      throw new Error(`javaw.exe could not be found inside the extracted JRE files.`);
    }
    
    const jreRoot = path.dirname(path.dirname(foundJavaw));
    console.log('[JAVA SETUP] Found JRE Root directory at:', jreRoot);
    
    if (fs.existsSync(javaDir)) {
      fs.rmSync(javaDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(javaDir), { recursive: true });
    fs.renameSync(jreRoot, javaDir);
    
    console.log(`[JAVA SETUP] Java ${javaVersion} installed successfully to: ${javaDir}`);
    event.sender.send('launch-log', `Java ${javaVersion} Runtime auto-installed and configured successfully.`);
    
    // Clean up temp folder
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    
    return javawPath;
  } catch (err) {
    console.error('[JAVA SETUP] Error during installation:', err);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    throw new Error(`Java Auto-Installation failed: ${err.message}`);
  }
}
// Pre-mapped stable Forge versions for popular Minecraft versions
const FORGE_VERSION_MAP = {
  '1.20.1': '47.2.0',
  '1.19.4': '45.1.0',
  '1.18.2': '40.2.0',
  '1.16.5': '36.2.39',
  '1.12.2': '14.23.5.2859',
  '1.8.9': '11.15.1.2318'
};

// Automate Fabric Profile JSON downloading
async function ensureFabric(mcVersion, profileDir, customLoaderVersion, event) {
  // Handle parameters shifts if legacy caller passes event in place of customLoaderVersion
  let loaderVersion = '0.16.10';
  let actualEvent = event;
  if (customLoaderVersion && typeof customLoaderVersion === 'object' && customLoaderVersion.sender) {
    actualEvent = customLoaderVersion;
  } else if (customLoaderVersion) {
    loaderVersion = customLoaderVersion;
  }

  const fabricVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionsDir = path.join(profileDir, 'versions');
  const fabricDir = path.join(versionsDir, fabricVersionId);
  const jsonPath = path.join(fabricDir, `${fabricVersionId}.json`);
  
  if (fs.existsSync(jsonPath)) {
    console.log(`[FABRIC SETUP] Fabric profile already exists for ${mcVersion} at: ${jsonPath}`);
    return fabricVersionId;
  }
  
  console.log(`[FABRIC SETUP] Fabric profile not found. Installing loader ${loaderVersion} for MC ${mcVersion}...`);
  if (actualEvent) actualEvent.sender.send('launch-log', `Fabric Loader profile not found. Generating files for MC ${mcVersion}...`);
  
  if (!fs.existsSync(fabricDir)) {
    fs.mkdirSync(fabricDir, { recursive: true });
  }
  
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
  console.log(`[FABRIC SETUP] Fetching from: ${url}`);
  
  try {
    await downloadFile(url, jsonPath);
    console.log(`[FABRIC SETUP] Fabric profile metadata installed successfully to: ${jsonPath}`);
    event.sender.send('launch-log', `Fabric Loader metadata downloaded and installed successfully.`);
    return fabricVersionId;
  } catch (err) {
    console.error('[FABRIC SETUP] Error downloading Fabric profile:', err);
    try { fs.rmSync(fabricDir, { recursive: true, force: true }); } catch (e) {}
    throw new Error(`Fabric Loader installation failed: ${err.message}`);
  }
}

// Automate Forge Installer downloading
async function ensureForge(mcVersion, event) {
  let forgeVersion = FORGE_VERSION_MAP[mcVersion];
  
  if (!forgeVersion) {
    try {
      console.log(`[FORGE SETUP] Fetching dynamic Forge version for MC ${mcVersion}...`);
      event.sender.send('launch-log', `Resolving Forge version from online repository...`);
      
      const PROMOTIONS_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
      const runtimeDir = path.join(GAME_DIR, 'runtime');
      const tempPath = path.join(runtimeDir, 'temp_forge_promos.json');
      
      if (!fs.existsSync(runtimeDir)) {
        fs.mkdirSync(runtimeDir, { recursive: true });
      }
      
      await downloadFile(PROMOTIONS_URL, tempPath);
      const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
      try { fs.unlinkSync(tempPath); } catch (e) {}
      
      forgeVersion = data.promos[`${mcVersion}-recommended`] || data.promos[`${mcVersion}-latest`];
      if (forgeVersion) {
        console.log(`[FORGE SETUP] Resolved Forge version dynamically: ${forgeVersion} for MC ${mcVersion}`);
      }
    } catch (err) {
      console.error('[FORGE SETUP] Dynamic Forge resolution failed:', err);
    }
  }

  if (!forgeVersion) {
    throw new Error(`Forge auto-installer is not pre-mapped or available on Forge metadata for Minecraft ${mcVersion}. Please verify if Forge supports this version.`);
  }
  
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const forgeInstallerPath = path.join(runtimeDir, `forge-${mcVersion}-${forgeVersion}-installer.jar`);
  
  if (fs.existsSync(forgeInstallerPath)) {
    console.log(`[FORGE SETUP] Forge installer already cached at: ${forgeInstallerPath}`);
    return forgeInstallerPath;
  }
  
  console.log(`[FORGE SETUP] Downloading Forge ${forgeVersion} installer for MC ${mcVersion}...`);
  event.sender.send('launch-log', `Forge installer not found in cache. Starting download...`);
  
  const tempDir = path.join(runtimeDir, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
  console.log(`[FORGE SETUP] Downloading from: ${downloadUrl}`);
  
  try {
    let lastLoggedPercent = -1;
    await downloadFile(downloadUrl, forgeInstallerPath, (downloaded, totalSize) => {
      const pct = Math.floor((downloaded / totalSize) * 100);
      event.sender.send('launch-progress', {
        type: `Forge ${forgeVersion} Installer`,
        task: Math.round(downloaded / (1024 * 1024)),
        total: Math.round(totalSize / (1024 * 1024))
      });
      
      if (pct !== lastLoggedPercent && pct % 10 === 0) {
        lastLoggedPercent = pct;
        const currentMB = (downloaded / (1024 * 1024)).toFixed(1);
        const totalMB = (totalSize / (1024 * 1024)).toFixed(1);
        event.sender.send('launch-log', `Downloading Forge Installer: ${currentMB}MB / ${totalMB}MB (${pct}%)`);
      }
    });
    
    event.sender.send('launch-log', `Forge installer package downloaded successfully.`);
    return forgeInstallerPath;
  } catch (err) {
    console.error('[FORGE SETUP] Failed to setup Forge installer:', err);
    if (fs.existsSync(forgeInstallerPath)) {
      try { fs.unlinkSync(forgeInstallerPath); } catch (e) {}
    }
    throw new Error(`Forge Installer setup failed: ${err.message}`);
  }
}

// Ensure Fabric API is downloaded for Fabric profiles
async function ensureFabricApi(mcVersion, profileDir, event) {
  try {
    const modsDir = path.join(profileDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    
    // Check if any fabric-api jar already exists
    const files = fs.readdirSync(modsDir);
    const hasFabricApi = files.some(file => file.toLowerCase().includes('fabric-api') || file.toLowerCase().includes('fabricapi'));
    
    if (hasFabricApi) {
      console.log('[FABRIC API] Fabric API is already present in mods folder.');
      return;
    }
    
    console.log(`[FABRIC API] Fabric API is missing. Fetching compatible version from Modrinth for MC ${mcVersion}...`);
    event.sender.send('launch-log', 'Fabric API library missing. Fetching dependency from Modrinth...');
    
    // Project ID for Fabric API on Modrinth: P7dR8mSH
    const url = `https://api.modrinth.com/v2/project/P7dR8mSH/version?loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${mcVersion}"]`)}`;
    
    const runtimeDir = path.join(GAME_DIR, 'runtime');
    const tempPath = path.join(runtimeDir, 'temp_fabric_api.json');
    if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
    
    await downloadFile(url, tempPath);
    const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
    try { fs.unlinkSync(tempPath); } catch (e) {}
    
    if (!data || data.length === 0) {
      console.warn(`[FABRIC API] No compatible Fabric API found on Modrinth for MC ${mcVersion}.`);
      return;
    }
    
    const latestVersion = data[0];
    const file = latestVersion.files.find(f => f.primary) || latestVersion.files[0];
    if (!file) {
      console.warn('[FABRIC API] No files found in the Fabric API version package.');
      return;
    }
    
    const destPath = path.join(modsDir, file.filename);
    console.log(`[FABRIC API] Downloading ${file.filename} to ${destPath}...`);
    event.sender.send('launch-log', `Downloading Fabric API library dependency: ${file.filename}`);
    
    await downloadFile(file.url, destPath);
    console.log('[FABRIC API] Fabric API downloaded successfully.');
    event.sender.send('launch-log', 'Fabric API dependency downloaded and installed successfully.');
  } catch (err) {
    console.error('[FABRIC API] Failed to ensure Fabric API:', err);
    event.sender.send('launch-log', `Warning: Failed to auto-install Fabric API: ${err.message}`);
  }
}

// Ensure CustomSkinLoader is downloaded for offline skins
async function ensureCustomSkinLoader(mcVersion, profileDir, loaderType, event) {
  try {
    const modsDir = path.join(profileDir, 'mods');
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    }
    
    // Check if any customskinloader jar already exists
    const files = fs.readdirSync(modsDir);
    const hasMod = files.some(file => file.toLowerCase().includes('customskinloader'));
    
    if (hasMod) {
      console.log('[SKIN LOADER] CustomSkinLoader is already present in mods folder.');
      return;
    }
    
    console.log(`[SKIN LOADER] CustomSkinLoader is missing. Fetching compatible version from Modrinth for MC ${mcVersion} (${loaderType})...`);
    event.sender.send('launch-log', 'Offline skin support library missing. Fetching CustomSkinLoader from Modrinth...');
    
    const url = `https://api.modrinth.com/v2/project/customskinloader/version?loaders=${encodeURIComponent('["' + loaderType + '"]')}&game_versions=${encodeURIComponent('["' + mcVersion + '"]')}`;
    
    const runtimeDir = path.join(GAME_DIR, 'runtime');
    const tempPath = path.join(runtimeDir, 'temp_skin_loader.json');
    if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });
    
    await downloadFile(url, tempPath);
    const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
    try { fs.unlinkSync(tempPath); } catch (e) {}
    
    if (!data || data.length === 0) {
      console.warn(`[SKIN LOADER] No compatible CustomSkinLoader found on Modrinth for MC ${mcVersion} (${loaderType}).`);
      return;
    }
    
    const latestVersion = data[0];
    const file = latestVersion.files.find(f => f.primary) || latestVersion.files[0];
    if (!file) {
      console.warn('[SKIN LOADER] No files found in the CustomSkinLoader version package.');
      return;
    }
    
    const destPath = path.join(modsDir, file.filename);
    console.log(`[SKIN LOADER] Downloading ${file.filename} to ${destPath}...`);
    event.sender.send('launch-log', `Downloading CustomSkinLoader for offline skins: ${file.filename}`);
    
    await downloadFile(file.url, destPath);
    console.log('[SKIN LOADER] CustomSkinLoader downloaded successfully.');
    event.sender.send('launch-log', 'Offline skin loader mod downloaded and installed successfully.');
  } catch (err) {
    console.error('[SKIN LOADER] Failed to ensure CustomSkinLoader:', err);
    event.sender.send('launch-log', `Warning: Failed to auto-install CustomSkinLoader: ${err.message}`);
  }
}

// Determine resource pack format version based on Minecraft version string
function getPackFormat(versionStr) {
  const parts = versionStr.split('.');
  let major = 0;
  let minor = 0;
  if (parts[0] === '1') {
    major = parseInt(parts[1]) || 0;
    minor = parseInt(parts[2]) || 0;
  } else {
    major = parseInt(parts[0]) || 0;
    minor = parseInt(parts[1]) || 0;
  }
  
  if (major >= 21) {
    if (minor >= 5) return 48;
    if (minor >= 4) return 46;
    if (minor >= 2) return 42;
    return 34;
  }
  if (major >= 20) {
    if (minor >= 5) return 32;
    if (minor >= 3) return 22;
    if (minor >= 2) return 18;
    return 15;
  }
  if (major >= 19) {
    if (minor >= 4) return 13;
    if (minor >= 3) return 12;
    return 9;
  }
  if (major >= 18) return 8;
  if (major >= 17) return 7;
  if (major >= 16) return 6;
  if (major >= 15) return 5;
  if (major >= 13) return 4;
  if (major >= 11) return 3;
  if (major >= 9) return 2;
  return 1;
}

// Auto-enable a resource pack in Minecraft's options.txt
function enableResourcePack(profileDir, packName) {
  const optionsPath = path.join(profileDir, 'options.txt');
  let options = '';
  if (fs.existsSync(optionsPath)) {
    options = fs.readFileSync(optionsPath, 'utf8');
  }
  
  const packEntry = `file/${packName}`;
  
  // Parse existing resourcePacks line
  const rpMatch = options.match(/^resourcePacks:\[.*\]$/m);
  if (rpMatch) {
    if (rpMatch[0].includes(packEntry)) {
      // Already enabled, nothing to do
    } else {
      const currentList = rpMatch[0].replace('resourcePacks:[', '').replace(/\]$/, '');
      const newList = currentList.trim() === '' ? `"${packEntry}"` : `${currentList},"${packEntry}"`;
      options = options.replace(rpMatch[0], `resourcePacks:[${newList}]`);
    }
  } else {
    options += `\nresourcePacks:["vanilla","${packEntry}"]`;
  }
  
  // Also add to incompatibleResourcePacks to suppress version warning
  const irpMatch = options.match(/^incompatibleResourcePacks:\[.*\]$/m);
  if (irpMatch) {
    if (!irpMatch[0].includes(packEntry)) {
      const currentList = irpMatch[0].replace('incompatibleResourcePacks:[', '').replace(/\]$/, '');
      const newList = currentList.trim() === '' ? `"${packEntry}"` : `${currentList},"${packEntry}"`;
      options = options.replace(irpMatch[0], `incompatibleResourcePacks:[${newList}]`);
    }
  } else {
    options += `\nincompatibleResourcePacks:["${packEntry}"]`;
  }
  
  fs.writeFileSync(optionsPath, options, 'utf8');
  console.log(`[SKIN PACK] Auto-enabled resource pack "${packEntry}" in options.txt`);
}

// Create an automatic resource pack from the user's active skin PNG
// This replaces the default Steve/Alex textures so the custom skin is visible in-game
// Works universally with vanilla, Fabric, and Forge — no mods required for skins
function createSkinResourcePack(profileDir, skinPngPath, mcVersion) {
  try {
    const packName = 'PramochakSkin';
    const packDir = path.join(profileDir, 'resourcepacks', packName);
    const packFormat = getPackFormat(mcVersion);
    
    // Create both modern (1.20+) and legacy texture paths for maximum compatibility
    const modernWideDir = path.join(packDir, 'assets', 'minecraft', 'textures', 'entity', 'player', 'wide');
    const modernSlimDir = path.join(packDir, 'assets', 'minecraft', 'textures', 'entity', 'player', 'slim');
    const legacyDir = path.join(packDir, 'assets', 'minecraft', 'textures', 'entity');
    
    fs.mkdirSync(modernWideDir, { recursive: true });
    fs.mkdirSync(modernSlimDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    
    // Copy skin to all 9 default player skin variants to ensure it works offline
    // since offline UUIDs can map to any of the 9 default character models
    const defaultSkins = ['steve.png', 'alex.png', 'ari.png', 'efe.png', 'kai.png', 'makena.png', 'noor.png', 'sunny.png', 'zuri.png'];
    for (const skinFile of defaultSkins) {
      fs.copyFileSync(skinPngPath, path.join(modernWideDir, skinFile));
      fs.copyFileSync(skinPngPath, path.join(modernSlimDir, skinFile));
    }
    
    // Copy to legacy paths as well
    fs.copyFileSync(skinPngPath, path.join(legacyDir, 'steve.png'));
    fs.copyFileSync(skinPngPath, path.join(legacyDir, 'alex.png'));
    
    // Create pack.mcmeta with wide supported_formats range for cross-version compat
    const packMcmeta = {
      pack: {
        pack_format: packFormat,
        supported_formats: { min_inclusive: 1, max_inclusive: 48 },
        description: "\u00a76Custom Skin \u00a77by \u00a7bPramochak Launcher"
      }
    };
    fs.writeFileSync(path.join(packDir, 'pack.mcmeta'), JSON.stringify(packMcmeta, null, 2), 'utf8');
    
    // Use the skin face as pack icon
    fs.copyFileSync(skinPngPath, path.join(packDir, 'pack.png'));
    
    // Auto-enable in options.txt
    enableResourcePack(profileDir, packName);
    
    console.log(`[SKIN PACK] Resource pack created at: ${packDir} (pack_format: ${packFormat})`);
    return true;
  } catch (err) {
    console.error('[SKIN PACK] Failed to create skin resource pack:', err);
    return false;
  }
}

// Create an automatic resource pack from the user's active cape PNG
// Replaces the elytra texture so the cape look is visible when wearing elytra
function createCapeResourcePack(profileDir, capePngPath, mcVersion) {
  try {
    const packName = 'PramochakCape';
    const packDir = path.join(profileDir, 'resourcepacks', packName);
    const packFormat = getPackFormat(mcVersion);
    
    // Elytra texture path (only visual way to show cape-like texture in vanilla)
    const elytraDir = path.join(packDir, 'assets', 'minecraft', 'textures', 'entity');
    fs.mkdirSync(elytraDir, { recursive: true });
    
    fs.copyFileSync(capePngPath, path.join(elytraDir, 'elytra.png'));
    
    const packMcmeta = {
      pack: {
        pack_format: packFormat,
        supported_formats: { min_inclusive: 1, max_inclusive: 48 },
        description: "\u00a76Custom Cape \u00a77by \u00a7bPramochak Launcher"
      }
    };
    fs.writeFileSync(path.join(packDir, 'pack.mcmeta'), JSON.stringify(packMcmeta, null, 2), 'utf8');
    fs.copyFileSync(capePngPath, path.join(packDir, 'pack.png'));
    
    enableResourcePack(profileDir, packName);
    
    console.log(`[CAPE PACK] Cape resource pack created at: ${packDir}`);
    return true;
  } catch (err) {
    console.error('[CAPE PACK] Failed to create cape resource pack:', err);
    return false;
  }
}

// Log any uncaught exceptions in the main process
process.on('uncaughtException', (error) => {
  console.error('--- UNCAUGHT EXCEPTION IN MAIN PROCESS ---');
  console.error(error);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('--- UNHANDLED REJECTION IN MAIN PROCESS ---');
  console.error(reason);
});

let mainWindow;
const launcher = new Client();

function createWindow() {
  console.log('Creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 640,
    frame: false,
    resizable: true, // Enable resizing and full screen maximizing
    show: true, // Show immediately
    backgroundColor: '#0a0b10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Handle window maximize/unmaximize state for responsive CSS styling
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-status', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-status', false);
  });

  // Log did-fail-load
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Page failed to load: ${errorDescription} (Error code: ${errorCode}) for URL: ${validatedURL}`);
  });

  // Log renderer console messages to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER CONSOLE] [Level ${level}] ${message} (at ${path.basename(sourceId)}:${line})`);
  });

  // Log renderer crash
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process crashed or went away:', details);
  });

  console.log('Loading index.html...');
  mainWindow.loadFile('index.html');

  // Focus the window when it is ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show fired!');
    mainWindow.focus();
  });

  // Open DevTools for debugging (remove in production)
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Cancel Launch IPC handler
ipcMain.on('cancel-launch', (event) => {
  console.log('--- cancel-launch IPC event received ---');
  isLaunchCancelled = true;
  if (activeRequest) {
    console.log('[CANCEL] Active HTTP request found, destroying...');
    try {
      activeRequest.destroy(new Error('Launch cancelled by user'));
    } catch (e) {
      console.error('Error destroying active request:', e);
    }
    activeRequest = null;
  }
  event.sender.send('launch-status', 'cancelled');
  event.sender.send('launch-log', 'Launch sequence cancelled by user.');
});

// Window controls IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Get world saves count IPC
ipcMain.handle('get-world-count', async (event, profileId) => {
  try {
    const gameDir = GAME_DIR;
    let savesDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
    } else {
      savesDir = path.join(gameDir, 'saves');
    }
    
    if (!fs.existsSync(savesDir)) {
      return 0;
    }
    
    const files = fs.readdirSync(savesDir, { withFileTypes: true });
    const dirCount = files.filter(dirent => dirent.isDirectory()).length;
    return dirCount;
  } catch (err) {
    console.error('Error scanning worlds directory:', err);
    return 0;
  }
});

// Binary NBT parser for Minecraft Java Edition level.dat files
function parseNBT(buffer) {
  let offset = 0;
  
  function readByte() {
    const val = buffer.readUInt8(offset);
    offset += 1;
    return val;
  }
  
  function readShort() {
    const val = buffer.readInt16BE(offset);
    offset += 2;
    return val;
  }
  
  function readInt() {
    const val = buffer.readInt32BE(offset);
    offset += 4;
    return val;
  }
  
  function readLong() {
    const high = buffer.readInt32BE(offset);
    const low = buffer.readInt32BE(offset + 4);
    offset += 8;
    return BigInt(high) * 4294967296n + BigInt(low >>> 0);
  }
  
  function readFloat() {
    const val = buffer.readFloatBE(offset);
    offset += 4;
    return val;
  }
  
  function readDouble() {
    const val = buffer.readDoubleBE(offset);
    offset += 8;
    return val;
  }
  
  function readString() {
    const len = buffer.readUInt16BE(offset);
    offset += 2;
    const str = buffer.toString('utf8', offset, offset + len);
    offset += len;
    return str;
  }
  
  function parseTag(type) {
    if (type === 1) return readByte();
    if (type === 2) return readShort();
    if (type === 3) return readInt();
    if (type === 4) return readLong();
    if (type === 5) return readFloat();
    if (type === 6) return readDouble();
    if (type === 7) {
      const len = readInt();
      const arr = buffer.subarray(offset, offset + len);
      offset += len;
      return arr;
    }
    if (type === 8) return readString();
    if (type === 9) {
      const elemType = readByte();
      const len = readInt();
      const list = [];
      for (let i = 0; i < len; i++) {
        list.push(parseTag(elemType));
      }
      return list;
    }
    if (type === 10) {
      const obj = {};
      while (true) {
        const nextType = readByte();
        if (nextType === 0) break; // TAG_End
        const name = readString();
        obj[name] = parseTag(nextType);
      }
      return obj;
    }
    if (type === 11) {
      const len = readInt();
      const arr = [];
      for (let i = 0; i < len; i++) {
        arr.push(readInt());
      }
      return arr;
    }
    if (type === 12) {
      const len = readInt();
      const arr = [];
      for (let i = 0; i < len; i++) {
        arr.push(readLong());
      }
      return arr;
    }
    throw new Error(`Unknown NBT tag type: ${type} at offset ${offset}`);
  }
  
  const rootType = readByte();
  if (rootType !== 10) {
    throw new Error(`Expected root tag of type 10, got ${rootType}`);
  }
  const rootName = readString();
  return parseTag(10);
}

// Asynchronously calculate directory size in bytes
async function getDirectorySizeAsync(dirPath) {
  let size = 0;
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const promises = files.map(async (file) => {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        return getDirectorySizeAsync(filePath);
      } else {
        const stat = await fs.promises.stat(filePath);
        return stat.size;
      }
    });
    const sizes = await Promise.all(promises);
    size = sizes.reduce((acc, val) => acc + val, 0);
  } catch (e) {}
  return size;
}

// Get full worlds list including metadata and thumbnail IPC
ipcMain.handle('get-worlds', async (event, profileId) => {
  try {
    const gameDir = GAME_DIR;
    let savesDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
    } else {
      savesDir = path.join(gameDir, 'saves');
    }
    
    if (!fs.existsSync(savesDir)) {
      return [];
    }
    
    const folders = fs.readdirSync(savesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
      
    const worlds = [];
    
    for (const folderName of folders) {
      const worldPath = path.join(savesDir, folderName);
      const levelDatPath = path.join(worldPath, 'level.dat');
      const iconPath = path.join(worldPath, 'icon.png');
      
      if (!fs.existsSync(levelDatPath)) {
        continue;
      }
      
      let worldName = folderName;
      let gameMode = 'Survival';
      let lastPlayed = Date.now();
      let versionName = 'Unknown';
      let sizeBytes = 0;
      let iconBase64 = null;
      
      try {
        sizeBytes = await getDirectorySizeAsync(worldPath);
      } catch (e) {}
      
      try {
        const compressed = fs.readFileSync(levelDatPath);
        const uncompressed = zlib.gunzipSync(compressed);
        const parsed = parseNBT(uncompressed);
        
        if (parsed && parsed.Data) {
          const data = parsed.Data;
          if (data.LevelName) {
            worldName = data.LevelName;
          }
          if (data.GameType !== undefined) {
            const modes = { 0: 'Survival', 1: 'Creative', 2: 'Adventure', 3: 'Spectator' };
            gameMode = modes[data.GameType] || 'Survival';
          }
          if (data.LastPlayed !== undefined) {
            lastPlayed = Number(data.LastPlayed);
          } else {
            const stat = fs.statSync(levelDatPath);
            lastPlayed = stat.mtimeMs;
          }
          if (data.Version && data.Version.Name) {
            versionName = data.Version.Name;
          }
        }
      } catch (nbtErr) {
        console.error(`Failed to parse level.dat for world ${folderName}:`, nbtErr);
        try {
          const stat = fs.statSync(levelDatPath);
          lastPlayed = stat.mtimeMs;
        } catch (e) {}
      }
      
      if (fs.existsSync(iconPath)) {
        try {
          const iconBuffer = fs.readFileSync(iconPath);
          iconBase64 = 'data:image/png;base64,' + iconBuffer.toString('base64');
        } catch (e) {}
      }
      
      worlds.push({
        folderName,
        worldName,
        gameMode,
        lastPlayed,
        versionName,
        sizeBytes,
        icon: iconBase64
      });
    }
    
    worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
    return worlds;
  } catch (err) {
    console.error('Error getting worlds list:', err);
    return [];
  }
});

// Delete world IPC
ipcMain.handle('delete-world', async (event, { profileId, folderName }) => {
  try {
    if (!folderName || typeof folderName !== 'string' || folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      throw new Error('Invalid folder name');
    }
    const gameDir = GAME_DIR;
    let savesDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
    } else {
      savesDir = path.join(gameDir, 'saves');
    }
    
    const worldPath = path.join(savesDir, folderName);
    if (fs.existsSync(worldPath)) {
      fs.rmSync(worldPath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: 'World not found' };
  } catch (err) {
    console.error('Error deleting world:', err);
    return { success: false, error: err.message };
  }
});

// Backup world IPC (creates .zip using PowerShell)
ipcMain.handle('backup-world', async (event, { profileId, folderName, worldName }) => {
  try {
    if (!folderName || typeof folderName !== 'string' || folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      throw new Error('Invalid folder name');
    }
    const gameDir = GAME_DIR;
    let savesDir;
    let backupsDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
      backupsDir = path.join(gameDir, 'instances', profileId, 'backups');
    } else {
      savesDir = path.join(gameDir, 'saves');
      backupsDir = path.join(gameDir, 'backups');
    }
    
    const worldPath = path.join(savesDir, folderName);
    if (!fs.existsSync(worldPath)) {
      return { success: false, error: 'World not found' };
    }
    
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    const cleanWorldName = (worldName || folderName).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupZipName = `${cleanWorldName}_Backup_${timestamp}.zip`;
    const backupZipPath = path.join(backupsDir, backupZipName);
    
    const escapedSrc = worldPath.replace(/'/g, "''");
    const escapedZip = backupZipPath.replace(/'/g, "''");
    
    const cmd = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${escapedSrc}', '${escapedZip}')`;
    
    return new Promise((resolve) => {
      exec(`powershell -NoProfile -Command "${cmd}"`, (err, stdout, stderr) => {
        if (err) {
          console.error('PowerShell backup error:', stderr || err.message);
          resolve({ success: false, error: stderr || err.message });
        } else {
          resolve({ success: true, backupPath: backupZipPath });
        }
      });
    });
  } catch (err) {
    console.error('Error backing up world:', err);
    return { success: false, error: err.message };
  }
});

// Open saves folder IPC
ipcMain.handle('open-saves-folder', async (event, profileId) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    const gameDir = GAME_DIR;
    let savesDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
    } else {
      savesDir = path.join(gameDir, 'saves');
    }
    if (!fs.existsSync(savesDir)) {
      fs.mkdirSync(savesDir, { recursive: true });
    }
    await shell.openPath(savesDir);
    return { success: true };
  } catch (err) {
    console.error('Error opening saves folder:', err);
    return { success: false, error: err.message };
  }
});

// Open specific world folder IPC
ipcMain.handle('open-world-folder', async (event, { profileId, folderName }) => {
  try {
    if (!folderName || typeof folderName !== 'string' || folderName.includes('..') || folderName.includes('/') || folderName.includes('\\')) {
      throw new Error('Invalid folder name');
    }
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    const gameDir = GAME_DIR;
    let savesDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      savesDir = path.join(gameDir, 'instances', profileId, 'saves');
    } else {
      savesDir = path.join(gameDir, 'saves');
    }
    const worldPath = path.join(savesDir, folderName);
    if (!fs.existsSync(worldPath)) {
      return { success: false, error: 'World not found' };
    }
    await shell.openPath(worldPath);
    return { success: true };
  } catch (err) {
    console.error('Error opening world folder:', err);
    return { success: false, error: err.message };
  }
});

// Get Installed Resource Packs IPC
ipcMain.handle('get-installed-resourcepacks', async (event, profileId) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    
    const gameDir = GAME_DIR;
    let packDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      packDir = path.join(gameDir, 'instances', profileId, 'resourcepacks');
    } else {
      packDir = path.join(gameDir, 'resourcepacks');
    }
    
    if (!fs.existsSync(packDir)) {
      return [];
    }
    
    const files = fs.readdirSync(packDir, { withFileTypes: true });
    const packs = [];
    const tempDir = path.join(gameDir, 'runtime', 'temp_packs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    for (const file of files) {
      const isDir = file.isDirectory();
      const isZip = file.isFile() && file.name.toLowerCase().endsWith('.zip');
      
      if (!isDir && !isZip) continue;
      
      const fullPath = path.join(packDir, file.name);
      let packName = file.name;
      let description = 'No description provided';
      let packFormat = 0;
      let iconBase64 = null;
      let sizeBytes = 0;
      
      try {
        const stat = fs.statSync(fullPath);
        sizeBytes = stat.size;
      } catch (e) {}
      
      if (isDir) {
        const mcmetaPath = path.join(fullPath, 'pack.mcmeta');
        const pngPath = path.join(fullPath, 'pack.png');
        
        if (fs.existsSync(mcmetaPath)) {
          try {
            const raw = fs.readFileSync(mcmetaPath, 'utf8');
            const meta = JSON.parse(raw);
            if (meta && meta.pack) {
              if (meta.pack.description) {
                description = typeof meta.pack.description === 'string' ? meta.pack.description : (meta.pack.description.text || JSON.stringify(meta.pack.description));
              }
              if (meta.pack.pack_format !== undefined) {
                packFormat = meta.pack.pack_format;
              }
            }
          } catch (e) {}
        }
        
        if (fs.existsSync(pngPath)) {
          try {
            iconBase64 = 'data:image/png;base64,' + fs.readFileSync(pngPath, 'base64');
          } catch (e) {}
        }
      } else if (isZip) {
        const uniqueId = Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const mcmetaDest = path.join(tempDir, `pack_${uniqueId}.mcmeta`);
        const pngDest = path.join(tempDir, `pack_${uniqueId}.png`);
        
        const escapedZip = fullPath.replace(/'/g, "''");
        const escapedMcmeta = mcmetaDest.replace(/'/g, "''");
        const escapedPng = pngDest.replace(/'/g, "''");
        
        const cmd = `
          Add-Type -AssemblyName System.IO.Compression.FileSystem;
          $zip = [System.IO.Compression.ZipFile]::OpenRead('${escapedZip}');
          $mcmeta = $zip.Entries | Where-Object { $_.FullName -eq 'pack.mcmeta' };
          if ($mcmeta) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($mcmeta, '${escapedMcmeta}', $true); }
          $png = $zip.Entries | Where-Object { $_.FullName -eq 'pack.png' };
          if ($png) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($png, '${escapedPng}', $true); }
          $zip.Dispose();
        `;
        
        await new Promise((resolve) => {
          exec(`powershell -NoProfile -Command "${cmd}"`, () => {
            resolve();
          });
        });
        
        if (fs.existsSync(mcmetaDest)) {
          try {
            const raw = fs.readFileSync(mcmetaDest, 'utf8');
            const meta = JSON.parse(raw);
            if (meta && meta.pack) {
              if (meta.pack.description) {
                description = typeof meta.pack.description === 'string' ? meta.pack.description : (meta.pack.description.text || JSON.stringify(meta.pack.description));
              }
              if (meta.pack.pack_format !== undefined) {
                packFormat = meta.pack.pack_format;
              }
            }
          } catch (e) {}
          try { fs.unlinkSync(mcmetaDest); } catch (e) {}
        }
        
        if (fs.existsSync(pngDest)) {
          try {
            iconBase64 = 'data:image/png;base64,' + fs.readFileSync(pngDest, 'base64');
          } catch (e) {}
          try { fs.unlinkSync(pngDest); } catch (e) {}
        }
      }
      
      packs.push({
        filename: file.name,
        packName,
        description,
        packFormat,
        icon: iconBase64,
        sizeBytes,
        isFolder: isDir
      });
    }
    
    return packs;
  } catch (err) {
    console.error('Error getting installed resource packs:', err);
    return [];
  }
});

// Delete Resource Pack IPC
ipcMain.handle('delete-resourcepack', async (event, { profileId, filename }) => {
  try {
    if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    
    const gameDir = GAME_DIR;
    let packDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      packDir = path.join(gameDir, 'instances', profileId, 'resourcepacks');
    } else {
      packDir = path.join(gameDir, 'resourcepacks');
    }
    
    const packPath = path.join(packDir, filename);
    if (fs.existsSync(packPath)) {
      fs.rmSync(packPath, { recursive: true, force: true });
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (err) {
    console.error('Error deleting resource pack:', err);
    return { success: false, error: err.message };
  }
});

// Download Resource Pack IPC
ipcMain.handle('download-resourcepack', async (event, { profileId, packUrl, filename }) => {
  try {
    if (!profileId || typeof profileId !== 'string' || profileId.includes('..') || profileId.includes('/') || profileId.includes('\\')) {
      throw new Error('Invalid profile ID');
    }
    if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    if (!packUrl.startsWith('https://cdn.modrinth.com/') && !packUrl.startsWith('https://cdn-raw.modrinth.com/')) {
      throw new Error('Insecure download source. Only Modrinth CDN is allowed.');
    }
    
    const gameDir = GAME_DIR;
    let packDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      packDir = path.join(gameDir, 'instances', profileId, 'resourcepacks');
    } else {
      packDir = path.join(gameDir, 'resourcepacks');
    }
    
    if (!fs.existsSync(packDir)) {
      fs.mkdirSync(packDir, { recursive: true });
    }
    
    const destPath = path.join(packDir, filename);
    await downloadFile(packUrl, destPath);
    return { success: true };
  } catch (err) {
    console.error('Error downloading resource pack:', err);
    return { success: false, error: err.message };
  }
});

// Import custom resource pack dialog IPC
ipcMain.handle('import-resourcepack', async (event, profileId) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Resource Pack (.zip)',
      filters: [
        { name: 'Resource Packs', extensions: ['zip'] }
      ],
      properties: ['openFile']
    });
    
    if (canceled || filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    
    const zipPath = filePaths[0];
    const gameDir = GAME_DIR;
    let packDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      packDir = path.join(gameDir, 'instances', profileId, 'resourcepacks');
    } else {
      packDir = path.join(gameDir, 'resourcepacks');
    }
    
    if (!fs.existsSync(packDir)) {
      fs.mkdirSync(packDir, { recursive: true });
    }
    
    const destName = path.basename(zipPath);
    const destPath = path.join(packDir, destName);
    fs.copyFileSync(zipPath, destPath);
    
    return { success: true, filename: destName };
  } catch (err) {
    console.error('Error importing resource pack:', err);
    return { success: false, error: err.message };
  }
});

// Open resource packs folder IPC
ipcMain.handle('open-resourcepacks-folder', async (event, profileId) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    const gameDir = GAME_DIR;
    let packDir;
    if (profileId && profileId !== 'default' && profileId !== '') {
      packDir = path.join(gameDir, 'instances', profileId, 'resourcepacks');
    } else {
      packDir = path.join(gameDir, 'resourcepacks');
    }
    if (!fs.existsSync(packDir)) {
      fs.mkdirSync(packDir, { recursive: true });
    }
    await shell.openPath(packDir);
    return { success: true };
  } catch (err) {
    console.error('Error opening resource packs folder:', err);
    return { success: false, error: err.message };
  }
});

// Fetch Minecraft Versions list from Mojang API
ipcMain.handle('fetch-mc-versions', async () => {
  const VERSION_MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const tempManifestPath = path.join(runtimeDir, 'temp_manifest.json');
  
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  
  try {
    console.log('[MANIFEST] Fetching Minecraft version manifest...');
    await downloadFile(VERSION_MANIFEST_URL, tempManifestPath);
    const data = fs.readFileSync(tempManifestPath, 'utf8');
    const manifest = JSON.parse(data);
    
    // Sort versions
    const releases = manifest.versions.filter(v => v.type === 'release').map(v => v.id);
    const snapshots = manifest.versions.filter(v => v.type === 'snapshot').map(v => v.id);
    
    // Clean up temp manifest
    try { fs.unlinkSync(tempManifestPath); } catch (e) {}
    
    return {
      releases,
      snapshots,
      latest: manifest.latest
    };
  } catch (err) {
    console.error('[MANIFEST] Error fetching manifest, using fallback:', err);
    try { fs.unlinkSync(tempManifestPath); } catch (e) {}
    return {
      releases: ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'],
      snapshots: ['1.21.5-pre1'],
      latest: { release: '1.21.4', snapshot: '1.21.5-pre1' }
    };
  }
});

// Download Mod IPC
ipcMain.handle('download-mod', async (event, { profileId, modUrl, filename }) => {
  console.log(`[MOD DOWNLOAD] Request to download mod for profile ${profileId}: ${filename}`);
  try {
    // Validate inputs to prevent directory traversal
    if (!profileId || typeof profileId !== 'string' || profileId.includes('..') || profileId.includes('/') || profileId.includes('\\')) {
      throw new Error('Invalid profile ID');
    }
    if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    
    // Ensure URL is a secure Modrinth CDN URL
    if (!modUrl.startsWith('https://cdn.modrinth.com/') && !modUrl.startsWith('https://cdn-raw.modrinth.com/')) {
      throw new Error('Insecure mod download source. Only Modrinth CDN is allowed.');
    }

    const gameDir = GAME_DIR;
    const profileModsDir = path.join(gameDir, 'instances', profileId, 'mods');
    
    if (!fs.existsSync(profileModsDir)) {
      fs.mkdirSync(profileModsDir, { recursive: true });
    }

    const destPath = path.join(profileModsDir, filename);
    console.log(`[MOD DOWNLOAD] Downloading to: ${destPath}`);

    // Re-use our secure downloadFile function
    await downloadFile(modUrl, destPath);
    console.log(`[MOD DOWNLOAD] Mod ${filename} downloaded successfully.`);
    return { success: true };
  } catch (err) {
    console.error('[MOD DOWNLOAD] Error downloading mod:', err);
    return { success: false, error: err.message };
  }
});

// Get Installed Mods IPC
ipcMain.handle('get-installed-mods', async (event, profileId) => {
  try {
    if (!profileId || typeof profileId !== 'string' || profileId.includes('..') || profileId.includes('/') || profileId.includes('\\')) {
      throw new Error('Invalid profile ID');
    }
    const gameDir = GAME_DIR;
    const profileModsDir = path.join(gameDir, 'instances', profileId, 'mods');
    if (!fs.existsSync(profileModsDir)) {
      return [];
    }
    const files = fs.readdirSync(profileModsDir);
    // Filter to only include .jar files
    const jarFiles = files.filter(file => file.toLowerCase().endsWith('.jar'));
    return jarFiles;
  } catch (err) {
    console.error('Error getting installed mods:', err);
    return [];
  }
});

// Delete Mod IPC
ipcMain.handle('delete-mod', async (event, { profileId, filename }) => {
  try {
    if (!profileId || typeof profileId !== 'string' || profileId.includes('..') || profileId.includes('/') || profileId.includes('\\')) {
      throw new Error('Invalid profile ID');
    }
    if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    const gameDir = GAME_DIR;
    const modPath = path.join(gameDir, 'instances', profileId, 'mods', filename);
    if (fs.existsSync(modPath)) {
      fs.unlinkSync(modPath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (err) {
    console.error('Error deleting mod:', err);
    return { success: false, error: err.message };
  }
});

// Open Profile Instance Folder IPC
ipcMain.handle('open-profile-folder', async (event, profileId) => {
  try {
    if (!profileId || typeof profileId !== 'string' || profileId.includes('..') || profileId.includes('/') || profileId.includes('\\')) {
      throw new Error('Invalid profile ID');
    }
    const gameDir = GAME_DIR;
    const profileDir = path.join(gameDir, 'instances', profileId);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    await shell.openPath(profileDir);
    return { success: true };
  } catch (err) {
    console.error('Error opening profile folder:', err);
    return { success: false, error: err.message };
  }
});

const { exec } = require('child_process');

// Recursive folder copy helper
function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  const files = fs.readdirSync(from);
  for (const file of files) {
    const fromPath = path.join(from, file);
    const toPath = path.join(to, file);
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

// Extract ZIP via PowerShell Add-Type / ZipFile API
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const escapedZip = zipPath.replace(/'/g, "''");
      const escapedDest = destDir.replace(/'/g, "''");
      const cmd = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${escapedZip}', '${escapedDest}')`;
      
      exec(`powershell -NoProfile -Command "${cmd}"`, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Failed to extract ZIP: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Select and Install Modpack IPC Handler
ipcMain.handle('select-and-install-modpack', async (event) => {
  console.log('[MODPACK] Triggered modpack installer dialog');
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Modpack File (.zip or .mrpack)',
      filters: [
        { name: 'Modpacks', extensions: ['zip', 'mrpack'] }
      ],
      properties: ['openFile']
    });
    
    if (canceled || filePaths.length === 0) {
      return { success: false, error: 'Cancelled' };
    }
    
    const zipPath = filePaths[0];
    const runtimeDir = path.join(GAME_DIR, 'runtime');
    const tempExtractDir = path.join(runtimeDir, `temp_modpack_${Date.now()}`);
    
    event.sender.send('modpack-install-progress', { status: 'extracting', pct: 10, log: 'Extracting modpack archive...' });
    await extractZip(zipPath, tempExtractDir);
    
    // Detect if Modrinth MRPack
    const modrinthIndexPath = path.join(tempExtractDir, 'modrinth.index.json');
    if (fs.existsSync(modrinthIndexPath)) {
      event.sender.send('modpack-install-progress', { status: 'parsing', pct: 20, log: 'Detected Modrinth modpack. Parsing metadata...' });
      const index = JSON.parse(fs.readFileSync(modrinthIndexPath, 'utf8'));
      const name = index.name || 'Modrinth Modpack';
      
      let mcVersion = index.dependencies?.minecraft || '1.20.1';
      
      // Validate Minecraft version format (catches modpack configuration errors like "26.1.2")
      function isValidMinecraftVersion(ver) {
        if (!ver || typeof ver !== 'string') return false;
        if (/^\d+(\.\d+)*(-.*)?$/.test(ver)) return true; // Matches 1.x.x, 26.1.2, 26.1-rc.2, 26.1-, etc.
        if (/^\d{2}w\d{2}[a-z]$/.test(ver)) return true; // Snapshot e.g. 24w12a
        if (ver.startsWith('b1.') || ver.startsWith('a1.')) return true; // Alpha/Beta
        return false;
      }
      
      if (!isValidMinecraftVersion(mcVersion)) {
        console.warn(`[MODPACK] Modpack index specified an invalid Minecraft version: "${mcVersion}". Falling back to 1.20.1.`);
        event.sender.send('modpack-install-progress', {
          status: 'parsing',
          pct: 20,
          log: `[WARNING] Modpack specified an invalid Minecraft version: "${mcVersion}". Falling back to 1.20.1.`
        });
        mcVersion = '1.20.1';
      }
      
      const loaderRaw = index.dependencies?.['fabric-loader'] ? 'fabric' : (index.dependencies?.['forge'] ? 'forge' : 'vanilla');
      const modloaderVersion = index.dependencies?.['fabric-loader'] || index.dependencies?.['forge'] || '';
      
      const profileId = `profile-modpack-${Date.now()}`;
      const profileDir = path.join(GAME_DIR, 'instances', profileId);
      
      // Copy overrides first
      const overridesDir = path.join(tempExtractDir, 'overrides');
      if (fs.existsSync(overridesDir)) {
        event.sender.send('modpack-install-progress', { status: 'overrides', pct: 30, log: 'Copying config overrides...' });
        copyFolderSync(overridesDir, profileDir);
      }
      
      // Download files
      const filesToDownload = index.files || [];
      const totalFiles = filesToDownload.length;
      event.sender.send('modpack-install-progress', { status: 'downloading', pct: 40, log: `Starting download of ${totalFiles} files...` });
      
      for (let i = 0; i < totalFiles; i++) {
        const file = filesToDownload[i];
        if (file.env?.client === 'unsupported') {
          continue; // Skip server-only files
        }
        
        const destFile = path.join(profileDir, file.path);
        const destFolder = path.dirname(destFile);
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder, { recursive: true });
        }
        
        const fileUrl = file.downloads[0];
        const filename = path.basename(file.path);
        
        event.sender.send('modpack-install-progress', {
          status: 'downloading',
          pct: Math.round(40 + (i / totalFiles) * 55),
          log: `[${i+1}/${totalFiles}] Downloading: ${filename}`
        });
        
        try {
          await downloadFile(fileUrl, destFile);
        } catch (downloadErr) {
          console.error(`[MODPACK] Failed to download mod file: ${filename}`, downloadErr);
          event.sender.send('modpack-install-progress', {
            status: 'downloading',
            pct: Math.round(40 + (i / totalFiles) * 55),
            log: `[WARNING] Failed to download ${filename}: ${downloadErr.message}. Skipping...`
          });
        }
      }
      
      // Clean up temp
      try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) {}
      
      event.sender.send('modpack-install-progress', { status: 'completed', pct: 100, log: 'Modpack installed successfully!' });
      
      return {
        success: true,
        profile: {
          id: profileId,
          name: name,
          version: mcVersion,
          modloader: loaderRaw,
          modloaderVersion: modloaderVersion,
          icon: 'chest',
          ram: '4096'
        }
      };
    } else {
      // Local/Generic ZIP import
      event.sender.send('modpack-install-progress', { status: 'parsing', pct: 20, log: 'Generic ZIP modpack detected. Searching for mods...' });
      
      // Helper to find folder containing mods or configs (robust version)
      function findGameRoot(dir) {
        try {
          const files = fs.readdirSync(dir);
          if (files.includes('mods') || files.includes('config') || files.includes('resourcepacks')) {
            return dir;
          }
          for (const file of files) {
            const fullPath = path.join(dir, file);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                const found = findGameRoot(fullPath);
                if (found) return found;
              }
            } catch (e) {}
          }
        } catch (e) {}
        return null;
      }
      
      const gameRoot = findGameRoot(tempExtractDir) || tempExtractDir;
      const profileId = `profile-custom-${Date.now()}`;
      const profileDir = path.join(GAME_DIR, 'instances', profileId);
      
      event.sender.send('modpack-install-progress', { status: 'overrides', pct: 50, log: 'Copying ZIP contents to profile folder...' });
      copyFolderSync(gameRoot, profileDir);
      
      // Clean up temp
      try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) {}
      
      const hasMods = fs.existsSync(path.join(profileDir, 'mods'));
      
      event.sender.send('modpack-install-progress', { status: 'completed', pct: 100, log: 'Modpack installed successfully!' });
      
      return {
        success: true,
        profile: {
          id: profileId,
          name: path.basename(zipPath, path.extname(zipPath)),
          version: '1.20.1', // Default fallbacks
          modloader: hasMods ? 'fabric' : 'vanilla',
          icon: 'package',
          ram: '4096'
        }
      };
    }
  } catch (err) {
    console.error('[MODPACK] Installation failed:', err);
    return { success: false, error: err.message };
  }
});

// Get Storage Root Path IPC
ipcMain.handle('get-storage-path', () => GAME_DIR);

// Persistence Configuration File Path
const CONFIG_PATH = path.join(GAME_DIR, 'launcher_config.json');

function readLauncherConfig() {
  const defaults = {
    username: 'Pramochak_MC',
    ram: '4096',
    javaPath: '',
    resWidth: '854',
    resHeight: '480',
    activeProfileId: '',
    profiles: []
  };
  
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      if (data.trim() === '') return defaults;
      const parsed = JSON.parse(data);
      return Object.assign({}, defaults, parsed);
    }
  } catch (err) {
    console.error('[CONFIG] Error reading config file:', err);
  }
  return defaults;
}

function writeLauncherConfig(config) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[CONFIG] Error writing config file:', err);
    return false;
  }
}

ipcMain.handle('get-launcher-config', () => {
  return readLauncherConfig();
});

ipcMain.handle('set-launcher-config', (event, config) => {
  return writeLauncherConfig(config);
});

// Save Active Skin & Cape IPC
ipcMain.handle('save-active-skin-cape', async (event, { username, skinBase64, capeBase64, modelType }) => {
  try {
    if (!username || typeof username !== 'string' || username.includes('..') || username.includes('/') || username.includes('\\')) {
      throw new Error('Invalid username');
    }
    
    const gameDir = GAME_DIR;
    const skinsDir = path.join(gameDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
    const capesDir = path.join(gameDir, 'CustomSkinLoader', 'LocalSkin', 'capes');
    
    if (!fs.existsSync(skinsDir)) fs.mkdirSync(skinsDir, { recursive: true });
    if (!fs.existsSync(capesDir)) fs.mkdirSync(capesDir, { recursive: true });
    
    if (skinBase64) {
      const skinPath = path.join(skinsDir, `${username}.png`);
      const base64Data = skinBase64.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(skinPath, base64Data, 'base64');
      
      const cacheDir = path.join(gameDir, 'skins');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'active_skin.png'), base64Data, 'base64');
    }
    
    if (capeBase64) {
      const capePath = path.join(capesDir, `${username}.png`);
      const base64Data = capeBase64.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(capePath, base64Data, 'base64');
      
      const cacheDir = path.join(gameDir, 'skins');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, 'active_cape.png'), base64Data, 'base64');
    } else {
      const capePath = path.join(capesDir, `${username}.png`);
      if (fs.existsSync(capePath)) {
        try { fs.unlinkSync(capePath); } catch (e) {}
      }
      
      const cacheDir = path.join(gameDir, 'skins');
      const cacheCape = path.join(cacheDir, 'active_cape.png');
      if (fs.existsSync(cacheCape)) {
        try { fs.unlinkSync(cacheCape); } catch (e) {}
      }
    }
    
    const cacheDir = path.join(gameDir, 'skins');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'active_metadata.json'), JSON.stringify({
      username,
      modelType: modelType || 'classic'
    }), 'utf8');
    
    return { success: true };
  } catch (err) {
    console.error('Error saving active skin/cape:', err);
    return { success: false, error: err.message };
  }
});

// Load Active Skin & Cape IPC
ipcMain.handle('load-active-skin-cape', async (event, username) => {
  try {
    const gameDir = GAME_DIR;
    const cacheDir = path.join(gameDir, 'skins');
    const metadataPath = path.join(cacheDir, 'active_metadata.json');
    const skinPath = path.join(cacheDir, 'active_skin.png');
    const capePath = path.join(cacheDir, 'active_cape.png');
    
    let modelType = 'classic';
    let loadedUsername = username;
    
    if (fs.existsSync(metadataPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        modelType = meta.modelType || 'classic';
        loadedUsername = meta.username || username;
      } catch (e) {}
    }
    
    let skinBase64 = null;
    let capeBase64 = null;
    
    if (fs.existsSync(skinPath)) {
      skinBase64 = 'data:image/png;base64,' + fs.readFileSync(skinPath, 'base64');
    }
    if (fs.existsSync(capePath)) {
      capeBase64 = 'data:image/png;base64,' + fs.readFileSync(capePath, 'base64');
    }
    
    return {
      success: true,
      username: loadedUsername,
      skin: skinBase64,
      cape: capeBase64,
      modelType
    };
  } catch (err) {
    console.error('Error loading active skin/cape:', err);
    return { success: false, error: err.message };
  }
});

// Fetch Mojang Skin & Cape IPC
ipcMain.handle('fetch-mojang-skin-cape', async (event, username) => {
  try {
    if (!username || typeof username !== 'string' || username.includes('..') || username.includes('/') || username.includes('\\')) {
      throw new Error('Invalid username');
    }
    
    const skinUrl = `https://mc-heads.net/skin/${encodeURIComponent(username)}`;
    const capeUrl = `https://mc-heads.net/cape/${encodeURIComponent(username)}`;
    
    const downloadToBase64 = (url) => {
      return new Promise((resolve) => {
        const parsedUrl = urlModule.parse(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        protocol.get(url, (res) => {
          if (res.statusCode !== 200) {
            resolve(null);
            return;
          }
          
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
              resolve('data:image/png;base64,' + buffer.toString('base64'));
            } else {
              resolve(null);
            }
          });
        }).on('error', () => {
          resolve(null);
        });
      });
    };
    
    console.log(`[SKIN FETCH] Fetching skin for username: ${username}`);
    const skinBase64 = await downloadToBase64(skinUrl);
    
    console.log(`[SKIN FETCH] Fetching cape for username: ${username}`);
    const capeBase64 = await downloadToBase64(capeUrl);
    
    if (!skinBase64) {
      return { success: false, error: 'Skin not found or failed to fetch.' };
    }
    
    return {
      success: true,
      skin: skinBase64,
      cape: capeBase64,
      modelType: 'classic'
    };
  } catch (err) {
    console.error('Error fetching Mojang skin:', err);
    return { success: false, error: err.message };
  }
});

// Launch Game IPC
ipcMain.on('launch-game', async (event, options) => {
  console.log('--- launch-game IPC event received ---');
  console.log('Options:', options);
  isLaunchCancelled = false; // Reset cancellation state
  try {
    const username = options.username || 'Pramochak_MC';
    const version = options.version || '1.20.1';
    const ram = options.ram || '4096';
    
    // Construct game directory
    const gameDir = GAME_DIR;
    console.log('Game root directory:', gameDir);
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    // Resolve profile specific path for isolation (prevent mod conflict/world corruption)
    const profileId = options.profileId || 'default';
    const profileDir = path.join(gameDir, 'instances', profileId);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    console.log('[ISOLATION] Profile instances directory:', profileDir);

    // ===== UNIVERSAL SKIN SYSTEM =====
    // Method 1: Auto Resource Pack (works with ALL profiles: vanilla, Fabric, Forge)
    //   - Replaces default Steve/Alex textures so custom skin is visible in-game
    //   - No mods required at all
    // Method 2: CustomSkinLoader (Fabric/Forge only, adds cape support)
    //   - Handles capes which resource packs cannot do
    try {
      const activeSkinPath = path.join(gameDir, 'skins', 'active_skin.png');
      const activeCapePath = path.join(gameDir, 'skins', 'active_cape.png');
      
      // --- Resource Pack for Skin (Universal) ---
      if (fs.existsSync(activeSkinPath)) {
        const rpResult = createSkinResourcePack(profileDir, activeSkinPath, version);
        if (rpResult) {
          console.log(`[SKIN SYNC] Skin resource pack created and auto-enabled for profile: ${profileId}`);
          event.sender.send('launch-log', 'Custom skin applied via auto resource pack.');
        }
      }
      
      // --- Resource Pack for Cape (Elytra texture replacement, universal) ---
      if (fs.existsSync(activeCapePath)) {
        const capeResult = createCapeResourcePack(profileDir, activeCapePath, version);
        if (capeResult) {
          console.log(`[SKIN SYNC] Cape resource pack created for profile: ${profileId}`);
          event.sender.send('launch-log', 'Custom cape applied via auto resource pack (elytra texture).');
        }
      }
      
      // --- CustomSkinLoader files for Fabric/Forge (adds proper cape support via mod) ---
      if (options.modloader === 'fabric' || options.modloader === 'forge') {
        const profileSkinsDir = path.join(profileDir, 'CustomSkinLoader', 'LocalSkin', 'skins');
        const profileCapesDir = path.join(profileDir, 'CustomSkinLoader', 'LocalSkin', 'capes');
        
        if (fs.existsSync(activeSkinPath)) {
          if (!fs.existsSync(profileSkinsDir)) fs.mkdirSync(profileSkinsDir, { recursive: true });
          fs.copyFileSync(activeSkinPath, path.join(profileSkinsDir, `${username}.png`));
        }
        
        if (fs.existsSync(activeCapePath)) {
          if (!fs.existsSync(profileCapesDir)) fs.mkdirSync(profileCapesDir, { recursive: true });
          fs.copyFileSync(activeCapePath, path.join(profileCapesDir, `${username}.png`));
        } else {
          const profileCapeFile = path.join(profileCapesDir, `${username}.png`);
          if (fs.existsSync(profileCapeFile)) {
            try { fs.unlinkSync(profileCapeFile); } catch (e) {}
          }
        }

        // Pre-create CustomSkinLoader.json config for cape loading
        const configLoaderDir = path.join(profileDir, 'CustomSkinLoader');
        if (!fs.existsSync(configLoaderDir)) fs.mkdirSync(configLoaderDir, { recursive: true });
        const configLoaderPath = path.join(configLoaderDir, 'CustomSkinLoader.json');
        const loaderConfigJson = {
          "version": "14.20",
          "enable": true,
          "enableDynamicSkull": true,
          "enableTransparentSkin": true,
          "enableCape": true,
          "threadPoolSize": 1,
          "retryTime": 30,
          "cacheSkin": 600,
          "forceLoadAllTextures": false,
          "enableUpdateSkull": false,
          "enableLocalProfileCache": false,
          "enableCacheAutoClean": false,
          "loadlist": [
            {
              "name": "LocalSkin",
              "type": "Legacy",
              "checkPNG": false,
              "skin": "LocalSkin/skins/{USERNAME}.png",
              "model": "auto",
              "cape": "LocalSkin/capes/{USERNAME}.png",
              "elytra": "LocalSkin/elytras/{USERNAME}.png"
            },
            {
              "name": "Ely.by",
              "type": "ElyByAPI"
            },
            {
              "name": "Mojang",
              "type": "MojangAPI"
            }
          ]
        };
        fs.writeFileSync(configLoaderPath, JSON.stringify(loaderConfigJson, null, 2), 'utf8');
        console.log(`[SKIN SYNC] CustomSkinLoader config created for cape support.`);
      }
    } catch (err) {
      console.error('[SKIN SYNC] Failed during skin/cape sync:', err);
    }

    event.sender.send('launch-status', 'preparing');

    // Offline Authentication setup (cracked mode - username only)
    console.log('Setting up offline authentication for username:', username);
    const auth = Authenticator.getAuth(username);

    // MCLC configuration options - forcing HTTPS for secure downloads
    const opts = {
      authorization: auth,
      root: profileDir, // Isolate all game version, library, and asset downloads inside the profile directory
      overrides: {
        gameDirectory: profileDir
      },
      version: {
        number: version,
        type: 'release'
      },
      memory: {
        max: `${ram}M`,
        min: `${ram}M` // Aligned to prevent JVM heap resizing stutter
      },
      window: {
        width: parseInt(options.resolution.w) || 854,
        height: parseInt(options.resolution.h) || 480
      }
    };

    // If custom java path provided
    if (options.javaPath && options.javaPath.trim() !== '') {
      console.log('Using custom Java path:', options.javaPath);
      opts.javaPath = options.javaPath;
    } else {
      console.log('No custom Java path provided. Ensuring compatible Java runtime is installed...');
      const localJavaPath = await ensureJava(version, event);
      console.log('Using local Java runtime path:', localJavaPath);
      opts.javaPath = localJavaPath;
    }

    // Handle Forge / Fabric modloader setups
    if (options.modloader === 'fabric') {
      console.log('Fabric loader requested. Ensuring Fabric profile files are generated...');
      const fabricVersionId = await ensureFabric(version, profileDir, options.modloaderVersion, event);
      opts.version.custom = fabricVersionId;
      
      // Auto-download Fabric API library if missing to prevent incompatibilities
      await ensureFabricApi(version, profileDir, event);
      
      // Auto-download CustomSkinLoader if missing for offline skins
      await ensureCustomSkinLoader(version, profileDir, 'fabric', event);
    } else if (options.modloader === 'forge') {
      console.log('Forge loader requested. Ensuring Forge installer is cached...');
      const forgeInstaller = await ensureForge(version, event);
      opts.forge = forgeInstaller;
      
      // Auto-download CustomSkinLoader if missing for offline skins
      await ensureCustomSkinLoader(version, profileDir, 'forge', event);
    }


    // Performance optimization: Force Dedicated GPU on Windows dual-GPU laptops
    process.env.__NV_PRIME_RENDER_OFFLOAD = '1';
    process.env.__GLX_VENDOR_LIBRARY_NAME = 'nvidia';

    // Performance optimization: Add low-latency JVM arguments depending on Java version
    const javaVersion = getRequiredJavaVersion(version);
    opts.customArgs = [];
    if (javaVersion >= 21) {
      console.log('[OPTIMIZATION] Applying Generational ZGC low-latency flags for Java 21.');
      opts.customArgs.push('-XX:+UseZGC', '-XX:+ZGenerational');
    } else {
      console.log('[OPTIMIZATION] Applying optimized G1GC parameters for micro-stutter reduction.');
      opts.customArgs.push(
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:+AlwaysPreTouch',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
        '-XX:G1HeapWastePercent=5',
        '-XX:G1MixedGCCountTarget=4',
        '-XX:InitiatingHeapOccupancyPercent=15',
        '-XX:G1MixedGCLiveThresholdPercent=90',
        '-XX:G1RSetUpdatingPauseTimePercent=5',
        '-XX:SurvivorRatio=32',
        '-XX:+PerfDisableSharedMem',
        '-XX:MaxTenuringThreshold=1'
      );
    }

    // Support quickPlaySingleplayer parameter to deep-link directly into a world
    opts.customLaunchArgs = [];
    if (options.quickPlaySingleplayer) {
      console.log(`[QUICK LAUNCH] Adding singleplayer quickplay game arguments for folder: ${options.quickPlaySingleplayer}`);
      opts.customLaunchArgs.push('--quickPlaySingleplayer', options.quickPlaySingleplayer);
    }
    if (options.quickConnectServer) {
      console.log(`[QUICK CONNECT] Adding multiplayer quickconnect server: ${options.quickConnectServer}`);
      const parts = options.quickConnectServer.split(':');
      const srvHost = parts[0];
      const srvPort = parts[1] || '25565';
      opts.customLaunchArgs.push('--server', srvHost, '--port', srvPort);
    }

    console.log('Configured launcher options:', opts);

    // Remove old listeners to prevent stacking on repeated launches
    launcher.removeAllListeners();

    // Attach MCLC progress listeners
    launcher.on('debug', (data) => {
      if (isLaunchCancelled) return;
      console.log(`[MCLC DEBUG] ${data}`);
      if (mainWindow) event.sender.send('launch-log', `[DEBUG] ${data}`);
    });

    launcher.on('data', (data) => {
      if (isLaunchCancelled) return;
      const logLine = data.toString().trim();
      console.log(`[GAME LOG] ${logLine}`);
      if (mainWindow) event.sender.send('launch-log', logLine);
    });

    launcher.on('download', (fileName) => {
      if (isLaunchCancelled) return;
      console.log(`[DOWNLOAD] ${fileName}`);
      if (mainWindow) event.sender.send('launch-log', `Downloading: ${fileName}`);
    });

    // Pipe overall file progress events (assets, classes, natives counts)
    launcher.on('progress', (data) => {
      if (isLaunchCancelled) return;
      if (mainWindow) event.sender.send('launch-progress', data);
    });

    launcher.on('download-status', (data) => {
      if (isLaunchCancelled) return;
      // Skip file-level download-status for assets/natives/classes to let 'progress' handle overall progress smoothly
      if (data.type === 'assets' || data.type === 'natives' || data.type === 'classes') {
        return;
      }
      if (mainWindow) event.sender.send('launch-progress', data);
    });

    launcher.on('arguments', (args) => {
      if (isLaunchCancelled) return;
      console.log('JVM arguments generated:', args);
      if (mainWindow) {
        event.sender.send('launch-status', 'launching');
        event.sender.send('launch-log', 'Launching JVM process...');
      }
    });

    // Restore launcher when game closes
    launcher.on('close', (exitCode) => {
      if (isLaunchCancelled) return;
      console.log('Game process exited with code:', exitCode);
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        event.sender.send('launch-log', `Game exited with code ${exitCode}`);
        event.sender.send('launch-status', 'closed');
      }
    });

    console.log('Calling launcher.launch...');
    // Launch!
    const gameProcess = await launcher.launch(opts);
    console.log('launcher.launch() initiated successfully!');
    
    // Set high process priority for FPS stability and lower stuttering (1% lows)
    if (gameProcess && gameProcess.pid) {
      console.log(`[PROCESS PRIORITY] Setting high priority (PRIORITY_HIGH) for Minecraft process PID: ${gameProcess.pid}`);
      try {
        os.setPriority(gameProcess.pid, os.constants.priority.PRIORITY_HIGH);
      } catch (priorityErr) {
        console.error('Failed to set process priority:', priorityErr);
      }
    }
    
    // Hide window when game starts to free up all GPU/CPU resources from Electron
    if (mainWindow) {
      event.sender.send('launch-status', 'success');
      mainWindow.hide();
    }

  } catch (err) {
    console.error('Launch execution error in Main Process:', err);
    if (mainWindow) {
      event.sender.send('launch-error', err.message || err.toString());
    }
  }
});

const activeLocalServers = new Map();

// Helper to validate server hosts/ips securely
function validateHost(host) {
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const domainRegex = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  return host === 'localhost' || ipRegex.test(host) || domainRegex.test(host);
}

// Helpers for VarInt encoding/decoding
function writeVarInt(val) {
  let buf = [];
  while (true) {
    if ((val & 0xFFFFFF80) === 0) {
      buf.push(val);
      break;
    }
    buf.push((val & 0x7F) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(buf);
}

function readVarInt(buffer, offset = 0) {
  let val = 0;
  let len = 0;
  let b;
  do {
    if (offset + len >= buffer.length) {
      return null;
    }
    b = buffer.readUInt8(offset + len);
    val |= (b & 0x7F) << (7 * len);
    len++;
  } while (b & 0x80);
  return { value: val, length: len };
}

// NBT Serializer for servers.dat
function serializeServersNBT(servers) {
  let buffers = [];
  
  function writeByte(val) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(val, 0);
    buffers.push(buf);
  }
  
  function writeShort(val) {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(val, 0);
    buffers.push(buf);
  }
  
  function writeInt(val) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(val, 0);
    buffers.push(buf);
  }
  
  function writeString(str) {
    const strBuf = Buffer.from(str, 'utf8');
    writeShort(strBuf.length);
    buffers.push(strBuf);
  }

  // Root Compound
  writeByte(10);
  writeString("");

  // TAG_List "servers"
  writeByte(9);
  writeString("servers");
  writeByte(10); // TAG_Compound
  writeInt(servers.length);

  for (const s of servers) {
    writeByte(8); // TAG_String
    writeString("name");
    writeString(s.name || "");
    
    writeByte(8); // TAG_String
    writeString("ip");
    writeString(s.ip || "");

    if (s.icon) {
      writeByte(8); // TAG_String
      writeString("icon");
      writeString(s.icon);
    }
    
    if (s.acceptTextures !== undefined) {
      writeByte(1); // TAG_Byte
      writeString("acceptTextures");
      writeByte(Number(s.acceptTextures));
    }

    writeByte(0); // TAG_End
  }

  writeByte(0); // TAG_End

  return Buffer.concat(buffers);
}

// Low-level TCP Socket Minecraft Server Ping
function pingServer(host, port = 25565, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const startTime = Date.now();
    const socket = new net.Socket();
    let responseData = Buffer.alloc(0);
    let resolved = false;

    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const handshakeId = writeVarInt(0x00);
      const protocolVersion = writeVarInt(767); // 1.21
      const hostBuf = Buffer.from(host, 'utf8');
      const hostLen = writeVarInt(hostBuf.length);
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      const nextState = writeVarInt(1); // status

      const handshakePayload = Buffer.concat([handshakeId, protocolVersion, hostLen, hostBuf, portBuf, nextState]);
      const handshakePacket = Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]);

      const requestPacket = Buffer.from([0x01, 0x00]);

      socket.write(handshakePacket);
      socket.write(requestPacket);
    });

    socket.on('data', (chunk) => {
      responseData = Buffer.concat([responseData, chunk]);
      
      const lengthVarInt = readVarInt(responseData, 0);
      if (!lengthVarInt) return;

      const packetLength = lengthVarInt.value;
      const lengthBytes = lengthVarInt.length;

      if (responseData.length < lengthBytes + packetLength) {
        return;
      }

      try {
        const payload = responseData.slice(lengthBytes, lengthBytes + packetLength);
        const packetIdVarInt = readVarInt(payload, 0);
        if (!packetIdVarInt || packetIdVarInt.value !== 0x00) {
          throw new Error('Invalid packet ID');
        }

        const jsonLenVarInt = readVarInt(payload, packetIdVarInt.length);
        if (!jsonLenVarInt) {
          throw new Error('Could not parse JSON length');
        }

        const jsonOffset = packetIdVarInt.length + jsonLenVarInt.length;
        const jsonStr = payload.slice(jsonOffset, jsonOffset + jsonLenVarInt.value).toString('utf8');
        const info = JSON.parse(jsonStr);
        const latency = Date.now() - startTime;

        resolved = true;
        socket.destroy();
        resolve({
          online: true,
          latency,
          version: info.version ? info.version.name : 'Unknown',
          players: info.players ? info.players.online : 0,
          maxPlayers: info.players ? info.players.max : 0,
          description: info.description || '',
          favicon: info.favicon || null
        });
      } catch (err) {
        resolved = true;
        socket.destroy();
        reject(err);
      }
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        reject(new Error('Connection timed out'));
      }
    });
  });
}

// Download URL resolution helpers (Secured - only downloads from verified domains)
async function getVanillaServerJarUrl(version) {
  const manifestUrl = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const tempPath = path.join(runtimeDir, `manifest_${Date.now()}.json`);
  
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  await downloadFile(manifestUrl, tempPath);
  const manifest = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  const versionEntry = manifest.versions.find(v => v.id === version);
  try { fs.unlinkSync(tempPath); } catch (e) {}

  if (!versionEntry) throw new Error(`Version ${version} not found`);

  const verJsonPath = path.join(runtimeDir, `ver_${version}_${Date.now()}.json`);
  await downloadFile(versionEntry.url, verJsonPath);
  const verData = JSON.parse(fs.readFileSync(verJsonPath, 'utf8'));
  try { fs.unlinkSync(verJsonPath); } catch (e) {}

  if (!verData.downloads || !verData.downloads.server) {
    throw new Error(`No server jar download found for version ${version}`);
  }
  return verData.downloads.server.url;
}

async function getPaperServerJarUrl(version) {
  const versionsUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}`;
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const tempPath = path.join(runtimeDir, `paper_${version}_${Date.now()}.json`);

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  await downloadFile(versionsUrl, tempPath);
  const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  try { fs.unlinkSync(tempPath); } catch (e) {}

  if (!data.builds || data.builds.length === 0) {
    throw new Error(`No builds found for version ${version}`);
  }
  const latestBuild = data.builds[data.builds.length - 1];
  return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/paper-${version}-${latestBuild}.jar`;
}

async function getPurpurServerJarUrl(version) {
  const url = `https://api.purpurmc.org/v2/purpur/${version}`;
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const tempPath = path.join(runtimeDir, `purpur_${version}_${Date.now()}.json`);

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  await downloadFile(url, tempPath);
  const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  try { fs.unlinkSync(tempPath); } catch (e) {}

  if (!data.builds || !data.builds.all || data.builds.all.length === 0) {
    throw new Error(`No Purpur builds found for version ${version}`);
  }
  const latestBuild = data.builds.all[data.builds.all.length - 1];
  return `https://api.purpurmc.org/v2/purpur/${version}/${latestBuild}/download`;
}

async function getFabricServerJarUrl(version) {
  const loaderMetaUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}`;
  const installerMetaUrl = 'https://meta.fabricmc.net/v2/versions/installer';
  const runtimeDir = path.join(GAME_DIR, 'runtime');
  const tempLoader = path.join(runtimeDir, `loader_${Date.now()}.json`);
  const tempInstaller = path.join(runtimeDir, `installer_${Date.now()}.json`);

  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  await downloadFile(loaderMetaUrl, tempLoader);
  const loaders = JSON.parse(fs.readFileSync(tempLoader, 'utf8'));
  try { fs.unlinkSync(tempLoader); } catch (e) {}

  if (!loaders || loaders.length === 0) {
    throw new Error(`No Fabric loaders found for version ${version}`);
  }
  const loaderVersion = loaders[0].loader.version;

  await downloadFile(installerMetaUrl, tempInstaller);
  const installers = JSON.parse(fs.readFileSync(tempInstaller, 'utf8'));
  try { fs.unlinkSync(tempInstaller); } catch (e) {}

  if (!installers || installers.length === 0) {
    throw new Error(`No Fabric installers found`);
  }
  const installerVersion = installers[0].version;

  return `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
}

// REGISTER NEW IPC HANDLERS

// 1. Get Multiplayer Server List from servers.dat
ipcMain.handle('get-servers', async (event, profileId) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    
    let serversFile;
    if (profileId && profileId !== 'default' && profileId !== '') {
      serversFile = path.join(GAME_DIR, 'instances', profileId, 'servers.dat');
    } else {
      serversFile = path.join(GAME_DIR, 'servers.dat');
    }

    if (!fs.existsSync(serversFile)) {
      // Return default list if missing
      const defaults = [
        { name: 'Hypixel', ip: 'mc.hypixel.net' },
        { name: 'ManaCube', ip: 'play.manacube.com' },
        { name: 'Herobrine.org', ip: 'herobrine.org' },
        { name: 'BlocksMC', ip: 'blocksmc.com' }
      ];
      // Save it automatically
      const dir = path.dirname(serversFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(serversFile, serializeServersNBT(defaults));
      return defaults;
    }

    const data = fs.readFileSync(serversFile);
    const parsed = parseNBT(data);
    return parsed.servers || [];
  } catch (err) {
    console.error('Error getting servers:', err);
    return [];
  }
});

// 2. Save Multiplayer Server List to servers.dat
ipcMain.handle('save-servers', async (event, { profileId, serversList }) => {
  try {
    if (profileId && (profileId.includes('..') || profileId.includes('/') || profileId.includes('\\'))) {
      throw new Error('Invalid profile ID');
    }
    if (!Array.isArray(serversList)) {
      throw new Error('Invalid servers list');
    }

    let serversFile;
    if (profileId && profileId !== 'default' && profileId !== '') {
      serversFile = path.join(GAME_DIR, 'instances', profileId, 'servers.dat');
    } else {
      serversFile = path.join(GAME_DIR, 'servers.dat');
    }

    const dir = path.dirname(serversFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(serversFile, serializeServersNBT(serversList));
    return { success: true };
  } catch (err) {
    console.error('Error saving servers:', err);
    return { success: false, error: err.message };
  }
});

// 3. Ping Multiplayer Server
ipcMain.handle('ping-server', async (event, { host, port }) => {
  try {
    if (!host || typeof host !== 'string' || !validateHost(host)) {
      throw new Error('Invalid or unsafe hostname/IP');
    }
    const validatedPort = parseInt(port) || 25565;
    if (validatedPort < 1 || validatedPort > 65535) {
      throw new Error('Invalid port number');
    }

    const stats = await pingServer(host, validatedPort);
    return stats;
  } catch (err) {
    return { online: false, error: err.message };
  }
});

// 4. Get Local Servers List
ipcMain.handle('get-local-servers', async () => {
  try {
    const serversDir = path.join(GAME_DIR, 'servers');
    if (!fs.existsSync(serversDir)) {
      fs.mkdirSync(serversDir, { recursive: true });
      return [];
    }

    const files = fs.readdirSync(serversDir, { withFileTypes: true });
    const localServers = [];

    for (const file of files) {
      if (!file.isDirectory()) continue;
      const dirPath = path.join(serversDir, file.name);
      const propsPath = path.join(dirPath, 'server.properties');
      
      let port = 25565;
      let onlineMode = false;
      let version = '1.21.4';
      let software = 'PaperMC';

      // Load properties if exists
      if (fs.existsSync(propsPath)) {
        const lines = fs.readFileSync(propsPath, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
          const [key, val] = trimmed.split('=');
          if (key.trim() === 'server-port') port = parseInt(val.trim()) || 25565;
          if (key.trim() === 'online-mode') onlineMode = val.trim() === 'true';
        }
      }

      // Check config file if exists
      const configPath = path.join(dirPath, 'launcher_server_config.json');
      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (cfg.version) version = cfg.version;
          if (cfg.software) software = cfg.software;
        } catch (e) {}
      }

      const isRunning = activeLocalServers.has(file.name);

      localServers.push({
        name: file.name,
        port,
        onlineMode,
        version,
        software,
        status: isRunning ? 'Running' : 'Stopped'
      });
    }
    return localServers;
  } catch (err) {
    console.error('Error getting local servers:', err);
    return [];
  }
});

// 5. Create Local Server (Auto Download JAR)
ipcMain.handle('create-local-server', async (event, { name, version, software, port, ram, profileId }) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }
    const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (cleanName.length === 0) throw new Error('Invalid server name');

    // Validate and sanitize game version to check format
    let cleanVersion = (version || '1.21.4').trim();
    const isMcVersion = /^1\.\d+(\.\d+)*(-.*)?$/.test(cleanVersion) || 
                        /^\d{2}w\d{2}[a-z]$/.test(cleanVersion) || 
                        cleanVersion.startsWith('b1.') || 
                        cleanVersion.startsWith('a1.');
    if (!isMcVersion) {
      console.warn(`[SERVER CREATE] Invalid Minecraft version: "${version}". Falling back to 1.21.4.`);
      cleanVersion = '1.21.4';
    }

    const serverDir = path.join(GAME_DIR, 'servers', cleanName);
    if (fs.existsSync(serverDir)) {
      throw new Error('Server with this name already exists');
    }

    fs.mkdirSync(serverDir, { recursive: true });

    // 1. Determine download URL
    let downloadUrl = '';
    if (software.toLowerCase() === 'papermc') {
      downloadUrl = await getPaperServerJarUrl(cleanVersion);
    } else if (software.toLowerCase() === 'purpur') {
      downloadUrl = await getPurpurServerJarUrl(cleanVersion);
    } else if (software.toLowerCase() === 'fabric') {
      downloadUrl = await getFabricServerJarUrl(cleanVersion);
    } else {
      downloadUrl = await getVanillaServerJarUrl(cleanVersion);
    }

    // Security check: Only allow downloads from official domains
    const allowedDomains = [
      'https://piston-data.mojang.com/',
      'https://launchermeta.mojang.com/',
      'https://api.papermc.io/',
      'https://api.purpurmc.org/',
      'https://meta.fabricmc.net/'
    ];
    const isAllowed = allowedDomains.some(domain => downloadUrl.startsWith(domain));
    if (!isAllowed) {
      throw new Error('Unsafe download URL source rejected.');
    }

    // 2. Download JAR
    const jarPath = path.join(serverDir, 'server.jar');
    event.sender.send('server-log', { name: cleanName, text: `[LAUNCHER] Downloading ${software} ${cleanVersion} server jar...` });
    await downloadFile(downloadUrl, jarPath);
    event.sender.send('server-log', { name: cleanName, text: `[LAUNCHER] Download complete!` });

    // 3. Write properties and eula
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n', 'utf8');
    
    const props = [
      `# Minecraft Server Properties`,
      `server-port=${parseInt(port) || 25565}`,
      `online-mode=false`,
      `max-players=20`,
      `motd=Pramochak MC Local ${software} Server`,
      `difficulty=easy`,
      `spawn-protection=0`
    ].join('\n');
    fs.writeFileSync(path.join(serverDir, 'server.properties'), props, 'utf8');

    // 4. Save metadata config
    const config = {
      name: cleanName,
      version: cleanVersion,
      software,
      ram: parseInt(ram) || 2048,
      port: parseInt(port) || 25565
    };
    fs.writeFileSync(path.join(serverDir, 'launcher_server_config.json'), JSON.stringify(config, null, 2), 'utf8');

    // 5. Automatically add local server to active profile's servers.dat list
    try {
      const targetPort = parseInt(port) || 25565;
      const serverIp = targetPort === 25565 ? '127.0.0.1' : `127.0.0.1:${targetPort}`;
      const serverEntry = {
        name: `${name} (Local)`,
        ip: serverIp
      };

      let serversFile;
      if (profileId && profileId !== 'default' && profileId !== '') {
        serversFile = path.join(GAME_DIR, 'instances', profileId, 'servers.dat');
      } else {
        serversFile = path.join(GAME_DIR, 'servers.dat');
      }

      let currentServers = [];
      if (fs.existsSync(serversFile)) {
        try {
          const fileData = fs.readFileSync(serversFile);
          currentServers = parseNBT(fileData).servers || [];
        } catch (e) {
          console.error('[SERVER CREATE] Failed to parse existing servers.dat:', e);
        }
      } else {
        // Fallback default list
        currentServers = [
          { name: 'Hypixel', ip: 'mc.hypixel.net' },
          { name: 'ManaCube', ip: 'play.manacube.com' }
        ];
      }

      // Check if this IP is already in the server list, if not add it
      const alreadyExists = currentServers.some(srv => srv.ip === serverIp);
      if (!alreadyExists) {
        currentServers.push(serverEntry);
        const dir = path.dirname(serversFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(serversFile, serializeServersNBT(currentServers));
        console.log(`[SERVER CREATE] Automatically added local server to ${serversFile}`);
      }
    } catch (serversDatErr) {
      console.error('[SERVER CREATE] Failed to auto-inject into servers.dat:', serversDatErr);
    }

    return { success: true, name: cleanName };
  } catch (err) {
    console.error('Error creating local server:', err);
    return { success: false, error: err.message };
  }
});

// 6. Start Local Server process
ipcMain.handle('start-local-server', async (event, name) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }
    if (activeLocalServers.has(name)) {
      return { success: true, info: 'Already running' };
    }

    const serverDir = path.join(GAME_DIR, 'servers', name);
    if (!fs.existsSync(serverDir)) {
      throw new Error('Server directory not found');
    }

    let ram = 2048;
    let version = '1.21.4';
    const configPath = path.join(serverDir, 'launcher_server_config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.ram) ram = config.ram;
        if (config.version) version = config.version;
      } catch (e) {}
    }

    // Get Java path matching version
    const javaPath = await ensureJava(version, event);

    event.sender.send('server-log', { name, text: `[LAUNCHER] Starting server ${name} with ${ram}MB RAM...` });

    // Spawn process directly using arguments array (shell: false, prevent injection)
    const { spawn } = require('child_process');
    const child = spawn(javaPath, [`-Xmx${ram}M`, `-Xms${ram}M`, '-jar', 'server.jar', 'nogui'], {
      cwd: serverDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    activeLocalServers.set(name, child);

    child.stdout.on('data', (data) => {
      event.sender.send('server-log', { name, text: data.toString() });
    });

    child.stderr.on('data', (data) => {
      event.sender.send('server-log', { name, text: `[ERROR] ${data.toString()}` });
    });

    child.on('close', (code) => {
      console.log(`Server ${name} exited with code ${code}`);
      activeLocalServers.delete(name);
      event.sender.send('server-status', { name, status: 'Stopped' });
      event.sender.send('server-log', { name, text: `[LAUNCHER] Server process stopped with exit code: ${code}` });
    });

    event.sender.send('server-status', { name, status: 'Running' });
    return { success: true };
  } catch (err) {
    console.error('Error starting local server:', err);
    return { success: false, error: err.message };
  }
});

// 7. Stop Local Server process
ipcMain.handle('stop-local-server', async (event, name) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }
    const child = activeLocalServers.get(name);
    if (!child) {
      return { success: true, info: 'Not running' };
    }

    event.sender.send('server-log', { name, text: `[LAUNCHER] Sending stop command to server...` });
    child.stdin.write('stop\n');

    // Timeout fallback to force kill if it hangs
    setTimeout(() => {
      if (activeLocalServers.has(name)) {
        event.sender.send('server-log', { name, text: `[LAUNCHER] Server hanging. Force terminating process...` });
        child.kill('SIGKILL');
      }
    }, 10000);

    return { success: true };
  } catch (err) {
    console.error('Error stopping local server:', err);
    return { success: false, error: err.message };
  }
});

// 8. Send Console Command
ipcMain.handle('send-server-command', async (event, { name, cmd }) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }
    const child = activeLocalServers.get(name);
    if (!child) {
      throw new Error('Server is not running');
    }

    // Sanitize command text (remove control codes, escape characters, etc.)
    const cleanCmd = cmd.replace(/[\x00-\x1F\x7F]/g, "").trim();
    if (cleanCmd.length > 0) {
      child.stdin.write(cleanCmd + '\n');
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 9. Delete Local Server
ipcMain.handle('delete-local-server', async (event, name) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }

    const child = activeLocalServers.get(name);
    if (child) {
      child.kill('SIGKILL');
      activeLocalServers.delete(name);
    }

    const serverDir = path.join(GAME_DIR, 'servers', name);
    if (fs.existsSync(serverDir)) {
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 10. Open Server Directory
ipcMain.handle('open-server-folder', async (event, name) => {
  try {
    if (!name || typeof name !== 'string' || name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid server name');
    }
    const serverDir = path.join(GAME_DIR, 'servers', name);
    if (!fs.existsSync(serverDir)) {
      fs.mkdirSync(serverDir, { recursive: true });
    }
    await shell.openPath(serverDir);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
