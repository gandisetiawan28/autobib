const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnSetup = document.getElementById('btnSetup');
const consoleOutput = document.getElementById('consoleOutput');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const startLoader = document.getElementById('startLoader');
const btnStartText = document.getElementById('btnStartText');
const setupLoader = document.getElementById('setupLoader');
const btnSetupText = document.getElementById('btnSetupText');

// Update UI elements
const updateBanner = document.getElementById('updateBanner');
const updateTitle = document.getElementById('updateTitle');
const updateProgressText = document.getElementById('updateProgressText');
const updateProgressBar = document.getElementById('updateProgressBar');
const btnInstallUpdate = document.getElementById('btnInstallUpdate');
const appVersionText = document.getElementById('appVersionText');

let isRunning = false;

window.addEventListener('DOMContentLoaded', async () => {
    // Get and display version
    const version = await window.api.getVersion();
    appVersionText.textContent = `v${version}`;

    // Load existing config
    const config = await window.api.loadConfig();
    if (config) {
        mendeleyClientId.value = config.MENDELEY_CLIENT_ID || '';
        mendeleyClientSecret.value = config.MENDELEY_CLIENT_SECRET || '';
    }
});

// Update Event Listeners
window.api.onUpdateAvailable((info) => {
    updateBanner.style.display = 'flex';
    updateTitle.textContent = `Update v${info.version} Available!`;
    updateProgressText.textContent = 'Starting download...';
});

window.api.onDownloadProgress((progressObj) => {
    updateProgressBar.style.width = `${progressObj.percent}%`;
    updateProgressText.textContent = `Downloading... ${Math.round(progressObj.percent)}% (${(progressObj.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s)`;
});

window.api.onUpdateDownloaded((info) => {
    updateTitle.textContent = `Update v${info.version} Ready!`;
    updateProgressText.textContent = 'Download complete. Restart to apply.';
    updateProgressBar.style.width = '100%';
    btnInstallUpdate.style.display = 'block';
});

btnInstallUpdate.addEventListener('click', () => {
    window.api.installUpdate();
});

function appendLog(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

window.api.onLog((data) => {
    appendLog(data.text, data.type);
});

window.api.onStatusChange((status) => {
    isRunning = status === 'running';
    if (isRunning) {
        statusDot.classList.add('active');
        statusText.textContent = 'Server Online & Running';
        statusText.style.color = 'var(--success)';
        
        btnStart.style.display = 'none';
        btnStop.style.display = 'flex';
        btnSetup.disabled = true;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Server Offline';
        statusText.style.color = 'var(--text-main)';
        
        btnStart.style.display = 'flex';
        btnStop.style.display = 'none';
        btnSetup.disabled = false;
        
        startLoader.style.display = 'none';
        btnStartText.textContent = 'Start Engine';
        btnStart.disabled = false;
    }
});

btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    startLoader.style.display = 'block';
    btnStartText.textContent = 'Starting...';
    btnSetup.disabled = true;
    appendLog('Initiating engine startup...', 'info');
    await window.api.startServer();
});

btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    btnStop.textContent = 'Stopping...';
    appendLog('Sending stop signal...', 'info');
    await window.api.stopServer();
    btnStop.textContent = 'Stop Engine';
    btnStop.disabled = false;
});

btnSetup.addEventListener('click', async () => {
    btnSetup.disabled = true;
    setupLoader.style.display = 'block';
    btnSetupText.textContent = 'Installing...';
    btnStart.disabled = true;
    appendLog('Starting setup process...', 'info');
    
    await window.api.setupDependencies();
    
    setupLoader.style.display = 'none';
    btnSetupText.textContent = 'Install & Setup Dependencies';
    btnSetup.disabled = false;
    btnStart.disabled = false;
});

const mendeleyClientId = document.getElementById('mendeleyClientId');
const mendeleyClientSecret = document.getElementById('mendeleyClientSecret');
const btnSaveConfig = document.getElementById('btnSaveConfig');

btnSaveConfig.addEventListener('click', async () => {
    const config = {
        MENDELEY_CLIENT_ID: mendeleyClientId.value.trim(),
        MENDELEY_CLIENT_SECRET: mendeleyClientSecret.value.trim()
    };
    
    btnSaveConfig.textContent = 'Saving...';
    btnSaveConfig.disabled = true;
    
    const result = await window.api.saveConfig(config);
    
    if (result.success) {
        btnSaveConfig.textContent = 'Saved!';
        btnSaveConfig.style.backgroundColor = 'var(--success)';
        appendLog('Settings saved successfully.', 'success');
        
        if (isRunning) {
            appendLog('Restarting engine to apply new settings...', 'info');
            await window.api.stopServer();
            await window.api.startServer();
        }
    } else {
        btnSaveConfig.textContent = 'Save Failed';
        btnSaveConfig.style.backgroundColor = 'var(--danger)';
        appendLog(`Failed to save settings: ${result.error}`, 'error');
    }
    
    setTimeout(() => {
        btnSaveConfig.textContent = 'Save Settings';
        btnSaveConfig.style.backgroundColor = 'transparent';
        btnSaveConfig.disabled = false;
    }, 2000);
});

// Contact Buttons
document.getElementById('btnContactWa').addEventListener('click', () => {
    const text = encodeURIComponent('Halo, saya membutuhkan bantuan terkait AutoBib.');
    window.api.openExternal(`https://wa.me/6281234567890?text=${text}`);
});

document.getElementById('btnContactIg').addEventListener('click', () => {
    window.api.openExternal('https://instagram.com/autobib_official');
});

document.getElementById('btnContactTg').addEventListener('click', () => {
    const text = encodeURIComponent('Halo, saya membutuhkan bantuan terkait AutoBib.');
    window.api.openExternal(`https://t.me/autobib_support?text=${text}`);
});
