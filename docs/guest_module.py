import os
import uuid
import sqlite3
import hashlib
from datetime import datetime, timedelta
from multicard_client import create_payment, verify_callback_sign_payload, get_payment_info


from flask import (
    Blueprint,
    request,
    jsonify,
    session,
    redirect,
    current_app,
)

# ==========================================================
# CONFIG
# ==========================================================
BASE_DIR = os.path.dirname(__file__)
DATABASE = os.path.join(BASE_DIR, "app.db")

PRICE_SUM = 5000
AMOUNT_TIYIN = PRICE_SUM * 100
GUEST_ACCESS_TTL_MIN = 60

MULTICARD_STORE_ID = int(os.environ["MULTICARD_STORE_ID"])

guest_bp = Blueprint("guest", __name__)


# ==========================================================
# DB
# ==========================================================
def _db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def _now():
    return datetime.utcnow()

# ==========================================================
# ANTISHARING
# ==========================================================
def _fingerprint(req):
    ua = (req.headers.get("User-Agent") or "").strip()
    ip = (
        req.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or req.remote_addr
        or ""
    )
    return hashlib.sha256(f"{ua}|{ip}".encode()).hexdigest()

# ==========================================================
# PAY (создание оплаты)
# ==========================================================
@guest_bp.post("/pay/<ps>")
def guest_pay(ps):
    try:
        ps = (ps or "").lower()
        ALLOWED_PS = {"click", "payme", "uzum", "xazna", "anorbank", "alif"}
        if ps not in ALLOWED_PS:
            return jsonify({"error": "invalid_payment_system"}), 400

        invoice_id = str(uuid.uuid4())
        token = str(uuid.uuid4())

        # ❗ ВАЖНО:
        # на этапе создания инвойса НЕ надо фиксировать fp/ip строго,
        # потому что платежный шлюз и возврат могут идти с других IP/UA
        conn = _db()
        conn.execute(
            """
            INSERT INTO guest_access (token, invoice_id, status)
            VALUES (?, ?, 'created')
            """,
            (token, invoice_id),
        )
        conn.commit()
        conn.close()

        current_app.logger.info(
            "[GUEST PAY] invoice=%s ps=%s amount_tiyin=%s",
            invoice_id, ps, AMOUNT_TIYIN
        )

        payment = create_payment(
            amount=AMOUNT_TIYIN,
            invoice_id=invoice_id,
            payment_system=ps,
            lang="ru",
            billing_id=f"guest:{invoice_id}",
            return_url=f"https://pay.kategoriyatest.uz/guest/enter?externalId={invoice_id}",
            callback_url="https://pay.kategoriyatest.uz/guest/multicard/callback",
        )

        checkout_url = payment.get("checkout_url") or payment.get("check_url")
        if not checkout_url:
            raise RuntimeError(f"No checkout_url in response: {payment}")

        # ✅ опционально сохраним uuid от multicard для дебага
        mc_uuid = payment.get("uuid")
        if mc_uuid:
            try:
                conn = _db()
                conn.execute(
                    "UPDATE guest_access SET mc_uuid=? WHERE invoice_id=?",
                    (mc_uuid, invoice_id),
                )
                conn.commit()
                conn.close()
            except Exception:
                pass

        return jsonify({
            "checkout_url": checkout_url,
            "invoice_id": invoice_id,
        })

    except Exception:
        current_app.logger.exception("❌ GUEST PAY FAILED")
        return jsonify({"error": "payment_failed"}), 500

# ==========================================================
# MULTICARD CALLBACK (ЕДИНЫЙ, БЕЗ 4xx)
# ==========================================================
@guest_bp.post("/multicard/callback")
def multicard_callback():
    """
    Multicard webhook:
    - НИКОГДА не отдаём 4xx/5xx (иначе Multicard будет ретраить)
    - Сначала пытаемся проверить sign (правильный порядок значений)
    - Если sign не сошёлся -> проверяем статус через API по uuid (fallback)
    - Если платёж оплачен -> ставим paid в guest_access
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
    except Exception:
        return "ok", 200

    current_app.logger.warning("🔔 [Multicard CALLBACK] raw=%s", data)

    invoice_id = str(data.get("invoice_id") or "").strip()
    uuid_ = str(data.get("uuid") or "").strip()
    billing_id = str(data.get("billing_id") or "").strip()
    ps = str(data.get("ps") or "").strip()

    try:
        amount = int(data.get("amount") or 0)
    except Exception:
        amount = 0

    got_sign = str(data.get("sign") or "").strip().lower()

    if not invoice_id:
        current_app.logger.warning("[Multicard CALLBACK] missing invoice_id")
        return "ok", 200

    secret = os.environ.get("MULTICARD_SECRET", "").strip()

    # -------------------------------------------------
    # 1) TRY LOCAL SIGN VERIFY (Multicard-style)
    # -------------------------------------------------
    sign_ok = False
    candidates = {}

    if secret and got_sign:
        try:
            # Multicard подписывает КОНКАТ значений в фиксированном порядке
            # включая пустые поля (None -> "")
            fields_order = [
                "store_id",
                "amount",
                "invoice_id",
                "invoice_uuid",
                "billing_id",
                "payment_time",
                "phone",
                "card_pan",
                "card_token",
                "ps",
                "uuid",
                "receipt_url",
            ]

            values = []
            for k in fields_order:
                v = data.get(k)
                if v is None:
                    v = ""
                values.append(str(v))

            base = "".join(values) + secret

            md5_calc = hashlib.md5(base.encode("utf-8")).hexdigest().lower()
            sha1_calc = hashlib.sha1(base.encode("utf-8")).hexdigest().lower()

            candidates = {"md5": md5_calc, "sha1": sha1_calc}

            if got_sign in (md5_calc, sha1_calc):
                sign_ok = True

        except Exception:
            current_app.logger.exception("❌ sign verify crashed")

    if not sign_ok:
        current_app.logger.warning(
            "❌ Multicard sign INVALID | invoice=%s uuid=%s amount=%s got_sign=%s billing_id=%s ps=%s | candidates=%s",
            invoice_id, uuid_, amount, got_sign, billing_id, ps, candidates
        )

    # -------------------------------------------------
    # 2) DETERMINE PAID (sign ok OR API fallback)
    # -------------------------------------------------
    is_paid = False

    if sign_ok:
        is_paid = True
    else:
        # fallback: проверяем через API по uuid
        if uuid_:
            try:
                verify_resp = get_payment_info(uuid_)
                current_app.logger.warning("🔎 Multicard API verify response=%s", verify_resp)

                payload = None
                if isinstance(verify_resp, dict):
                    payload = verify_resp.get("data") or verify_resp

                status = str((payload or {}).get("status") or "").strip().lower()

                # ✅ ВАЖНО: у Multicard часто статус "billing" даже после успешной оплаты
                if status in ("paid", "success", "completed", "billing"):
                    is_paid = True
                else:
                    current_app.logger.warning("⚠️ Multicard API status is not paid: %s", status)

            except Exception:
                current_app.logger.exception("❌ Multicard API verify crashed")

    # -------------------------------------------------
    # 3) UPDATE DB
    # -------------------------------------------------
    if is_paid:
        try:
            conn = _db()
            row = conn.execute(
                "SELECT status FROM guest_access WHERE invoice_id=?",
                (invoice_id,),
            ).fetchone()

            if not row:
                conn.close()
                current_app.logger.warning("[Multicard CALLBACK] invoice not found: %s", invoice_id)
                return "ok", 200

            if (row["status"] or "").lower() != "paid":
                conn.execute(
                    "UPDATE guest_access SET status='paid', paid_at=? WHERE invoice_id=?",
                    (_now().isoformat(), invoice_id),
                )
                conn.commit()

            conn.close()

            current_app.logger.warning(
                "✅ Multicard PAID invoice=%s uuid=%s amount=%s",
                invoice_id, uuid_, amount
            )

        except Exception:
            current_app.logger.exception("DB error in multicard callback (paid)")

    return "ok", 200



def _mark_guest_paid(invoice_id: str, uuid_: str, amount: int):
    try:
        conn = _db()
        row = conn.execute(
            "SELECT status FROM guest_access WHERE invoice_id=?",
            (invoice_id,),
        ).fetchone()

        if not row:
            conn.close()
            current_app.logger.warning("[Multicard CALLBACK] invoice not found: %s", invoice_id)
            return

        if (row["status"] or "").lower() != "paid":
            conn.execute(
                "UPDATE guest_access SET status='paid', paid_at=? WHERE invoice_id=?",
                (_now().isoformat(), invoice_id),
            )
            conn.commit()

        conn.close()

        current_app.logger.warning(
            "✅ Multicard PAID invoice=%s uuid=%s amount=%s",
            invoice_id, uuid_, amount
        )
    except Exception:
        current_app.logger.exception("DB error in multicard callback (paid)")


# ==========================================================
# HELPERS: помечаем paid/canceled отдельно (чтобы callback был чистый)
# ==========================================================



def _mark_guest_canceled(invoice_id: str):
    try:
        conn = _db()
        conn.execute(
            "UPDATE guest_access SET status='canceled' WHERE invoice_id=?",
            (invoice_id,),
        )
        conn.commit()
        conn.close()
    except Exception:
        current_app.logger.exception("DB error in _mark_guest_canceled")



# ==========================================================
# ENTER (после оплаты)
# ==========================================================
# ==========================================================
# ENTER (после оплаты) -> сразу на выбор профессии (Home.vue)
# ==========================================================
@guest_bp.get("/enter")
def guest_enter():
    invoice_id = (request.args.get("externalId") or "").strip()
    if not invoice_id:
        return "externalId required", 400

    conn = _db()
    row = conn.execute(
        "SELECT token, status, expires_at, used_at FROM guest_access WHERE invoice_id=?",
        (invoice_id,),
    ).fetchone()

    if not row:
        conn.close()
        return "Not Found", 404

    token = row["token"]
    status = (row["status"] or "").lower()

    if status != "paid":
        conn.close()
        return "Payment not completed", 402

    if row["used_at"]:
        conn.close()
        return "Already used", 403

    # ✅ вот здесь уже можно безопасно фиксировать fingerprint/ip первого входа
    try:
        fp = _fingerprint(request)
        ip = request.remote_addr or ""
        conn.execute(
            "UPDATE guest_access SET fp_hash=?, first_ip=? WHERE invoice_id=?",
            (fp, ip, invoice_id),
        )
        conn.commit()
    except Exception:
        pass

    conn.close()

    # ✅ ставим гостевую сессию
    session.clear()
    session["guest"] = True
    session["guest_token"] = token
    session["guest_invoice_id"] = invoice_id
    session["user_id"] = f"guest_{invoice_id}"
    session["username"] = f"guest_{token[:8]}"
    session["subscription"] = {"active": True, "guest": True}

    # ✅ улетаем на Home.vue => выбор профессии/специальности
    # ✅ после оплаты улетаем на Home.vue (frontend)
    # важно: это ДОМЕН фронта, а не pay.kategoriyatest.uz
    return redirect(f"https://medtoifa.uz/?guest=1&invoice={invoice_id}")




# ==========================================================
# HELPERS (используются app.py)
# ==========================================================
def guest_validate_session() -> bool:
    if not session.get("guest"):
        return False

    token = session.get("guest_token")
    if not token:
        return False

    conn = _db()
    row = conn.execute(
        "SELECT * FROM guest_access WHERE token=?",
        (token,),
    ).fetchone()
    conn.close()

    if not row or row["used_at"]:
        return False

    if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) < _now():
        return False

    return row["fp_hash"] == _fingerprint(request)


def guest_mark_used():
    token = session.get("guest_token")
    if not token:
        return

    conn = _db()
    conn.execute(
        "UPDATE guest_access SET used_at=? WHERE token=?",
        (_now().isoformat(), token),
    )
    conn.commit()
    conn.close()
    session.clear()
