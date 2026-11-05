"""Supabase Storage REST client — reuses sb.py's persistent requests.Session (same host, same
connection-pooling benefit — see that file's docstring) instead of opening a fresh connection per
call. Used for third-party verification document attachments and (since Phase 10) profile photos;
every bucket here is private, so files are fetched via short-lived signed URLs, never a public
link.
"""
from sb import session
from config import config

BUCKET = "verification-documents"


class StorageError(RuntimeError):
    pass


def _base():
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise StorageError("SUPABASE_URL / SUPABASE_SERVICE_KEY not configured")
    return config.SUPABASE_URL.rstrip("/") + "/storage/v1"


def _headers(extra=None):
    h = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
    }
    if extra:
        h.update(extra)
    return h


def upload(path, data, content_type, bucket=BUCKET):
    """Uploads (or overwrites, via upsert) a file to `bucket` at `path`. Returns the path on
    success. `bucket` defaults to the original verification-documents bucket — profile photos
    (Phase 10) reuse it too rather than provisioning new storage infrastructure, just under a
    different path prefix."""
    url = f"{_base()}/object/{bucket}/{path}"
    resp = session.post(url, data=data, headers=_headers({"Content-Type": content_type, "x-upsert": "true"}), timeout=30)
    if resp.status_code >= 400:
        raise StorageError(f"upload {path} -> {resp.status_code}: {resp.text[:300]}")
    return path


def signed_url(path, expires_in=300, bucket=BUCKET):
    """A time-limited URL for downloading a private object — never a permanent/public link.
    Callers whose object renders inline and repeatedly (e.g. a profile photo `<img>`, vs. a one-
    off document download link) should pass a longer `expires_in`."""
    url = f"{_base()}/object/sign/{bucket}/{path}"
    resp = session.post(url, json={"expiresIn": expires_in}, headers=_headers({"Content-Type": "application/json"}), timeout=15)
    if resp.status_code >= 400:
        raise StorageError(f"sign {path} -> {resp.status_code}: {resp.text[:300]}")
    out = resp.json()
    signed = out.get("signedURL") or out.get("signedUrl")
    if not signed:
        raise StorageError(f"no signed URL returned for {path}: {out}")
    return config.SUPABASE_URL.rstrip("/") + "/storage/v1" + signed


def delete(path, bucket=BUCKET):
    url = f"{_base()}/object/{bucket}/{path}"
    resp = session.delete(url, headers=_headers(), timeout=15)
    if resp.status_code >= 400:
        raise StorageError(f"delete {path} -> {resp.status_code}: {resp.text[:300]}")
