/**
 * RLECodec — Run-Length Encoding for Uint8Array chunk data.
 * 
 * Voxel chunks are mostly air (0), so RLE achieves ~90% compression.
 * 
 * Format: pairs of [value, count_high, count_low] where count is 16-bit (max 65535).
 * For runs longer than 65535, multiple entries are emitted.
 */

/**
 * Encode a Uint8Array using Run-Length Encoding.
 * @param {Uint8Array} data - Raw block data
 * @returns {Uint8Array} Compressed data
 */
export function rleEncode(data) {
    if (data.length === 0) return new Uint8Array(0);

    const output = [];
    let i = 0;

    while (i < data.length) {
        const value = data[i];
        let count = 1;

        while (i + count < data.length && data[i + count] === value && count < 65535) {
            count++;
        }

        // Emit: [value, count_high_byte, count_low_byte]
        output.push(value, (count >> 8) & 0xFF, count & 0xFF);
        i += count;
    }

    return new Uint8Array(output);
}

/**
 * Decode an RLE-compressed Uint8Array back to original data.
 * @param {Uint8Array} compressed - RLE compressed data
 * @param {number} expectedLength - Expected decompressed length for validation
 * @returns {Uint8Array} Decompressed data
 */
export function rleDecode(compressed, expectedLength) {
    const output = new Uint8Array(expectedLength);
    let outIdx = 0;

    for (let i = 0; i < compressed.length; i += 3) {
        const value = compressed[i];
        const count = (compressed[i + 1] << 8) | compressed[i + 2];

        for (let j = 0; j < count && outIdx < expectedLength; j++) {
            output[outIdx++] = value;
        }
    }

    if (outIdx !== expectedLength) {
        console.warn(`[RLECodec] Decompressed ${outIdx} bytes, expected ${expectedLength}`);
    }

    return output;
}
