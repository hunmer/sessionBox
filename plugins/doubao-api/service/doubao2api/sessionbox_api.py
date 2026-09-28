"""Backward-compatible import path for the standalone :mod:`sessionbox` package."""

from sessionbox import SessionBoxClient, SessionBoxError

__all__ = ["SessionBoxClient", "SessionBoxError"]
