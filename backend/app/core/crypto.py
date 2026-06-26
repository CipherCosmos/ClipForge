"""Reversible encryption for sensitive fields (access tokens, etc.).

Uses Fernet (AES-128-CBC + HMAC-SHA256) with a key derived from JWT_SECRET.
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


def _get_fernet() -> Fernet:
    """Derive a Fernet key from the JWT secret.

    Fernet requires a 32-byte URL-safe base64 key.
    SHA-256 of the JWT secret gives exactly 32 bytes.
    """
    digest = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token for DB storage."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token retrieved from DB."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
