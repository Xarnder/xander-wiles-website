import heic2any from "heic2any";
import imageCompression from "browser-image-compression";

export const compressImage = async (file) => {
    let blob = file;

    // 1. If it's HEIC, convert it to a JPEG first
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
        console.log("HEIC detected, starting conversion...");
        try {
            const convertedBlob = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.8
            });
            // heic2any can return an array; handle both cases
            blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            console.log("HEIC conversion successful.");
        } catch (e) {
            console.error("HEIC conversion failed:", e);
            throw new Error("Could not read this iPhone photo format.");
        }
    }

    // 2. Now compress the resulting Blob to WebP
    console.log("Starting WebP compression...");
    const options = {
        maxSizeMB: 0.2, // 200KB
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: "image/webp",
        initialQuality: 0.8
    };

    try {
        const compressedFile = await imageCompression(blob, options);
        console.log("Compression complete. Final size:", (compressedFile.size / 1024).toFixed(2), "KB");
        // Ensure we return a File object properly named
        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
        return new File([compressedFile], newFileName, { type: "image/webp" });
    } catch (e) {
        console.error("WebP compression failed:", e);
        throw e;
    }
};
