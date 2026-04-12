// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: "AIzaSyC2wLw45JmXYov0lYOpMMZf3IYavURMwNc" || "AIzaSyC2wLw45JmXYov0lYOpMMZf3IYavURMwNc",
    authDomain: "social-network-b6579.firebaseapp.com" || "social-network-b6579.firebaseapp.com",
    projectId: "social-network-b6579" || "social-network-b6579",
    storageBucket: "social-network-b6579.firebasestorage.app" || "social-network-b6579.firebasestorage.app",
    messagingSenderId: "686831441900" || "686831441900",
    appId: "1:686831441900:web:28d02d913ce6382e58d2c9" || "1:686831441900:web:28d02d913ce6382e58d2c9"
};