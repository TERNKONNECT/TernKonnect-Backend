import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import User from '../models/User.js';
import sequelize from '../config/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatName(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).map(word => {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    const csvFilePath = path.join(__dirname, '../names_emails_split 1.csv');
    const fileStream = fs.createReadStream(csvFilePath);
    
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let isFirstLine = true;
    let createdCount = 0;
    let skippedCount = 0;

    for await (const line of rl) {
      if (isFirstLine) {
        isFirstLine = false;
        continue;
      }

      const parts = line.split(',');
      if (parts.length < 4) continue; // Skip malformed lines

      const firstName = parts[1] || '';
      const lastName = parts[2] || '';
      const rawEmail = parts[3] || '';

      const formattedFirstName = formatName(firstName);
      const formattedLastName = formatName(lastName);
      const fullName = `${formattedFirstName} ${formattedLastName}`.trim();

      // Lowercase and strip spaces from email
      const email = rawEmail.toLowerCase().replace(/\s+/g, '');

      if (!email) continue;

      const existingUser = await User.findOne({ where: { email } });
      
      if (existingUser) {
        console.log(`Skipping existing user: ${email}`);
        skippedCount++;
        continue;
      }

      // Generate a secure random password since password is required
      const randomPassword = crypto.randomBytes(16).toString('hex');

      await User.create({
        name: fullName,
        email: email,
        password: randomPassword,
        role: 'user',
        userType: 'learner',
        passwordSetupRequired: true,
        emailVerified: false // since we are not sending onboarding, they might need to verify later or we just set false
      });

      console.log(`Created user: ${fullName} (${email})`);
      createdCount++;
    }

    console.log(`\nImport complete!`);
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped: ${skippedCount}`);
    
  } catch (error) {
    console.error('Error during import:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

run();
