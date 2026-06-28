import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_HTML_HEAD = (
    '<head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
)
_BODY_STYLE = (
    "margin:0;padding:0;background-color:#f4f4f4;"
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
)
_OUTER_TABLE_STYLE = "background-color:#f4f4f4;padding:40px 0"
_INNER_TABLE_STYLE = (
    "background-color:#ffffff;border-radius:12px;"
    "overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)"
)
_CELL_STYLE = "padding:40px 32px 32px;text-align:center"
_LINK_STYLE = (
    "display:inline-block;padding:14px 32px;background-color:#6366f1;"
    "color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600"
)


def _html_template(content: str) -> str:
    return (
        "<!DOCTYPE html>\n<html>\n"
        f"{_HTML_HEAD}\n"
        f'<body style="{_BODY_STYLE}">\n'
        f'<table role="presentation" width="100%" cellpadding="0"'
        f' cellspacing="0" style="{_OUTER_TABLE_STYLE}">\n'
        '<tr><td align="center">\n'
        f'<table role="presentation" width="480" cellpadding="0"'
        f' cellspacing="0" style="{_INNER_TABLE_STYLE}">\n'
        f'<tr><td style="{_CELL_STYLE}">\n'
        f"{content}"
        "</td></tr>\n</table>\n</td></tr>\n</table>\n</body>\n</html>"
    )


def _build_resend_payload(to: str, subject: str, html: str) -> dict:
    return {
        "from": settings.FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html,
    }


def _build_sendgrid_payload(to: str, subject: str, html: str) -> dict:
    return {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": settings.FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/html", "value": html}],
    }


async def send_email(to: str, subject: str, html: str) -> bool:
    provider = settings.EMAIL_PROVIDER.lower()

    try:
        if provider == "sendgrid":
            if not settings.SENDGRID_API_KEY:
                logger.warning("SendGrid API key not configured, skipping email to %s", to)
                return False
            payload = _build_sendgrid_payload(to, subject, html)
            headers = {
                "Authorization": f"Bearer {settings.SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                logger.info("Email sent via SendGrid to %s: %s", to, subject)
                return True

        else:
            if not settings.RESEND_API_KEY:
                logger.warning("Resend API key not configured, skipping email to %s", to)
                return False
            payload = _build_resend_payload(to, subject, html)
            headers = {
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                logger.info("Email sent via Resend to %s: %s", to, subject)
                return True

    except httpx.HTTPStatusError as e:
        logger.error(
            "Email provider returned error for %s: %s - %s",
            to,
            e.response.status_code,
            e.response.text,
        )
    except httpx.RequestError as e:
        logger.error("Email request failed for %s: %s", to, str(e))
    except Exception as e:
        logger.error("Unexpected email error for %s: %s", to, str(e))

    return False


def _verification_html(token: str) -> str:
    url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    content = (
        '<h1 style="margin:0 0 8px;font-size:24px;color:#1a1a2e;font-weight:700">'
        "Welcome to ClipForge</h1>\n"
        '<p style="margin:0 0 24px;font-size:16px;color:#666;line-height:1.5">'
        "Please verify your email address to get started.</p>\n"
        f'<a href="{url}" style="{_LINK_STYLE}">Verify Email</a>\n'
        '<p style="margin:24px 0 0;font-size:14px;color:#999">'
        "Or copy this link into your browser:</p>\n"
        f'<p style="margin:4px 0 0;font-size:13px;color:#6366f1;word-break:break-all">'
        f"{url}</p>\n"
        '<p style="margin:24px 0 0;font-size:13px;color:#999">'
        "This link expires in 24 hours. If you didn't create an account,"
        " ignore this email.</p>"
    )
    return _html_template(content)


def _password_reset_html(token: str) -> str:
    url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    content = (
        '<h1 style="margin:0 0 8px;font-size:24px;color:#1a1a2e;font-weight:700">'
        "Reset Your Password</h1>\n"
        '<p style="margin:0 0 24px;font-size:16px;color:#666;line-height:1.5">'
        "Click the button below to set a new password for your ClipForge account.</p>\n"
        f'<a href="{url}" style="{_LINK_STYLE}">Reset Password</a>\n'
        '<p style="margin:24px 0 0;font-size:14px;color:#999">'
        "Or copy this link into your browser:</p>\n"
        f'<p style="margin:4px 0 0;font-size:13px;color:#6366f1;word-break:break-all">'
        f"{url}</p>\n"
        '<p style="margin:24px 0 0;font-size:13px;color:#999">'
        "This link expires in 1 hour. If you didn't request a reset,"
        " ignore this email.</p>"
    )
    return _html_template(content)


def _welcome_html() -> str:
    content = (
        '<h1 style="margin:0 0 8px;font-size:24px;color:#1a1a2e;font-weight:700">'
        "Welcome to ClipForge!</h1>\n"
        '<p style="margin:0 0 8px;font-size:16px;color:#666;line-height:1.5">'
        "Your account is ready. Start uploading videos and let AI find your"
        " viral moments.</p>\n"
        '<p style="margin:0 0 24px;font-size:16px;color:#666;line-height:1.5">'
        "Upload a video, and we'll handle transcription, viral scoring,"
        " and clip rendering automatically.</p>\n"
        f'<a href="{settings.FRONTEND_URL}" style="{_LINK_STYLE}">Get Started</a>'
    )
    return _html_template(content)


async def send_verification_email(user_email: str, token: str) -> bool:
    html = _verification_html(token)
    return await send_email(user_email, "Verify your ClipForge email", html)


async def send_password_reset_email(user_email: str, token: str) -> bool:
    html = _password_reset_html(token)
    return await send_email(user_email, "Reset your ClipForge password", html)


async def send_welcome_email(user_email: str) -> bool:
    html = _welcome_html()
    return await send_email(user_email, "Welcome to ClipForge!", html)
