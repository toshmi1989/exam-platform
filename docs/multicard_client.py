import os
import time
import hashlib
import logging
from datetime import datetime
from typing import Optional, Dict, Any

import requests

logger = logging.getLogger(__name__)

# =====================================================
# ENV CONFIG
# =====================================================
MULTICARD_BASE_URL = os.environ.get("MULTICARD_BASE_URL", "https://mesh.multicard.uz").rstrip("/")
MULTICARD_APPLICATION_ID = os.environ.get("MULTICARD_APPLICATION_ID", "").strip()
MULTICARD_SECRET = os.environ.get("MULTICARD_SECRET", "").strip()
MULTICARD_STORE_ID = int(os.environ.get("MULTICARD_STORE_ID", "0"))

AUTH_URL = f"{MULTICARD_BASE_URL}/auth"
PAYMENT_URL = f"{MULTICARD_BASE_URL}/payment"

if not MULTICARD_APPLICATION_ID or not MULTICARD_SECRET or not MULTICARD_STORE_ID:
    raise RuntimeError("MULTICARD env vars are not set correctly")

# =====================================================
# AUTH CACHE
# =====================================================
_auth_cache = {
    "token": None,
    "expires_at": 0.0,
}

def _parse_expired_at(value: Optional[str]) -> float:
    """
    Multicard sometimes returns expired_at like "YYYY-MM-DD HH:MM:SS".
    """
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").timestamp()
    except Exception:
        return 0.0


def get_token(force: bool = False) -> str:
    now = time.time()

    # cached token still valid
    if (
        not force
        and _auth_cache["token"]
        and (_auth_cache["expires_at"] - 15) > now
    ):
        return _auth_cache["token"]

    resp = requests.post(
        AUTH_URL,
        json={
            "application_id": MULTICARD_APPLICATION_ID,
            "secret": MULTICARD_SECRET,
        },
        timeout=15,
    )

    if not resp.ok:
        logger.error("[Multicard] auth failed %s %s", resp.status_code, resp.text)
        resp.raise_for_status()

    data = resp.json()
    token = data.get("access_token") or data.get("token")
    expires_at = _parse_expired_at(data.get("expired_at"))

    if not token:
        raise RuntimeError(f"Invalid auth response: {data}")

    _auth_cache["token"] = token
    _auth_cache["expires_at"] = expires_at or (now + 600)

    logger.info("[Multicard] token refreshed, exp=%s", _auth_cache["expires_at"])
    return token


# =====================================================
# PAYMENT
# =====================================================
def create_payment(
    *,
    amount: int,                 # ❗ ТИЙИНЫ
    invoice_id: str,
    payment_system: str,
    return_url: str,
    callback_url: str,
    lang: str = "ru",
    billing_id: str | None = None,
) -> Dict[str, Any]:
    token = get_token()

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    payload: Dict[str, Any] = {
        "store_id": MULTICARD_STORE_ID,
        "amount": int(amount),
        "invoice_id": str(invoice_id),
        "payment_system": str(payment_system),
        "return_url": str(return_url),
        "callback_url": str(callback_url),
        "lang": str(lang),
        "details": {
            "invoice_id": str(invoice_id)
        },
    }

    if billing_id:
        payload["billing_id"] = str(billing_id)

    logger.info("[Multicard] create_payment payload=%s", payload)

    r = requests.post(PAYMENT_URL, json=payload, headers=headers, timeout=20)

    # if token expired mid-flight -> retry once
    if r.status_code == 401:
        logger.warning("[Multicard] 401 on create_payment, refreshing token and retrying once")
        token = get_token(force=True)
        headers["Authorization"] = f"Bearer {token}"
        r = requests.post(PAYMENT_URL, json=payload, headers=headers, timeout=20)

    if not r.ok:
        raise RuntimeError(f"Multicard error {r.status_code}: {r.text}")

    data = r.json()

    # Some APIs return {success:true,data:{...}}
    # If they return straight object - we keep it too.
    if isinstance(data, dict) and data.get("success") is False:
        raise RuntimeError(f"Multicard rejected payment: {data}")

    # normalize result
    if isinstance(data, dict) and "data" in data and data.get("success") is True:
        return data["data"]

    return data

def get_payment_info(payment_uuid: str) -> dict:
    """
    Запрашивает статус платежа по uuid через Multicard API.
    Используется как fallback, если sign не сошёлся.
    """
    if not payment_uuid:
        raise ValueError("payment_uuid is empty")

    token = get_token()

    # ✅ правильный URL
    url = f"{MULTICARD_BASE_URL}/payment/{payment_uuid}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    resp = requests.get(url, headers=headers, timeout=20)

    # если токен умер -> обновим и повторим 1 раз
    if resp.status_code == 401:
        token = get_token(force=True)
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.get(url, headers=headers, timeout=20)

    resp.raise_for_status()
    return resp.json()


# =====================================================
# CALLBACK SIGN VERIFY (FIXED)
# =====================================================
def verify_callback_sign_payload(payload: dict, secret: str) -> bool:
    """
    Multicard callback sign check:
    1) берем payload без sign
    2) убираем пустые поля
    3) сортируем ключи
    4) key=value&... + secret
    5) md5
    """
    if not payload or not isinstance(payload, dict):
        return False

    got_sign = str(payload.get("sign") or "").strip().lower()
    if not got_sign:
        return False

    if not secret:
        return False

    # исключаем sign
    data = {k: payload.get(k) for k in payload.keys() if k != "sign"}

    # выкидываем None/"" поля
    cleaned = {}
    for k, v in data.items():
        if v is None:
            continue
        v_str = str(v).strip()
        if v_str == "":
            continue
        cleaned[k] = v_str

    # сортировка
    parts = [f"{k}={cleaned[k]}" for k in sorted(cleaned.keys())]

    base = "&".join(parts) + secret

    md5_calc = hashlib.md5(base.encode("utf-8")).hexdigest().lower()

    return md5_calc == got_sign
