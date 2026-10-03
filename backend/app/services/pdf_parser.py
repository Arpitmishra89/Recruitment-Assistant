import pymupdf

def extract_text_from_pdf(file_bytes: bytes) -> str:
    if not file_bytes:
        raise ValueError("The uploaded PDF is empty.")

    text_parts = []

    with pymupdf.open(stream=file_bytes, filetype="pdf") as document:
        for page in document:
            text_parts.append(page.get_text())

    extracted_text = "\n".join(text_parts).strip()

    if not extracted_text:
        raise ValueError("No readable text found in the PDF.")

    return extracted_text