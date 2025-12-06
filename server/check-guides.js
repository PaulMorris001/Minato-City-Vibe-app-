import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkGuides() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB\n');

    const Guide = mongoose.model('guide', new mongoose.Schema({}, { strict: false }));

    // Find all guides for New York City
    const nycCityId = new mongoose.Types.ObjectId("691660f69fce6d48f9f04c99");
    const allGuides = await Guide.find({ city: nycCityId });

    console.log(`Total guides for NYC: ${allGuides.length}\n`);

    allGuides.forEach(guide => {
      console.log(`Title: ${guide.title}`);
      console.log(`  - isDraft: ${guide.isDraft}`);
      console.log(`  - isActive: ${guide.isActive}`);
      console.log(`  - city: ${guide.city}`);
      console.log('');
    });

    // Try the same query as the controller
    const publishedGuides = await Guide.find({
      city: nycCityId,
      isDraft: false,
      isActive: true
    });

    console.log(`Published guides (isDraft:false, isActive:true): ${publishedGuides.length}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkGuides();
