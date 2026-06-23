from __future__ import annotations

import sys
import unittest
from pathlib import Path

SCRAPER_DIR = Path(__file__).resolve().parents[1]
if str(SCRAPER_DIR) not in sys.path:
    sys.path.insert(0, str(SCRAPER_DIR))

from web_scraper import _extract_raw_stream_urls as extract_raw_from_web_page
from web_scraper import _make_synthetic_m3u
from web_search import _extract_raw_stream_urls as extract_raw_from_search_page
from web_search import _extract_xtream_urls


class CaptureExtractorTests(unittest.TestCase):
    def test_extract_raw_stream_urls_from_search_page(self) -> None:
        sample = """
        ffmpeg -re -i "udp://224.0.252.126:7252?overrun_nonfatal=1&fifo_size=50000000"
        NPO1 224.0.252.127 7254
        https://cdn.example.net/live/channel/manifest.mpd
        https://example.com/about
        """
        urls = extract_raw_from_search_page(sample)
        self.assertIn("udp://224.0.252.126:7252?overrun_nonfatal=1&fifo_size=50000000", urls)
        self.assertIn("udp://224.0.252.127:7254", urls)
        self.assertIn("https://cdn.example.net/live/channel/manifest.mpd", urls)
        self.assertNotIn("https://example.com/about", urls)

    def test_extract_xtream_urls_from_get_and_player_api(self) -> None:
        sample = """
        https://panel.example.com/player_api.php?username=user&password=pass
        https://panel.example.com/get.php?username=u2&password=p2&type=mpegts
        """
        urls = _extract_xtream_urls(sample)
        self.assertIn(
            "https://panel.example.com/get.php?username=user&password=pass&type=m3u_plus&output=ts",
            urls,
        )
        self.assertIn(
            "https://panel.example.com/get.php?username=u2&password=p2&type=m3u_plus&output=ts",
            urls,
        )

    def test_extract_raw_stream_urls_from_web_scraper_page(self) -> None:
        sample = """
        From Wireshark: destination 224.0.251.107 on port 8214.
        Play with ffplay rtp://224.0.0.1:5000?ttl=2
        See docs at https://example.com/help
        """
        urls = extract_raw_from_web_page(sample)
        self.assertIn("udp://224.0.251.107:8214", urls)
        self.assertIn("rtp://224.0.0.1:5000?ttl=2", urls)
        self.assertNotIn("https://example.com/help", urls)

        synthetic = _make_synthetic_m3u(urls[:2])
        self.assertTrue(synthetic.startswith("#EXTM3U"))
        self.assertIn('#EXTINF:-1 group-title="Captured"', synthetic)


if __name__ == "__main__":
    unittest.main()
