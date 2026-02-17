import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file to WebP format with a maximum size of 200KB.
 * @param {File} imageFile - The original image file.
 * @returns {Promise<File>} - The compressed WebP image file.
 */
export async function compressImage(imageFile) {
    const options = {
        maxSizeMB: 0.2, // 200KB
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8,
    };

    try {
        const compressedFile = await imageCompression(imageFile, options);
        // Ensure the file extension is .webp
        const newFileName = imageFile.name.replace(/\.[^/.]+$/, "") + ".webp";
        const renamedFile = new File([compressedFile], newFileName, { type: 'image/webp' });
        return renamedFile;
    } catch (error) {
        console.error("Error compressing image:", error);
        throw error;
    }
}
