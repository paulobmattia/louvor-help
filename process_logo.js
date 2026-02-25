const Jimp = require('jimp');

async function processLogo() {
    try {
        // Load the white logo image
        const image = await Jimp.read('logo.png');

        // Scan the image line by line
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
            // For each pixel, get the current alpha to preserve it
            // const alpha = this.bitmap.data[idx + 3];

            // Set Red, Green, and Blue to 0 (Black)
            this.bitmap.data[idx + 0] = 0;
            this.bitmap.data[idx + 1] = 0;
            this.bitmap.data[idx + 2] = 0;

            // Alpha is left intact exactly as original
        });

        // Save the resulting image
        await image.writeAsync('logo_black.png');
        console.log('Success! Logo saved as logo_black.png');

    } catch (error) {
        console.error('Error processing logo:', error);
    }
}

processLogo();
