#!/usr/bin/env python3
"""Convert markdown to PDF via HTML using weasyprint (better formatting)"""

import os
import sys
import markdown
from datetime import datetime

# Try to import weasyprint, if not available use a different approach
try:
    from weasyprint import HTML, CSS
    HAS_WEASYPRINT = True
except ImportError:
    HAS_WEASYPRINT = False
    print("[INFO] weasyprint not available, will use alternative method")

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

# HTML template with styling
HTML_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Version 1</title>
    <style>
        @page {{
            size: A4;
            margin: 2.5cm;
            @bottom-center {{
                content: counter(page) " of " counter(pages);
                font-size: 10pt;
            }}
        }}

        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
        }}

        h1 {{
            font-size: 28pt;
            color: #1f2937;
            margin: 0.5em 0;
            page-break-after: avoid;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 0.3em;
        }}

        h2 {{
            font-size: 18pt;
            color: #1f2937;
            margin: 1em 0 0.5em 0;
            page-break-after: avoid;
            border-left: 4px solid #3b82f6;
            padding-left: 0.5em;
        }}

        h3 {{
            font-size: 14pt;
            color: #374151;
            margin: 0.8em 0 0.4em 0;
            page-break-after: avoid;
        }}

        p {{
            margin: 0.5em 0;
            text-align: justify;
        }}

        ul, ol {{
            margin: 0.5em 0;
            padding-left: 2em;
        }}

        li {{
            margin: 0.3em 0;
        }}

        blockquote {{
            border-left: 4px solid #10b981;
            padding-left: 1em;
            margin-left: 0;
            background-color: #f0fdf4;
            padding: 1em;
            border-radius: 4px;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1em 0;
            page-break-inside: avoid;
        }}

        thead {{
            background-color: #f3f4f6;
        }}

        th {{
            border: 1px solid #d1d5db;
            padding: 0.5em;
            text-align: left;
            font-weight: bold;
            background-color: #3b82f6;
            color: white;
        }}

        td {{
            border: 1px solid #d1d5db;
            padding: 0.5em;
        }}

        tr:nth-child(even) {{
            background-color: #f9fafb;
        }}

        code {{
            background-color: #f3f4f6;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }}

        pre {{
            background-color: #1f2937;
            color: #e5e7eb;
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
            page-break-inside: avoid;
        }}

        pre code {{
            background-color: transparent;
            padding: 0;
            color: inherit;
        }}

        strong {{
            font-weight: bold;
            color: #1f2937;
        }}

        em {{
            font-style: italic;
        }}

        .toc {{
            background-color: #f9fafb;
            padding: 1.5em;
            border-radius: 4px;
            page-break-after: always;
            margin-bottom: 2em;
        }}

        .toc h2 {{
            margin-top: 0;
        }}

        .toc ul {{
            list-style: none;
            padding-left: 0;
        }}

        .toc li {{
            margin: 0.3em 0;
            padding-left: 1em;
        }}

        .toc a {{
            color: #3b82f6;
            text-decoration: none;
        }}

        .metadata {{
            background-color: #f3f4f6;
            padding: 1.5em;
            text-align: center;
            margin-bottom: 2em;
            border-radius: 4px;
        }}

        .metadata p {{
            margin: 0.3em 0;
            font-size: 10pt;
        }}

        hr {{
            border: none;
            border-top: 2px solid #d1d5db;
            margin: 2em 0;
        }}

        .note, .warning {{
            padding: 1em;
            margin: 1em 0;
            border-radius: 4px;
            page-break-inside: avoid;
        }}

        .note {{
            background-color: #dbeafe;
            border-left: 4px solid #0ea5e9;
        }}

        .warning {{
            background-color: #fed7aa;
            border-left: 4px solid #f97316;
        }}
    </style>
</head>
<body>
    <div class="metadata">
        <h1>{title}</h1>
        <p><strong>Version 1</strong></p>
        <p>AECE Checkpoint Training Documentation</p>
        <p style="font-size: 9pt; color: #666;">Generated: {date}</p>
    </div>

    <hr>

    {content}
</body>
</html>
"""


def markdown_to_html(md_text):
    """Convert markdown to HTML with proper extensions"""
    html = markdown.markdown(
        md_text,
        extensions=[
            'tables',
            'fenced_code',
            'nl2br',
            'sane_lists',
            'extra'
        ]
    )
    return html


def convert_with_weasyprint(html_content, output_path):
    """Convert HTML to PDF using weasyprint"""
    try:
        HTML(string=html_content).write_pdf(output_path)
        return True
    except Exception as e:
        print(f"[ERROR] WeasyPrint conversion failed: {e}")
        return False


def convert_markdown_to_pdf(filename):
    """Convert a markdown file to PDF"""
    input_path = os.path.join(docs_dir, filename)
    output_path = os.path.join(docs_dir, filename.replace('.md', '-v1.pdf'))

    if not os.path.exists(input_path):
        print(f"[SKIP] File not found: {filename}")
        return False

    try:
        # Read markdown
        with open(input_path, 'r', encoding='utf-8') as f:
            md_text = f.read()

        # Convert to HTML
        html_content = markdown_to_html(md_text)

        # Create full HTML document
        title = filename.replace('.md', '').replace('-', ' ').title()
        full_html = HTML_TEMPLATE.format(
            title=title,
            date=datetime.now().strftime('%B %d, %Y'),
            content=html_content
        )

        # Convert to PDF
        if HAS_WEASYPRINT:
            success = convert_with_weasyprint(full_html, output_path)
            if success:
                print(f"[OK] Created: {os.path.basename(output_path)}")
                return True
        else:
            # Save HTML for manual conversion
            html_path = output_path.replace('.pdf', '.html')
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(full_html)
            print(f"[HTML] Saved HTML version: {os.path.basename(html_path)}")
            print(f"       Please convert to PDF using: print to PDF in a web browser")
            return True

    except Exception as e:
        print(f"[ERROR] Converting {filename}: {e}")
        return False


def main():
    """Convert all markdown files"""
    print("Converting markdown files to PDF with proper formatting...\n")

    if not HAS_WEASYPRINT:
        print("[WARNING] WeasyPrint not installed. Installing...\n")
        os.system(f"{sys.executable} -m pip install weasyprint -q")
        print()

    for filename in files:
        convert_markdown_to_pdf(filename)

    print("\n[DONE] Conversion complete!")


if __name__ == '__main__':
    main()
