"""
chunk_utils.py — 共享分块工具模块
将 chunk_markdown_page 从 ingest_2_0 中提取出来，避免两个脚本互相导入带来的副作用。
"""
import re


def chunk_markdown_page(text, page_num, max_chunk_size=1200, overlap=150):
    """Split page markdown into chunks, keeping tables and math formulas intact."""
    text = text.strip()
    if len(text) <= max_chunk_size:
        return [{"page": page_num, "text": text}]

    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = []
    current_length = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        # If a single paragraph exceeds the limit, split by sentences
        if len(para) > max_chunk_size:
            if current_chunk:
                chunks.append({"page": page_num, "text": "\n\n".join(current_chunk)})
                current_chunk = []
                current_length = 0

            raw_sents = re.split(r'(?<=[。！？；?!;])', para)
            current_sent_chunk = []
            current_sent_len = 0
            for sent in raw_sents:
                sent = sent.strip()
                if not sent:
                    continue
                if current_sent_len + len(sent) > max_chunk_size:
                    if current_sent_chunk:
                        chunks.append({"page": page_num, "text": " ".join(current_sent_chunk)})
                    current_sent_chunk = [sent]
                    current_sent_len = len(sent)
                else:
                    current_sent_chunk.append(sent)
                    current_sent_len += len(sent)
            if current_sent_chunk:
                chunks.append({"page": page_num, "text": " ".join(current_sent_chunk)})
        else:
            if current_length + len(para) > max_chunk_size:
                chunks.append({"page": page_num, "text": "\n\n".join(current_chunk)})
                # Implement overlap (take last items that fit overlap budget)
                overlap_chunk = []
                overlap_len = 0
                for p in reversed(current_chunk):
                    if overlap_len + len(p) <= overlap:
                        overlap_chunk.insert(0, p)
                        overlap_len += len(p)
                    else:
                        if overlap_len == 0:
                            tail = p[-overlap:] if len(p) > overlap else p
                            overlap_chunk.insert(0, tail)
                            overlap_len += len(tail)
                        break
                current_chunk = overlap_chunk
                current_length = overlap_len

            current_chunk.append(para)
            current_length += len(para) + 2

    if current_chunk:
        chunks.append({"page": page_num, "text": "\n\n".join(current_chunk)})

    return chunks
