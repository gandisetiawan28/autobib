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

let isRunning = false;

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
