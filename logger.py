#!/usr/bin/env python3
"""
Logging configuration for the analytics pipeline.
Provides structured logging with file and console output.
"""

import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional


def setup_logger(name: str = "auto6", log_dir: Optional[Path] = None, level: int = logging.INFO) -> logging.Logger:
    """
    Set up a logger with both file and console handlers.

    Args:
        name: Logger name
        log_dir: Directory for log files (if None, uses current directory)
        level: Logging level (default INFO)

    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Clear existing handlers
    logger.handlers.clear()

    # Create formatters
    detailed_formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    console_formatter = logging.Formatter(
        fmt='[%(levelname)s] %(message)s'
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # File handler (if log_dir specified)
    if log_dir:
        log_dir = Path(log_dir)
        log_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"auto6_{timestamp}.log"

        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)  # File gets all messages
        file_handler.setFormatter(detailed_formatter)
        logger.addHandler(file_handler)

        logger.info(f"Logging to file: {log_file}")

    return logger


def get_logger(name: str = "auto6") -> logging.Logger:
    """Get existing logger or create new one."""
    return logging.getLogger(name)
