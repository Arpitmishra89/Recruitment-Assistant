import logging
import re
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from app.agents.job_agent import job_agent
from app.schemas.job_schema import JobAnalysis

logger = logging.getLogger(__name__)


class HTMLTextExtractor(HTMLParser):
    """Zero-dependency HTML sanitizer and text extractor built on standard library HTMLParser."""

    def __init__(self):
        super().__init__()
        self.text_parts: list[str] = []
        self.skip_tags = {
            "script", "style", "noscript", "header", "footer",
            "nav", "svg", "iframe", "button", "head"
        }
        self.current_skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.skip_tags:
            self.current_skip += 1
        elif tag_lower in {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.skip_tags:
            self.current_skip = max(0, self.current_skip - 1)
        elif tag_lower in {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article"}:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.current_skip == 0:
            cleaned = data.strip()
            if cleaned:
                self.text_parts.append(cleaned + " ")

    def get_text(self) -> str:
        full_text = "".join(self.text_parts)
        # Normalize excessive whitespace and blank lines
        full_text = re.sub(r"[ \t]+", " ", full_text)
        full_text = re.sub(r"\n\s*\n+", "\n\n", full_text)
        return full_text.strip()


class JobCrawler:
    """Fast, resilient crawler for scraping public job posting pages."""

    DEFAULT_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    def validate_url(self, url: str) -> str:
        url = url.strip()
        parsed = urlparse(url)
        if not parsed.scheme or parsed.scheme not in ["http", "https"]:
            raise ValueError("Invalid URL scheme. Please provide a full http:// or https:// URL.")
        if not parsed.netloc:
            raise ValueError("Invalid URL: missing domain host.")
        return url

    async def fetch_html(self, url: str) -> str:
        validated_url = self.validate_url(url)
        async with httpx.AsyncClient(
            headers=self.DEFAULT_HEADERS,
            timeout=15.0,
            follow_redirects=True,
            verify=False
        ) as client:
            response = await client.get(validated_url)
            if response.status_code >= 400:
                raise ValueError(
                    f"Could not reach job posting page (HTTP {response.status_code}: {response.reason_phrase})."
                )
            return response.text

    def extract_text_from_html(self, html_content: str) -> str:
        parser = HTMLTextExtractor()
        parser.feed(html_content)
        extracted = parser.get_text()

        if len(extracted) < 120:
            raise ValueError(
                "The target page did not contain sufficient readable text. "
                "The site may require JavaScript rendering or a login."
            )
        return extracted

    async def crawl_and_analyze(self, url: str) -> JobAnalysis:
        html = await self.fetch_html(url)
        text = self.extract_text_from_html(html)
        logger.info("Successfully extracted %d characters from %s. Analyzing with JobAgent...", len(text), url)
        # Pass to JobAgent for structured extraction
        analysis = job_agent.analyze(text[:12000])  # Cap context to prevent excessive token use
        return analysis

    def generate_verbal_summary(self, job: JobAnalysis) -> str:
        title = job.job_title if job.job_title and job.job_title != "Not specified" else "the role"
        company_phrase = f" at {job.company}" if job.company and job.company != "Not specified" else ""
        skills_phrase = (
            f" Key required skills include {', '.join(job.required_skills[:4])}."
            if job.required_skills else ""
        )
        return (
            f"I have scanned the job posting for {title}{company_phrase}.{skills_phrase} "
            f"Please upload your resume so I can evaluate your fit and tell you exactly what you're missing!"
        )


job_crawler = JobCrawler()
