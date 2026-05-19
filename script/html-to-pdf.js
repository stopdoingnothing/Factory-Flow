import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, '..', 'docs', 'training');

const files = [
  'hr-user-guide-v1.html',
  'admin-reference-manual-v1.html',
  'hr-quick-reference-v1.html',
  'README-v1.html'
];

async function convertHtmlToPdf(htmlFile) {
  const inputPath = path.join(docsDir, htmlFile);
  const outputPath = path.join(docsDir, htmlFile.replace('.html', '.pdf'));

  if (!fs.existsSync(inputPath)) {
    console.log(`[SKIP] ${htmlFile}`);
    return false;
  }

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport for consistent rendering
    await page.setViewport({
      width: 1200,
      height: 1600
    });

    // Load HTML file
    await page.goto(`file://${inputPath.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF with proper settings
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width: 100%; text-align: center; font-size: 10px; color: #666;">
          <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `,
      scale: 1
    });

    await browser.close();
    console.log(`[OK] ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.error(`[ERROR] ${htmlFile}: ${error.message}`);
    return false;
  }
}

async function convertAll() {
  console.log('Converting HTML to PDF with Puppeteer...\n');

  for (const file of files) {
    await convertHtmlToPdf(file);
  }

  console.log('\n[DONE] All conversions complete!');
  process.exit(0);
}

convertAll().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
