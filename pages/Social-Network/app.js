// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: process.env.PUBLIC_SOCIAL_FIREBASE_API_KEY || "AIzaSyC2wLw45JmXYov0lYOpMMZf3IYavURMwNc",
    authDomain: process.env.PUBLIC_SOCIAL_FIREBASE_AUTH_DOMAIN || "social-network-b6579.firebaseapp.com",
    projectId: process.env.PUBLIC_SOCIAL_FIREBASE_PROJECT_ID || "social-network-b6579",
    storageBucket: process.env.PUBLIC_SOCIAL_FIREBASE_STORAGE_BUCKET || "social-network-b6579.firebasestorage.app",
    messagingSenderId: process.env.PUBLIC_SOCIAL_FIREBASE_MESSAGING_SENDER_ID || "686831441900",
    appId: process.env.PUBLIC_SOCIAL_FIREBASE_APP_ID || "1:686831441900:web:28d02d913ce6382e58d2c9"
};