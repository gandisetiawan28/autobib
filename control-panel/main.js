const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const kill = require('tree-kill');

let mainWindow;
let backendProcess = null;
let frontendProcess = null;
const isPackaged = app.isPackaged || __dirname.includes('app.asar');
const projectRoot = path.join(__dirname, '..');
const safeCwd = isPackaged ? path.dirname(app.getPath('exe')) : projectRoot;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        autoHideMenuBar: true,
        backgroundColor: '#0f172a'
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    app.quit();
});

let isQuitting = false;

app.on('before-quit', (e) => {
    if (isQuitting) return;

    let killedCount = 0;
    const checkQuit = () => {
        killedCount++;
        if (killedCount >= 2) {
            isQuitting = true;
            app.quit();
        }
    };

    if (backendProcess && backendProcess.pid) {
        e.preventDefault();
        try { kill(backendProcess.pid, 'SIGKILL', checkQuit); } catch (e) { checkQuit(); }
    } else { checkQuit(); }

    if (frontendProcess && frontendProcess.pid) {
        e.preventDefault();
        try { kill(frontendProcess.pid, 'SIGKILL', checkQuit); } catch (e) { checkQuit(); }
    } else { checkQuit(); }
});

function sendLog(text, type = 'normal') {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('log', { text, type });
    }
}

function sendStatus(status) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-change', status);
    }
}

ipcMain.handle('setup-dependencies', async () => {
    return new Promise((resolve) => {
        const installCertAndSharedFolder = () => {
            sendLog('Installing SSL certificates...', 'info');
            const certProcess = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'npx office-addin-dev-certs install'], { cwd: safeCwd, env: process.env });
            
            certProcess.stdout.on('data', (data) => sendLog(data.toString()));
            certProcess.stderr.on('data', (data) => sendLog(data.toString(), 'error'));
            
            certProcess.on('close', () => {
                sendLog('Configuring Word Shared Folder...', 'info');
                
                const manifestPath = isPackaged 
                    ? path.join(process.resourcesPath, 'manifest.xml')
                    : path.join(projectRoot, 'manifest.xml');
                
                const psScript = `
                    $folder = 'C:\\AutoBib_Addin';
                    if (!(Test-Path $folder)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null; }
                    Copy-Item -Path '${manifestPath}' -Destination $folder\\manifest.xml -Force;
                    try { New-SmbShare -Name 'AutoBib_Addin' -Path $folder -FullAccess 'Everyone' -ErrorAction SilentlyContinue | Out-Null; } catch {}
                    $regPath = 'HKCU:\\Software\\Microsoft\\Office\\16.0\\WEF\\TrustedCatalogs\\{-AutoBib-Catalog-}';
                    New-Item -Path $regPath -Force -ErrorAction SilentlyContinue | Out-Null;
                    Set-ItemProperty -Path $regPath -Name 'Id' -Value '{-AutoBib-Catalog-}';
                    Set-ItemProperty -Path $regPath -Name 'Url' -Value '\\\\localhost\\AutoBib_Addin';
                    Set-ItemProperty -Path $regPath -Name 'Flags' -Value 1;
                `.replace(/\n/g, ' ');

                const sharedFolderProcess = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'powershell.exe -Command "' + psScript + '"'], { cwd: safeCwd, env: process.env });
                sharedFolderProcess.on('close', () => {
                    sendLog('Shared Folder configured! Add-in is now in Word.', 'success');
                    sendLog('Setup complete!', 'success');
                    resolve();
                });
            });
        };

        if (isPackaged) {
            sendLog('Skipping npm install as dependencies are already bundled in production.', 'success');
            installCertAndSharedFolder();
            return;
        }

        sendLog('Running npm install...', 'info');
        const installProcess = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'npm install'], { cwd: projectRoot, env: process.env });
        
        installProcess.stdout.on('data', (data) => sendLog(data.toString()));
        installProcess.stderr.on('data', (data) => sendLog(data.toString(), 'error'));
        
        installProcess.on('close', (code) => {
            if (code === 0) {
                sendLog('Dependencies installed successfully!', 'success');
            } else {
                sendLog(`Install failed with code ${code}`, 'error');
            }
            installCertAndSharedFolder();
        });
    });
});

ipcMain.handle('start-server', async () => {
    if (backendProcess || frontendProcess) return;

    return new Promise((resolve) => {
        sendLog('Injecting manifest to Registry...', 'info');

        const manifestPath = isPackaged 
            ? path.join(process.resourcesPath, 'manifest.xml')
            : path.join(projectRoot, 'manifest.xml');
        const psCommand = `$manifestPath = '${manifestPath}'; $manifestId = '815ccf8d-db32-45e5-aa06-d7168c74a009'; New-Item -Path 'HKCU:\\Software\\Microsoft\\Office\\16.0\\WEF\\Developer' -Force -ErrorAction SilentlyContinue | Out-Null; Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Office\\16.0\\WEF\\Developer' -Name $manifestId -Value $manifestPath`;

        const regProcess = spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'powershell.exe -Command "' + psCommand + '"'], { cwd: safeCwd, env: process.env });

        regProcess.on('close', () => {
            const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
            env.DB_PATH = path.join(app.getPath('userData'), 'autobib.db');
            env.DOTENV_CONFIG_PATH = isPackaged 
                ? path.join(process.resourcesPath, '.env')
                : path.join(projectRoot, 'backend', '.env');
            const cwd = process.resourcesPath || path.dirname(projectRoot);

            const backendCmd = path.join(projectRoot, 'dist-backend', 'server.js');
            const servePath = path.join(projectRoot, 'node_modules', 'serve', 'build', 'main.js');
            const frontendDir = path.join(projectRoot, 'frontend');
            const sslCert = path.join(process.env.USERPROFILE, '.office-addin-dev-certs', 'localhost.crt');
            const sslKey = path.join(process.env.USERPROFILE, '.office-addin-dev-certs', 'localhost.key');

            // Spawn Backend
            backendProcess = spawn(process.execPath, [backendCmd], { cwd, env, stdio: 'pipe' });
            
            backendProcess.stdout.on('data', (data) => {
                const text = data.toString().trim();
                if (text) sendLog(`[BACKEND] ${text}`);
            });
            backendProcess.stderr.on('data', (data) => {
                const text = data.toString().trim();
                if (text) sendLog(`[BACKEND] ${text}`, 'error');
            });
            backendProcess.on('close', (code) => {
                sendLog(`[BACKEND] exited with code ${code}`, 'error');
                backendProcess = null;
                if (!frontendProcess) sendStatus('stopped');
            });

            // Spawn Frontend
            frontendProcess = spawn(process.execPath, [
                servePath, '-p', '3002', '-C', 
                '--ssl-cert', sslCert, '--ssl-key', sslKey, frontendDir
            ], { cwd, env, stdio: 'pipe' });

            frontendProcess.stdout.on('data', (data) => {
                const text = data.toString().trim();
                if (text) sendLog(`[FRONTEND] ${text}`);
            });
            frontendProcess.stderr.on('data', (data) => {
                const text = data.toString().trim();
                if (text) sendLog(`[FRONTEND] ${text}`, 'error');
            });
            frontendProcess.on('close', (code) => {
                sendLog(`[FRONTEND] exited with code ${code}`, 'error');
                frontendProcess = null;
                if (!backendProcess) sendStatus('stopped');
            });

            sendStatus('running');
            resolve();
        });
    });
});

ipcMain.handle('stop-server', async () => {
    return new Promise((resolve) => {
        let killedCount = 0;
        const checkDone = () => {
            killedCount++;
            if (killedCount >= 2) {
                sendStatus('stopped');
                sendLog('Servers stopped.', 'success');
                resolve();
            }
        };

        if (backendProcess && backendProcess.pid) {
            sendLog('Killing backend process...', 'info');
            kill(backendProcess.pid, 'SIGKILL', () => { backendProcess = null; checkDone(); });
        } else { checkDone(); }

        if (frontendProcess && frontendProcess.pid) {
            sendLog('Killing frontend process...', 'info');
            kill(frontendProcess.pid, 'SIGKILL', () => { frontendProcess = null; checkDone(); });
        } else { checkDone(); }
    });
});
