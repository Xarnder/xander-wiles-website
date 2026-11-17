importScripts('edge-detection.js');
self.onmessage = ({ data }) => {
    try {
        const result = RatioEdges.detectEdges(new Uint8ClampedArray(data.pixels), data.width, data.height, data.sensitivity);
        self.postMessage({ ...result, width: data.width, height: data.height }, [result.edges.buffer]);
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};
