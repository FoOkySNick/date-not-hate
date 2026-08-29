import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_SUBJECT=mailto:your-email@example.com\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
