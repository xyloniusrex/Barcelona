"""Authentication: log in with a @student.upt.ro address and a verification code.

There is no separate sign-up: the first successful login with a valid student
address creates the account. Any other domain is refused.

A 6-digit code is generated per email and stored with an expiry. If SMTP is
configured (POLIGO_SMTP_* environment variables) the code is emailed; if not,
the sending step is skipped entirely and the code is returned to the client as
a dev_code so the prototype stays usable. Every failure returns a stable
machine-readable error code plus a human message, so the client can print
exactly what broke.
"""
import os
import secrets
import smtplib
import ssl
from email.message import EmailMessage

STUDENT_DOMAIN = "student.upt.ro"
CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5

SMTP_HOST = os.environ.get("POLIGO_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("POLIGO_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("POLIGO_SMTP_USER", "")
SMTP_PASS = os.environ.get("POLIGO_SMTP_PASS", "")
MAIL_FROM = os.environ.get("POLIGO_MAIL_FROM", "")


class AuthError(Exception):
    """Raised with (status, error_code, human message)."""

    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS and MAIL_FROM)


def upt_email_ok(email: str) -> bool:
    """True only for name@student.upt.ro (exactly one @, non-empty local part)."""
    local, sep, domain = email.strip().lower().rpartition("@")
    return bool(sep) and bool(local) and "@" not in local and " " not in email.strip() and domain == STUDENT_DOMAIN


def new_code() -> str:
    return f"{secrets.randbelow(1000000):06d}"


def send_code(email: str, code: str):
    """Send the code by email. Returns (sent: bool, detail: str).

    When SMTP is not configured the send is skipped (sent False, empty detail)
    — never raises. When it is configured, any failure raises AuthError with a
    specific code so the client sees a real error, not a black screen.
    """
    if not smtp_configured():
        return False, ""

    msg = EmailMessage()
    msg["From"] = MAIL_FROM
    msg["To"] = email
    msg["Subject"] = "PoliGo verification code"
    msg.set_content(
        f"Your PoliGo verification code is: {code}\n"
        f"Valid for {CODE_TTL_MINUTES} minutes.\n\n"
        "If you did not request this, ignore this email."
    )
    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError as e:
        raise AuthError(502, "ERR_SMTP_AUTH", f"mail server rejected credentials: {e}")
    except (smtplib.SMTPException, TimeoutError, ConnectionError) as e:
        raise AuthError(502, "ERR_SMTP_SEND", f"could not reach mail server: {e}")
    except OSError as e:
        raise AuthError(502, "ERR_SMTP_UNREACHABLE", f"network error while sending: {e}")
    return True, ""
