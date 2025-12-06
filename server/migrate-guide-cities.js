import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// City mapping from names to IDs (from seed.js)
const cityMapping = {
  "Boston": "691660f69fce6d48f9f04c98",
  "New York City": "691660f69fce6d48f9f04c99",
  "Atlanta": "691660f69fce6d48f9f04c9a",
  "Los Angeles": "691660f69fce6d48f9f04c9b",
  "Houston": "691660f69fce6d48f9f04c9c",
  "Chicago": "691660f69fce6d48f9f04c9d",
  "Washington": "691660f69fce6d48f9f04c9e",
  "Miami": "691660f69fce6d48f9f04c9f",
  "New Orleans": "691660f69fce6d48f9f04ca0",
  "Detroit": "691660f69fce6d48f9f04ca1",
  "San Francisco": "691660f69fce6d48f9f04ca2"
};

async function migrateGuideCities() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const Guide = mongoose.model('guide', new mongoose.Schema({}, { strict: false }));

    // Find all guides
    const guides = await Guide.find({});
    console.log(`\nFound ${guides.length} guides to check`);

    let migrated = 0;
    let alreadyCorrect = 0;
    let unknownCities = [];

    for (const guide of guides) {
      // Check if city is already an ObjectId
      if (guide.city instanceof mongoose.Types.ObjectId) {
        alreadyCorrect++;
        continue;
      }

      // City is a string, need to convert
      const cityName = guide.city;
      const cityId = cityMapping[cityName];

      if (cityId) {
        // Update the guide
        await Guide.updateOne(
          { _id: guide._id },
          { $set: { city: new mongoose.Types.ObjectId(cityId) } }
        );
        console.log(`✅ Migrated: "${guide.title}" - ${cityName} → ${cityId}`);
        migrated++;
      } else {
        console.log(`❌ Unknown city: "${cityName}" in guide "${guide.title}"`);
        unknownCities.push({ guide: guide.title, city: cityName });
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total guides: ${guides.length}`);
    console.log(`Already correct: ${alreadyCorrect}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Unknown cities: ${unknownCities.length}`);

    if (unknownCities.length > 0) {
      console.log('\nGuides with unknown cities:');
      unknownCities.forEach(item => {
        console.log(`  - "${item.guide}" has city "${item.city}"`);
      });
    }

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateGuideCities();
