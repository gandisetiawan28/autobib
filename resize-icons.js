const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceImage = 'C:\\Users\\Ralvin\\.gemini\\antigravity-ide\\brain\\314b0609-3a25-4b46-86ce-c70ddff01091\\autobib_icon_v2_1783606082552.png';

const addinSizes = [16, 32, 64, 80];
const addinDir = path.join(__dirname, 'frontend', 'assets', 'icons');
const buildDir = path.join(__dirname, 'build');

async function generateIcons() {
    console.log('Starting icon generation...');
    try {
        // Generate Word Add-in icons
        for (const size of addinSizes) {
            await sharp(sourceImage)
                .resize(size, size)
                .toFile(path.join(addinDir, `icon-${size}.png`));
            console.log(`Generated icon-${size}.png`);
        }

        // Generate 256x256 for Electron Builder
        await sharp(sourceImage)
            .resize(256, 256)
            .toFile(path.join(buildDir, 'icon.png'));
        console.log('Generated build/icon.png (256x256)');

    } catch (err) {
        console.error('Error generating icons:', err);
    }
}

generateIcons();
