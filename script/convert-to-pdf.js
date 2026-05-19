import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jsPDF from 'jspdf';
import markdownit from 'markdown-it';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(__dirname, '..', 'docs', 'training');

const md = new markdownit({
  html: true,
  linkify: true,
  typographer: true
});

// Files to convert
const files = [
  'hr-user-guide.md',
  'admin-reference-manual.md',
  'hr-quick-reference.md',
  'README.md'
];

async function convertMarkdownToPdf(filename) {
  try {
    const inputPath = path.join(docsDir, filename);
    const outputPath = path.join(docsDir, filename.replace('.md', '-v1.pdf'));

    // Read markdown file
    const markdown = fs.readFileSync(inputPath, 'utf-8');

    // Convert markdown to HTML
    const html = md.render(markdown);

    // Create PDF document
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    // Set metadata
    const title = filename
      .replace('.md', '')
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    doc.setProperties({
      title: `${title} - Version 1`,
      subject: 'AECE Checkpoint Training Documentation',
      author: 'AECE Checkpoint',
      creator: 'Claude Code'
    });

    // Add content using HTML
    doc.html(html, {
      callback: () => {
        doc.save(outputPath);
        console.log(`✓ Created: ${path.basename(outputPath)}`);
      },
      margin: 10,
      autoSize: false,
      width: 190,
      windowHeight: 1200,
      x: 10,
      y: 10,
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true
      }
    });
  } catch (error) {
    console.error(`✗ Error converting ${filename}:`, error.message);
  }
}

// Convert all files
async function convertAll() {
  console.log('Converting markdown files to PDF...\n');

  for (const file of files) {
    await convertMarkdownToPdf(file);
  }

  console.log('\n✓ All conversions complete!');
}

convertAll().catch(console.error);
