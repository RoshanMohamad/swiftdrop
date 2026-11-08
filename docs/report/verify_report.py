"""Deterministic layout and submission-format checks for the report artifact."""
from pathlib import Path
import re
import pymupdf as fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'output/pdf/SwiftDrop_Design_Report_Corrected.pdf'
SOURCE = ROOT / 'SwiftDrop_Design_Report.pdf'
REPOSITORY = 'https://github.com/umairhassaninfinite-ui/swiftdrop'


def main():
    # DeviceGray rendered through ICC can introduce one-level RGB rounding differences.
    fitz.TOOLS.set_icc(False)
    report = fitz.open(OUTPUT)
    original = fitz.open(SOURCE)
    assert len(report) == 40
    assert len(PdfReader(OUTPUT, strict=True).pages) == 40
    pages = [page.get_text() for page in report]
    combined = '\n'.join(pages)
    for index, text in enumerate(pages, 1):
        assert len(text.strip()) > 100, f'Empty page {index}'
        assert '\ufffd' not in text, f'Invalid glyph on page {index}'
        rgb = report[index - 1].get_pixmap(colorspace=fitz.csRGB).samples
        assert rgb[0::3] == rgb[1::3] == rgb[2::3], f'Colour remains on page {index}'
        for word in report[index - 1].get_text('words'):
            x0, y0, x1, y1, *_ = word
            assert x0 >= 1 and y0 >= 1 and x1 <= report[index - 1].rect.width - 1 and y1 <= report[index - 1].rect.height - 1, (index, 'text outside page', word)
    for number in [9, 27, 31]:
        assert original[number - 1].get_text() == pages[number - 1], f'Changed source text on page {number}'
    figure_pages = [8, 9, 10, 11, 13, 17, 19, 21, 24, 25, 26, 27, 28, 29, 30, 38]
    for number, page in enumerate(figure_pages, 1):
        assert f'Figure {number}:' in pages[page - 1], f'Missing caption {number}'
    for index in [1, 2]:
        links = report[index].get_links()
        assert len(links) == (30 if index == 1 else 29)
        for link in links:
            assert 0 <= link['page'] < 40
            label = report[index].get_textbox(fitz.Rect(link['from'])).strip()
            assert label and label.split()[-1].isdigit(), ('TOC label', index, label)
            assert int(label.split()[-1]) == link['page'] + 1, ('Wrong TOC target', label, link['page'])
    assert REPOSITORY in pages[0], 'Repository URL missing from cover'
    assert any(link.get('uri') == REPOSITORY for link in report[0].get_links()), 'Cover repository link is not clickable'
    normal = re.sub(r'\s+', ' ', combined).lower()
    for obsolete in ['appendix b', 'editing and review notes', 'design proposal.', 'runtime correction:', 'supplied for this review', 'this contract still needs', 'must not be described as', 'no application source', 'not verified implementation', 'no existing build enforcement', 'report correction', 'corrected design report', 'supplied working tree', 'marking rubric was not supplied', 'no passing results', 'document-only repository', 'no working cluster or chart is claimed', 'fill in names and registration numbers']:
        assert obsolete not in normal, ('Editorial commentary remains', obsolete)
    assert all(entry[2] <= 40 and 'review notes' not in entry[1].lower() for entry in report.get_toc()), 'Stale outline entry'
    assert 'Appendix A: Contribution Sheet' in pages[39]
    assert 'Table 14: Contribution sheet' in pages[39]
    print('PASS: 40 nonempty monochrome pages; valid PDF structure; 16 figure captions; 59 accurate contents links; clickable cover repository; text within page bounds; editorial commentary and Appendix B absent; three original pages retain their text; Appendix A retained.')


if __name__ == '__main__':
    main()
