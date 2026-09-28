"""Entry point: ``python -m doubao2api`` or ``doubao2api`` CLI."""
from .unified_server import run_server


def main():
    run_server()


if __name__ == "__main__":
    main()
