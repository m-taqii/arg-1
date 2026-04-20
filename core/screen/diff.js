import sharp from "sharp";
export async function hasScreenChanged(current, previous) {

    const { screenshot: currentImg, app: currentApp, hash: currentHash } = current;
    const { screenshot: previousImg, app: previousApp, hash: previousHash } = previous || {};

    if (currentHash === previousHash) return { isChanged: false, diffScore: 0 };

    const currentMatrix = await sharp(currentImg)
        .resize(64, 32, { fit: 'fill' })
        .raw()
        .toBuffer();

    let diffScore = 0;
    const regions = [];
    const dominantRegions = [];

    if (previous?.screenshot) {
        const previousMatrix = await sharp(previous.screenshot)
            .resize(64, 32, { fit: 'fill' })
            .raw()
            .toBuffer();

        // 4x2 Grid (8 cells total)
        // Each cell in the 64x32 matrix is 16x16 pixels
        for (let i = 0; i < 8; i++) {
            const cellRow = Math.floor(i / 4); // 0 or 1
            const cellCol = i % 4;             // 0-3
            
            let regionDiffSum = 0;

            // We must iterate through each row (y) of the 16x16 cell 
            // because the raw buffer is stored row-by-row.
            for (let y = 0; y < 16; y++) {
                // Byte offset = ((current_row_in_image) * img_width + current_col_in_image) * bytes_per_pixel
                const rowStart = ((cellRow * 16 + y) * 64 + (cellCol * 16)) * 3;
                
                // Compare 16 pixels (48 bytes) for this horizontal line of the cell
                for (let b = 0; b < 48; b++) {
                    regionDiffSum += Math.abs(currentMatrix[rowStart + b] - previousMatrix[rowStart + b]);
                }
            }

            const regionScore = regionDiffSum / (16 * 16 * 3 * 255);
            regions.push({ id: i, diff: parseFloat(regionScore.toFixed(3)) });
            
            if (regionScore > 0.05) dominantRegions.push(i);
            diffScore += regionScore;
        }
    }

    const finalDiffScore = parseFloat((diffScore / 8).toFixed(3));

    return {
        isChanged: true,
        diffScore: finalDiffScore,
        motion: {
            isHighMotion: finalDiffScore > 0.3,
            isLowMotion: finalDiffScore <= 0.05
        },
        regions,
        dominantRegions,
        app: {
            name: currentApp.processName,
            title: currentApp.title,
            changed: currentApp.processName !== previousApp?.processName
        }
    };
}