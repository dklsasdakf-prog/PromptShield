#!/usr/bin/env python3
"""Bootstrap OpenSearch indices and templates used by the backend."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.api.services.opensearch import get_opensearch_service  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Install OpenSearch templates and ensure org index exists.")
    parser.add_argument("--org", dest="org_id", default="ORG-TEST", help="Organization identifier to bootstrap")
    parser.add_argument(
        "--force-template",
        dest="force_template",
        action="store_true",
        help="Reinstall the index template and ILM policy even if they already exist.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    service = get_opensearch_service()
    index = service.bootstrap_org(args.org_id, force_template=args.force_template)
    print(f"OS index ready: {index}")


if __name__ == "__main__":
    main()
