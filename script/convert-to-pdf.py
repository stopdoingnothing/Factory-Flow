#!/usr/bin/env python3

import os
import sys
import markdown
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from html.parser import HTMLParser
import re
from datetime import datetime

# Get the docs/training directory
script_dir = os.path.dirname(os.path.abspath(__file__))
docs_dir = os.path.join(script_dir, '..', 'docs', 'training')

# Files to convert
files = [
    'hr-user-guide.md',
    'admin-reference-manual.md',
    'hr-quick-reference.md',
    'README.md'
]


class MarkdownToPDF:
    def __init__(self, input_file, output_file, title):
        self.input_file = input_file
        self.output_file = output_file
        self.title = title

    def read_markdown(self):
        """Read markdown file"""
        with open(self.input_file, 'r', encoding='utf-8') as f:
            return f.read()

    def markdown_to_html(self, md_text):
        """Convert markdown to HTML"""
        html = markdown.markdown(
            md_text,
            extensions=['tables', 'fenced_code', 'codehilite']
        )
        return html

    def html_to_text(self, html):
        """Convert HTML to plain text (basic)"""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', html)
        # Decode HTML entities
        text = text.replace('&lt;', '<').replace('&gt;', '>')
        text = text.replace('&amp;', '&').replace('&nbsp;', ' ')
        return text

    def create_pdf(self):
        """Create PDF from markdown"""
        try:
            # Read and convert markdown
            md_text = self.read_markdown()
            html = self.markdown_to_html(md_text)
            text = self.html_to_text(html)

            # Create PDF document
            doc = SimpleDocTemplate(
                self.output_file,
                pagesize=A4,
                rightMargin=0.75*inch,
                leftMargin=0.75*inch,
                topMargin=0.75*inch,
                bottomMargin=0.75*inch,
                title=f"{self.title} - Version 1",
                author="AECE Checkpoint",
                subject="Training Documentation"
            )

            # Get styles
            styles = getSampleStyleSheet()

            # Create custom styles
            heading_style = ParagraphStyle(
                'CustomHeading1',
                parent=styles['Heading1'],
                fontSize=16,
                textColor=colors.HexColor('#1f2937'),
                spaceAfter=12,
                fontName='Helvetica-Bold'
            )

            body_style = ParagraphStyle(
                'CustomBody',
                parent=styles['BodyText'],
                fontSize=10,
                spaceAfter=6,
                leading=12
            )

            # Build story (content)
            story = []

            # Add title page
            story.append(Spacer(1, 2*inch))
            story.append(Paragraph(self.title, heading_style))
            story.append(Paragraph("Version 1", styles['Normal']))
            story.append(Spacer(1, 0.2*inch))
            story.append(Paragraph("AECE Checkpoint Training Documentation", styles['Normal']))
            story.append(Spacer(1, 0.1*inch))
            story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d')}", styles['Normal']))
            story.append(PageBreak())

            # Add content
            lines = text.split('\n')
            for line in lines:
                if line.strip():
                    if line.startswith('# '):
                        story.append(Paragraph(line[2:], heading_style))
                    elif line.startswith('## '):
                        story.append(Paragraph(line[3:], styles['Heading2']))
                    elif line.startswith('### '):
                        story.append(Paragraph(line[4:], styles['Heading3']))
                    else:
                        story.append(Paragraph(line, body_style))
                else:
                    story.append(Spacer(1, 0.1*inch))

            # Build PDF
            doc.build(story)
            print(f"[OK] Created: {os.path.basename(self.output_file)}")
            return True

        except Exception as e:
            print(f"[ERROR] Converting {os.path.basename(self.input_file)}: {str(e)}")
            return False


def convert_all():
    """Convert all markdown files to PDF"""
    print("Converting markdown files to PDF...\n")

    for filename in files:
        input_path = os.path.join(docs_dir, filename)
        output_path = os.path.join(docs_dir, filename.replace('.md', '-v1.pdf'))

        if not os.path.exists(input_path):
            print(f"[SKIP] File not found: {filename}")
            continue

        # Generate title from filename
        title = filename.replace('.md', '').replace('-', ' ').title()

        converter = MarkdownToPDF(input_path, output_path, title)
        converter.create_pdf()

    print("\n[DONE] All conversions complete!")


if __name__ == '__main__':
    convert_all()
