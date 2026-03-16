/**
 * Script to check if Stripe webhook successfully updated user subscription in Firestore
 * 
 * Usage: node check-subscription-update.js <userId>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../firebase-service-account.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkUserSubscription(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.error(`User ${userId} not found in Firestore`);
      return;
    }
    
    const userData = userDoc.data();
    
    console.log('\n=== User Subscription Status ===');
    console.log(`User ID: ${userId}`);
    console.log(`Email: ${userData.email || 'N/A'}`);
    console.log(`Tier: ${userData.tier || 'free'}`);
    console.log(`Stripe Customer ID: ${userData.stripeCustomerId || 'N/A'}`);
    console.log(`Stripe Subscription ID: ${userData.stripeSubscriptionId || 'N/A'}`);
    console.log(`Subscription Status: ${userData.subscriptionStatus || 'N/A'}`);
    
    if (userData.subscriptionCurrentPeriodEnd) {
      const periodEnd = userData.subscriptionCurrentPeriodEnd.toDate();
      console.log(`Current Period End: ${periodEnd.toLocaleString('de-DE')}`);
    } else {
      console.log('Current Period End: N/A');
    }
    
    console.log(`Cancel at Period End: ${userData.subscriptionCancelAtPeriodEnd || false}`);
    console.log(`Created At: ${userData.createdAt?.toDate().toLocaleString('de-DE') || 'N/A'}`);
    
    console.log('\n=== Expected Values ===');
    console.log('Tier should be: tier1 or tier2 (not free)');
    console.log('Subscription Status should be: active');
    console.log('Stripe Customer ID should be: present (starts with cus_)');
    console.log('Stripe Subscription ID should be: present (starts with sub_)');
    
  } catch (error) {
    console.error('Error checking user subscription:', error);
  }
}

// Get userId from command line arguments
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node check-subscription-update.js <userId>');
  process.exit(1);
}

checkUserSubscription(userId)
  .then(() => {
    console.log('\n✓ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });

