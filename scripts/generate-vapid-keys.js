const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('\nAdd these lines to your .env file:\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\n(Keep the private key secret — never put it in the frontend.)\n');
