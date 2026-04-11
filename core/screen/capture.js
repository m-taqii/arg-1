import screenshot from 'screenshot-desktop';
import crypto from 'crypto'

async function captureScreen() {
    const img = await screenshot({ format: 'png' });
    const hash = crypto.createHash('sha256').update(img).digest('hex');

    return {
        buffer: img,
        hash,
    };
}

export { captureScreen }