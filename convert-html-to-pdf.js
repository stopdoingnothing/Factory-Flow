#!/usr/bin/env node

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = [
  {
    input: 'docs/training/hr-user-guide-v1.html',
    output: 'docs/training/hr-user-guide-v1.pdf',
  },
  {
    input: 'docs/training/admin-reference-manual-v1.html',
    output: 'docs/training/admin-reference-manual-v1.pdf',
  },
  {
    input: 'docs/training/hr-quick-reference-v1.html',
    output: 'docs/training/hr-quick-reference-v1.pdf',
  },
  {
    input: 'docs/training/README-v1.html',
    output: 'docs/training/README-v1.pdf',
  },
];

async function convertHtmlToPdf() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const file of files) {
      const inputPath = path.resolve(file.input);
      const outputPath = path.resolve(file.output);

      if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input file not found: ${inputPath}`);
        continue;
      }

      console.log(`Converting: ${file.input} → ${file.output}`);

      const page = await browser.newPage();

      // Set viewport for better rendering
      await page.setViewport({ width: 1200, height: 1600 });

      // Navigate to the HTML file
      const fileUrl = `file://${inputPath}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle2' });

      // Generate PDF with professional settings
      await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: {
          top: '2.5cm',
          right: '2cm',
          bottom: '2.5cm',
          left: '2cm',
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>', // Empty, will use CSS @top rules
        footerTemplate: '<div></div>', // Empty, will use CSS @bottom rules
        scale: 1,
        timeout: 30000,
      });

      console.log(`✓ Created: ${outputPath}`);

      await page.close();
    }

    console.log('\n✅ All conversions completed successfully!');
  } catch (error) {
    console.error('❌ Conversion failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

convertHtmlToPdf();
