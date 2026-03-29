// script.js - Steganography Image LSB & Text Zero-Width Implementations

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    
    // Mode Switching
    const modeBtns = document.querySelectorAll('.mode-btn');
    const imageUIs = document.querySelectorAll('#encode-image-ui, #decode-image-ui');
    const textUIs = document.querySelectorAll('#encode-text-ui, #decode-text-ui');
    
    // Tab Switching
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // General Encode UI
    const encodeText = document.getElementById('encode-text');
    const btnEncode = document.getElementById('btn-encode');
    const encodeError = document.getElementById('encode-error');
    const encodeSuccess = document.getElementById('encode-success');
    
    // General Decode UI
    const btnDecode = document.getElementById('btn-decode');
    const decodeError = document.getElementById('decode-error');
    const decodedResultGroup = document.getElementById('decoded-result-group');
    const decodedText = document.getElementById('decoded-text');
    
    // Image Uploads UI
    const encodeFileInput = document.getElementById('encode-image');
    const encodeFileCustom = encodeFileInput.nextElementSibling;
    const encodePreview = document.getElementById('encode-preview');
    const decodeFileInput = document.getElementById('decode-image');
    const decodeFileCustom = decodeFileInput.nextElementSibling;
    const decodePreview = document.getElementById('decode-preview');
    
    // Text Steganography UI
    const encodeCoverText = document.getElementById('encode-cover-text');
    const decodePastedText = document.getElementById('decode-pasted-text');
    const textResultGroup = document.getElementById('text-result-group');
    const encodedTextResult = document.getElementById('encoded-text-result');

    // Canvas
    const canvas = document.getElementById('hidden-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // State
    let currentMode = 'mode-image';
    let currentEncodeImage = null;
    let currentDecodeImage = null;

    // --- Mode & Tab Management ---

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
            
            if (currentMode === 'mode-image') {
                imageUIs.forEach(ui => ui.style.display = 'block');
                textUIs.forEach(ui => ui.style.display = 'none');
                btnEncode.textContent = "Encode & Download";
            } else {
                imageUIs.forEach(ui => ui.style.display = 'none');
                textUIs.forEach(ui => ui.style.display = 'block');
                btnEncode.textContent = "Encode & Copy Text";
            }
            
            // Reset messages & previews
            encodeError.style.display = 'none';
            encodeSuccess.style.display = 'none';
            decodeError.style.display = 'none';
            textResultGroup.style.display = 'none';
            decodedResultGroup.style.display = 'none';
        });
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });

    function showMessage(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => { element.style.display = 'none'; }, 6000);
    }
    
    // --- Image File Handling ---
    
    function handleImageUpload(input, customLabel, previewEl, callback) {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            customLabel.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    previewEl.src = event.target.result;
                    previewEl.style.display = 'block';
                    callback(img);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    handleImageUpload(encodeFileInput, encodeFileCustom, encodePreview, (img) => {
        currentEncodeImage = img;
    });

    handleImageUpload(decodeFileInput, decodeFileCustom, decodePreview, (img) => {
        currentDecodeImage = img;
        decodedResultGroup.style.display = 'none';
        decodedText.value = '';
    });

    // --- Core Logic ---

    // 1. TEXT ZERO-WIDTH STEGANOGRAPHY
    
    const ZW_0 = '\u200B'; // Zero-Width Space
    const ZW_1 = '\u200C'; // Zero-Width Non-Joiner
    const ZW_DELIM = '\u200D'; // Zero-Width Joiner
    
    function textToBinary(text) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(text);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += bytes[i].toString(2).padStart(8, '0');
        }
        return binary;
    }

    function binaryToText(binary) {
        const bytes = new Uint8Array(Math.floor(binary.length / 8));
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(binary.slice(i * 8, (i + 1) * 8), 2);
        }
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
    }

    function encodeTextSteg() {
        const cover = encodeCoverText.value.trim() || "\uFEFF"; // fallback to basic zero-width
        const secret = encodeText.value.trim();
        
        if (!secret) {
            showMessage(encodeError, 'Please enter a secret message to hide.');
            return;
        }

        const binary = textToBinary(secret);
        let hiddenString = ZW_DELIM; // Start delimiter
        for (let char of binary) {
            hiddenString += (char === '1' ? ZW_1 : ZW_0);
        }
        hiddenString += ZW_DELIM; // End delimiter

        // We insert the hidden string right in the middle or end of the cover text
        // If cover text has a space, put it after the first space to look natural. Otherwise, at the end.
        let finalOutput = '';
        const breakPoint = cover.indexOf(' ') !== -1 ? cover.indexOf(' ') : cover.length;
        
        finalOutput = cover.slice(0, breakPoint) + hiddenString + cover.slice(breakPoint);

        encodedTextResult.value = finalOutput;
        textResultGroup.style.display = 'block';
        
        // Automatically select the text in case auto-copy fails
        encodedTextResult.select();
        encodedTextResult.setSelectionRange(0, 99999); // mobile support

        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(finalOutput).then(() => {
                showMessage(encodeSuccess, 'Message encoded inside invisible text and copied to clipboard!');
            }).catch(err => {
                // Fallback to older command if modern API is blocked
                document.execCommand('copy');
                showMessage(encodeSuccess, 'Message encoded & text highlighted! Press Cmd+C to copy.');
            });
        } else {
            // Backup for insecure HTTP contexts
            document.execCommand('copy');
            showMessage(encodeSuccess, 'Message encoded & text highlighted! Press Cmd+C to copy.');
        }
    }

    function decodeTextSteg() {
        const text = decodePastedText.value;
        if (!text) {
            showMessage(decodeError, 'Please paste the text to decode.');
            return;
        }

        const firstDelim = text.indexOf(ZW_DELIM);
        if (firstDelim === -1) {
            showMessage(decodeError, 'No hidden message found in this text.');
            return;
        }

        const nextDelim = text.indexOf(ZW_DELIM, firstDelim + 1);
        if (nextDelim === -1) {
            showMessage(decodeError, 'Hidden message appears corrupted (missing end boundary).');
            return;
        }

        const hiddenChunk = text.substring(firstDelim + 1, nextDelim);
        let binaryStr = '';
        for (let i = 0; i < hiddenChunk.length; i++) {
            if (hiddenChunk[i] === ZW_1) binaryStr += '1';
            else if (hiddenChunk[i] === ZW_0) binaryStr += '0';
        }

        // Must be multiple of 8
        const validBits = binaryStr.substring(0, binaryStr.length - (binaryStr.length % 8));
        
        try {
            const revealedMessage = binaryToText(validBits);
            if (revealedMessage) {
                decodedText.value = revealedMessage;
                decodedResultGroup.style.display = 'block';
            } else {
                showMessage(decodeError, 'Extracted message was empty.');
            }
        } catch(e) {
            showMessage(decodeError, 'Failed to decode data. It may be corrupted.');
        }
    }


    // 2. IMAGE LSB STEGANOGRAPHY (Existing Code)
    
    const IMG_DELIMITER = '|||END|||';

    function encodeImageSteg() {
        if (!currentEncodeImage) {
            showMessage(encodeError, 'Please select a cover image first.');
            return;
        }
        const message = encodeText.value.trim();
        if (!message) {
            showMessage(encodeError, 'Please enter a message to hide.');
            return;
        }

        const fullMessage = message + IMG_DELIMITER;
        const binaryMessage = textToBinary(fullMessage);

        canvas.width = currentEncodeImage.width;
        canvas.height = currentEncodeImage.height;
        ctx.drawImage(currentEncodeImage, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const maxBits = (data.length / 4) * 3; 
        if (binaryMessage.length > maxBits) {
            showMessage(encodeError, `Message too long! Image capacity is ${Math.floor(maxBits / 8)} bytes.`);
            return;
        }

        let bitIndex = 0;
        for (let i = 0; i < data.length && bitIndex < binaryMessage.length; i += 4) {
            for (let j = 0; j < 3 && bitIndex < binaryMessage.length; j++) {
                const bit = parseInt(binaryMessage[bitIndex], 10);
                data[i + j] = (data[i + j] & 254) | bit;
                bitIndex++;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        
        const downloadLink = document.createElement('a');
        downloadLink.download = 'encoded-image.png';
        downloadLink.href = canvas.toDataURL('image/png');
        downloadLink.click();

        showMessage(encodeSuccess, 'Message encoded successfully! Download started.');
    }

    function decodeImageSteg() {
        if (!currentDecodeImage) {
            showMessage(decodeError, 'Please select an encoded image first.');
            return;
        }

        canvas.width = currentDecodeImage.width;
        canvas.height = currentDecodeImage.height;
        ctx.drawImage(currentDecodeImage, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let binaryMessage = '';
        let extractedBytes = [];
        const decoder = new TextDecoder('utf-8');

        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                binaryMessage += (data[i + j] & 1).toString();
                if (binaryMessage.length === 8) {
                    extractedBytes.push(parseInt(binaryMessage, 2));
                    binaryMessage = '';
                    
                    if (extractedBytes.length % 50 === 0 || extractedBytes[extractedBytes.length - 1] === 124) { 
                        try {
                            const tempStr = decoder.decode(new Uint8Array(extractedBytes));
                            if (tempStr.includes(IMG_DELIMITER)) {
                                decodedText.value = tempStr.split(IMG_DELIMITER)[0];
                                decodedResultGroup.style.display = 'block';
                                return;
                            }
                        } catch (e) {}
                    }
                }
            }
        }

        try {
            const tempStr = decoder.decode(new Uint8Array(extractedBytes));
            if (tempStr.includes(IMG_DELIMITER)) {
                decodedText.value = tempStr.split(IMG_DELIMITER)[0];
                decodedResultGroup.style.display = 'block';
            } else {
                showMessage(decodeError, 'No hidden message found, or the image was compressed.');
            }
        } catch(e) {
            showMessage(decodeError, 'Could not decode. Image may not contain a message.');
        }
    }


    // --- Button Bindings ---
    
    btnEncode.addEventListener('click', () => {
        if (currentMode === 'mode-image') encodeImageSteg();
        else encodeTextSteg();
    });

    btnDecode.addEventListener('click', () => {
        if (currentMode === 'mode-image') decodeImageSteg();
        else decodeTextSteg();
    });
});
