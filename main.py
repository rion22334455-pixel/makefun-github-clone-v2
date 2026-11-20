#!/usr/bin/env python3
"""Python entrypoint that delegates to the existing Node.js application."""

import os
import shutil
import sys
from pathlib import Path


def main() -> int:
    node = shutil.which("node")
    if node is None:
        print("main.py requires Node.js to run main.ts, but node was not found on PATH.", file=sys.stderr)
        return 1

    entry = Path(__file__).resolve().with_name("main.ts")
    if not entry.is_file():
        print(f"Node.js entrypoint was not found: {entry}", file=sys.stderr)
        return 1

    os.execv(node, [node, "--experimental-strip-types", str(entry)])
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
